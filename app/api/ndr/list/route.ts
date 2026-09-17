import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import type { NdrLog } from "@/lib/types";

export const dynamic = "force-dynamic";

/**
 * Returns whether an ISO timestamp occurred on "today" in IST (UTC+5:30)
 */
function isTodayIst(isoString: string): boolean {
  if (!isoString) return false;
  const date = new Date(isoString);
  if (isNaN(date.getTime())) return false;

  // Convert to IST date string YYYY-MM-DD
  const istFormatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

  const nowIst = istFormatter.format(new Date());
  const logIst = istFormatter.format(date);
  return nowIst === logIst;
}

export async function GET(req: NextRequest) {
  try {
    const hideLoggedToday = req.nextUrl.searchParams.get("hide_logged_today") === "true";

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
        .select("*")
        .in("awb_number", awbs.length ? awbs : ["__none__"])
        .order("called_at", { ascending: false }),
    ]);

    const attemptsByAwb = new Map<string, number[]>();
    for (const row of attemptsRes.data || []) {
      const list = attemptsByAwb.get(row.awb_number) || [];
      list.push(row.attempt_number);
      attemptsByAwb.set(row.awb_number, list);
    }

    const logsByAwb = new Map<string, NdrLog[]>();
    for (const row of callsRes.data || []) {
      const list = logsByAwb.get(row.awb_number) || [];
      list.push(row);
      logsByAwb.set(row.awb_number, list);
    }

    let enriched = (orders || []).map((o) => {
      const attempts = (attemptsByAwb.get(o.awb_number) || []).sort((a, b) => a - b);
      const latest = attempts.length ? attempts[attempts.length - 1] : null;
      const isFakeAttempt = latest === 3 && !attempts.includes(1) && !attempts.includes(2);
      const history = logsByAwb.get(o.awb_number) || [];
      const loggedToday = history.some((h) => isTodayIst(h.called_at));

      return {
        ...o,
        attempt_history: attempts,
        latest_attempt_number: latest,
        is_fake_attempt: isFakeAttempt,
        already_called: history.length > 0,
        logged_today: loggedToday,
        call_history: history,
      };
    });

    if (hideLoggedToday) {
      enriched = enriched.filter((o) => !o.logged_today);
    }

    return NextResponse.json({ orders: enriched });
  } catch (err: any) {
    console.error("NDR list error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

