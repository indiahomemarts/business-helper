import { NextRequest, NextResponse } from "next/server";
import { isAuthorizedInternalRequest } from "@/lib/internalAuth";
import { supabaseServer } from "@/lib/supabaseServer";
import { evaluateResolution } from "@/lib/gemini";
import { raiseAlert } from "@/lib/push";

export async function POST(req: NextRequest) {
  if (!isAuthorizedInternalRequest(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { ticket_id } = await req.json();
    if (!ticket_id) {
      return NextResponse.json({ error: "ticket_id is required" }, { status: 400 });
    }

    const { data: messages, error: msgErr } = await supabaseServer
      .from("chat_history")
      .select("sender, message, sent_at")
      .eq("ticket_id", ticket_id)
      .order("sent_at", { ascending: true });

    if (msgErr) throw msgErr;

    const fullThreadText =
      (messages || []).map((m) => `${m.sender}: ${m.message}`).join("\n") ||
      "(no messages recorded for this ticket)";

    const result = await evaluateResolution(fullThreadText);

    const { error: updateErr } = await supabaseServer
      .from("tickets")
      .update({
        ai_resolution_flag: result.flag,
        ai_resolution_reasoning: result.reasoning,
      })
      .eq("ticket_id", ticket_id);

    if (updateErr) throw updateErr;

    await raiseAlert({
      type: result.flag === "resolved" ? "ticket_resolved" : "unresolved_ticket",
      ticket_id,
      title:
        result.flag === "resolved"
          ? `Ticket #${ticket_id} closed — looks resolved`
          : `Ticket #${ticket_id} closed — check this one`,
      body: result.reasoning,
    });

    return NextResponse.json({ ok: true, ...result });
  } catch (err: any) {
    console.error(err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
