import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const { initial_total } = await req.json();
    const count = parseInt(String(initial_total), 10);
    if (isNaN(count) || count < 0) {
      return NextResponse.json(
        { error: "Please provide a valid non-negative number" },
        { status: 400 }
      );
    }

    await Promise.all([
      supabaseServer.from("settings").upsert({
        key: "rto_initial_total",
        value: String(count),
        updated_at: new Date().toISOString(),
      }),
      supabaseServer.from("settings").upsert({
        key: "rto_baseline_date",
        value: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }),
    ]);

    return NextResponse.json({ ok: true, initial_total: count });
  } catch (err: any) {
    console.error("set-baseline error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
