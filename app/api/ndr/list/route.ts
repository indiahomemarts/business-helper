import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const { data: orders, error } = await supabaseServer
      .from("orders")
      .select("*")
      .ilike("order_status", "%ndr%")
      .order("last_seen_at", { ascending: false });

    if (error) throw error;

    const awbs = (orders || []).map((o) => o.awb_number);

    const [attemptsRes, callsRes] = await Promise.all([
      supabaseServer
        .from("ndr_attempt_history")
        .select("awb_number, attempt_number")
        .in("awb_number", awbs.length ? awbs : ["__none__"]),
      supabaseServer
        .from("ndr_logs")
        .select("awb_number, called_at")
        .in("awb_number", awbs.length ? awbs : ["__none__"]),
    ]);

    const attemptsByAwb = new Map<string, number[]>();
    for (const row of attemptsRes.data || []) {
      const list = attemptsByAwb.get(row.awb_number) || [];
      list.push(row.attempt_number);
      attemptsByAwb.set(row.awb_number, list);
    }

    const calledAwbs = new Set((callsRes.data || []).map((c) => c.awb_number));

    const enriched = (orders || []).map((o) => {
      const attempts = (attemptsByAwb.get(o.awb_number) || []).sort((a, b) => a - b);
      const latest = attempts.length ? attempts[attempts.length - 1] : null;
      const isFakeAttempt = latest === 3 && !attempts.includes(1) && !attempts.includes(2);
      return {
        ...o,
        attempt_history: attempts,
        latest_attempt_number: latest,
        is_fake_attempt: isFakeAttempt,
        already_called: calledAwbs.has(o.awb_number),
      };
    });

    return NextResponse.json({ orders: enriched });
  } catch (err: any) {
    console.error(err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
