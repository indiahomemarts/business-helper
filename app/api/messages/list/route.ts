import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import type { ChatMessageRow } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const ticketId = req.nextUrl.searchParams.get("ticket_id");

    const [chatRes, ticketsRes] = await Promise.all([
      ticketId
        ? supabaseServer
            .from("chat_history")
            .select("*")
            .eq("ticket_id", ticketId)
            .order("sent_at", { ascending: true })
        : supabaseServer
            .from("chat_history")
            .select("*")
            .order("sent_at", { ascending: false })
            .limit(100),
      supabaseServer.from("tickets").select("ticket_id, subject"),
    ]);

    if (chatRes.error) throw chatRes.error;

    const subjects = new Map((ticketsRes.data || []).map((t) => [t.ticket_id, t.subject]));

    const messages: ChatMessageRow[] = (chatRes.data || []).map((m) => ({
      ...m,
      subject: subjects.get(m.ticket_id) || `Ticket #${m.ticket_id}`,
    }));

    return NextResponse.json({ messages });
  } catch (err: any) {
    console.error("Messages list error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
