import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const { data, error } = await supabaseServer.from("settings").select("key, value");
    if (error) throw error;

    const map = Object.fromEntries((data || []).map((s) => [s.key, s.value]));
    return NextResponse.json({
      shopdeckCookieSet: Boolean(map["shopdeck_cookie"]),
      shopdeckCookieUpdatedAt: map["shopdeck_cookie_updated_at"] || null,
      lastScrapeOrdersNdr: map["last_scrape_orders_ndr"] || null,
      lastScrapeTicketsChat: map["last_scrape_tickets_chat"] || null,
      lastScrapeOk: map["last_scrape_ok"] !== "false",
    });
  } catch (err: any) {
    console.error(err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { shopdeckCookie } = await req.json();
    if (!shopdeckCookie || typeof shopdeckCookie !== "string") {
      return NextResponse.json({ error: "shopdeckCookie is required" }, { status: 400 });
    }

    const now = new Date().toISOString();
    const { error } = await supabaseServer.from("settings").upsert([
      { key: "shopdeck_cookie", value: shopdeckCookie, updated_at: now },
      { key: "shopdeck_cookie_updated_at", value: now, updated_at: now },
      { key: "last_scrape_ok", value: "true", updated_at: now },
    ]);
    if (error) throw error;

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error(err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
