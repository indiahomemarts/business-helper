import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const [alertsRes, ndrPendingRes, deliveredOrdersRes, inwardedRes, ticketsReviewRes, settingsRes] =
      await Promise.all([
        supabaseServer
          .from("alerts")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(20),
        // Orders that show an NDR-type status but have no call log yet today
        supabaseServer
          .from("orders")
          .select("awb_number", { count: "exact", head: true })
          .ilike("order_status", "%ndr%"),
        // Orders ShopDeck shows as delivered/RTO-delivered
        supabaseServer
          .from("orders")
          .select("awb_number")
          .in("rto_status", ["RTO_DELIVERED", "DELIVERED"]),
        // AWBs already physically scanned in
        supabaseServer.from("rto_inward_log").select("awb_number"),
        supabaseServer
          .from("tickets")
          .select("ticket_id", { count: "exact", head: true })
          .eq("ai_resolution_flag", "needs_review"),
        supabaseServer
          .from("settings")
          .select("key, value")
          .in("key", ["last_scrape_orders_ndr", "last_scrape_tickets_chat", "last_scrape_ok"]),
      ]);

    const inwardedSet = new Set((inwardedRes.data || []).map((r) => r.awb_number));
    const pendingRtoInward = (deliveredOrdersRes.data || []).filter(
      (o) => !inwardedSet.has(o.awb_number)
    ).length;

    const settingsMap = Object.fromEntries(
      (settingsRes.data || []).map((s) => [s.key, s.value])
    );

    return NextResponse.json({
      alerts: alertsRes.data || [],
      counts: {
        pendingNdr: ndrPendingRes.count || 0,
        pendingRtoInward,
        ticketsNeedingReview: ticketsReviewRes.count || 0,
      },
      lastScrapeOrdersNdr: settingsMap["last_scrape_orders_ndr"] || null,
      lastScrapeTicketsChat: settingsMap["last_scrape_tickets_chat"] || null,
      lastScrapeOk: settingsMap["last_scrape_ok"] !== "false",
    });
  } catch (err: any) {
    console.error(err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
