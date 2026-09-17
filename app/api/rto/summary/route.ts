import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import type { RtoSummary } from "@/lib/types";

export const dynamic = "force-dynamic";

/**
 * Checks if an ISO timestamp is today in Indian Standard Time (Asia/Kolkata)
 */
function isTodayIst(isoString: string | null | undefined): boolean {
  if (!isoString) return false;
  const date = new Date(isoString);
  if (isNaN(date.getTime())) return false;

  const istFormatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

  const nowIst = istFormatter.format(new Date());
  const itemIst = istFormatter.format(date);
  return nowIst === itemIst;
}

/**
 * Gets current hour in IST (0 to 23)
 */
function getIstHour(): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Kolkata",
    hour: "numeric",
    hour12: false,
  }).formatToParts(new Date());
  const hourPart = parts.find((p) => p.type === "hour");
  return hourPart ? parseInt(hourPart.value, 10) : new Date().getHours();
}

/**
 * Gets formatted IST time string e.g. "09:15 PM"
 */
function getFormattedIstTime(): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Kolkata",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  }).format(new Date());
}

export async function GET() {
  try {
    const [settingsRes, ordersRes, inwardEntriesRes, inwardLogsRes, intransitHistoryRes] =
      await Promise.all([
        supabaseServer.from("settings").select("key, value"),
        supabaseServer.from("orders").select("*").not("rto_status", "is", null),
        supabaseServer.from("rto_inward_entries").select("*"),
        supabaseServer.from("rto_inward_log").select("*"),
        supabaseServer
          .from("rto_intransit_history")
          .select("*")
          .eq("disappeared_without_delivery", true),
      ]);

    const settingsMap = Object.fromEntries(
      (settingsRes.data || []).map((s) => [s.key, s.value])
    );

    const initialBaseline = parseInt(settingsMap["rto_initial_total"] || "0", 10) || 0;
    const allRtoOrders = ordersRes.data || [];

    // Intransit parcels
    const intransitOrders = allRtoOrders.filter((o) =>
      ["RTO_IN_TRANSIT", "RTO_INITIATED", "IN_TRANSIT"].includes(o.rto_status || "")
    );

    // Delivered RTOs
    const deliveredOrders = allRtoOrders.filter((o) =>
      ["RTO_DELIVERED", "DELIVERED"].includes(o.rto_status || "")
    );

    // Delivered Today (using delivered_at or last_seen_at if marked delivered today)
    const deliveredTodayOrders = deliveredOrders.filter(
      (o) => isTodayIst(o.delivered_at) || isTodayIst(o.last_seen_at)
    );

    // Inwarded entries today
    const inwardEntries = inwardEntriesRes.data || [];
    const inwardEntriesToday = inwardEntries.filter((e) => isTodayIst(e.created_at));
    const inwardedAwbsToday = new Set(inwardEntriesToday.map((e) => e.awb_number));

    // Also include inward_log scanned today
    const inwardLogs = inwardLogsRes.data || [];
    for (const log of inwardLogs) {
      if (isTodayIst(log.scanned_at)) {
        inwardedAwbsToday.add(log.awb_number);
      }
    }

    const istHour = getIstHour();
    const isAfter7Pm = istHour >= 19; // 19:00 is 7:00 PM IST

    // Find missing delivered AWBs: ShopDeck says delivered today, but user has not inwarded today
    const missingDeliveredAwbs: string[] = [];
    for (const order of deliveredTodayOrders) {
      if (!inwardedAwbsToday.has(order.awb_number)) {
        missingDeliveredAwbs.push(order.awb_number);
      }
    }

    // In-transit dropped AWBs
    const intransitDroppedAwbs = (intransitHistoryRes.data || []).map((h) => h.awb_number);

    const totalRto = initialBaseline + allRtoOrders.length;
    const deliveredTodayCount = deliveredTodayOrders.length;
    const inwardedTodayCount = inwardedAwbsToday.size;

    const reconciliationMismatch =
      isAfter7Pm && (missingDeliveredAwbs.length > 0 || inwardedTodayCount !== deliveredTodayCount);

    const summary: RtoSummary = {
      totalRto,
      initialBaseline,
      newRtoCount: allRtoOrders.length,
      intransitCount: intransitOrders.length,
      deliveredTodayCount,
      inwardedTodayCount,
      isAfter7Pm,
      currentTimeIst: getFormattedIstTime(),
      reconciliationMismatch,
      missingDeliveredAwbs,
      intransitDroppedAwbs,
    };

    return NextResponse.json(summary);
  } catch (err: any) {
    console.error("RTO summary error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
