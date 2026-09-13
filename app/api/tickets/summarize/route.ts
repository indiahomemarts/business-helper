import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { summarizeAndSuggestReplies, updateRollingSummary } from "@/lib/gemini";

export async function POST(req: NextRequest) {
  try {
    const { ticket_id } = await req.json();
    if (!ticket_id) {
      return NextResponse.json({ error: "ticket_id is required" }, { status: 400 });
    }

    const [summaryRes, messagesRes] = await Promise.all([
      supabaseServer
        .from("chat_thread_summary")
        .select("*")
        .eq("ticket_id", ticket_id)
        .maybeSingle(),
      supabaseServer
        .from("chat_history")
        .select("sender, message, sent_at")
        .eq("ticket_id", ticket_id)
        .order("sent_at", { ascending: true }),
    ]);

    if (messagesRes.error) throw messagesRes.error;

    const allMessages = messagesRes.data || [];
    const previousSummary = summaryRes.data?.rolling_summary || null;
    const lastUpdated = summaryRes.data?.last_updated
      ? new Date(summaryRes.data.last_updated)
      : null;

    // Only fold in messages that arrived after the last time we summarized,
    // so we don't keep re-paying to summarize the same old messages.
    const newMessages = lastUpdated
      ? allMessages.filter((m) => new Date(m.sent_at) > lastUpdated)
      : allMessages;

    let rollingSummary = previousSummary || "";
    if (newMessages.length > 0) {
      rollingSummary = await updateRollingSummary(previousSummary, newMessages);
      await supabaseServer.from("chat_thread_summary").upsert({
        ticket_id,
        rolling_summary: rollingSummary,
        last_updated: new Date().toISOString(),
      });
    }

    // Reply suggestions are generated from the most recent handful of
    // messages plus the rolling summary, not the full raw history.
    const recentMessages = allMessages.slice(-6);
    const result = await summarizeAndSuggestReplies(rollingSummary, recentMessages);

    return NextResponse.json(result);
  } catch (err: any) {
    console.error(err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
