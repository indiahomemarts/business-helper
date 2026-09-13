import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const { data: orders, error } = await supabaseServer
      .from("orders")
      .select("*")
      .not("rto_status", "is", null)
      .order("last_seen_at", { ascending: false });

    if (error) throw error;

    const { data: inwarded, error: inwardErr } = await supabaseServer
      .from("rto_inward_log")
      .select("awb_number, scanned_at");
    if (inwardErr) throw inwardErr;

    const inwardMap = new Map((inwarded || []).map((r) => [r.awb_number, r.scanned_at]));

    const enriched = (orders || []).map((o) => ({
      ...o,
      inwarded_at: inwardMap.get(o.awb_number) || null,
      needs_inward:
        ["RTO_DELIVERED", "DELIVERED"].includes(o.rto_status || "") &&
        !inwardMap.has(o.awb_number),
    }));

    return NextResponse.json({ orders: enriched });
  } catch (err: any) {
    console.error(err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
