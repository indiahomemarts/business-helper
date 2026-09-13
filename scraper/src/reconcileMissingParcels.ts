/**
 * Runs once a day (scheduled for 7:00 PM IST in the GitHub Actions workflow).
 * Compares parcels ShopDeck shows as delivered/RTO-delivered against what's
 * been physically scanned in via the RTO inwarding flow, and raises a
 * Missing Parcel alert for anything that hasn't been scanned in.
 *
 * This does NOT scrape ShopDeck itself — it reads whatever the orders/RTO
 * scrapers already wrote to Supabase earlier today, so make sure those are
 * scheduled to run before this one (see the workflow files).
 */
import { supabase } from "./supabaseClient.js";
import { raiseAlert } from "./apiClient.js";

async function main() {
  const { data: deliveredOrders, error: ordersErr } = await supabase
    .from("orders")
    .select("awb_number, customer_name")
    .in("rto_status", ["RTO_DELIVERED", "DELIVERED"]);

  if (ordersErr) {
    console.error("Failed to fetch delivered orders:", ordersErr);
    process.exitCode = 1;
    return;
  }

  const { data: inwarded, error: inwardErr } = await supabase
    .from("rto_inward_log")
    .select("awb_number");

  if (inwardErr) {
    console.error("Failed to fetch inward log:", inwardErr);
    process.exitCode = 1;
    return;
  }

  const inwardedSet = new Set((inwarded || []).map((r) => r.awb_number));
  const missing = (deliveredOrders || []).filter((o) => !inwardedSet.has(o.awb_number));

  console.log(`Checked ${deliveredOrders?.length || 0} delivered orders, ${missing.length} missing.`);

  for (const m of missing) {
    // Check we haven't already alerted on this AWB today, to avoid spamming
    // the same notification every day it stays unresolved.
    const today = new Date().toISOString().slice(0, 10);
    const { data: existingAlert } = await supabase
      .from("alerts")
      .select("id")
      .eq("type", "missing_parcel")
      .eq("awb_number", m.awb_number)
      .gte("created_at", `${today}T00:00:00Z`)
      .limit(1);

    if (existingAlert && existingAlert.length > 0) continue;

    await raiseAlert({
      type: "missing_parcel",
      awb_number: m.awb_number,
      title: `AWB ${m.awb_number} shows delivered but never scanned in`,
      alertBody: `ShopDeck shows this parcel as delivered/RTO delivered, but it hasn't been physically inwarded in your system as of 7 PM.`,
    });
  }
}

main();
