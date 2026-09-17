import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import type { TicketRow } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const [ticketsRes, chatRes] = await Promise.all([
      supabaseServer
        .from("tickets")
        .select("*")
        .order("last_synced_at", { ascending: false }),
      supabaseServer
        .from("chat_history")
        .select("ticket_id, message, sender, sent_at")
        .order("sent_at", { ascending: true }),
    ]);

    if (ticketsRes.error) throw ticketsRes.error;

    const messagesByTicket = new Map<string, Array<{ sender: string; message: string; sent_at: string }>>();
    for (const msg of chatRes.data || []) {
      const list = messagesByTicket.get(msg.ticket_id) || [];
      list.push(msg);
      messagesByTicket.set(msg.ticket_id, list);
    }

    const tickets: TicketRow[] = (ticketsRes.data || []).map((t) => {
      const msgs = messagesByTicket.get(t.ticket_id) || [];
      const hasChat = msgs.length > 0;
      const isClosedByShopdeck = t.status === "closed" || t.is_closed_by_shopdeck === true;
      const noChatWarning = isClosedByShopdeck && !hasChat;
      const lastMsg = msgs.length > 0 ? msgs[msgs.length - 1] : null;

      return {
        ...t,
        user_status: t.user_status || "open",
        user_solved_at: t.user_solved_at || null,
        is_closed_by_shopdeck: isClosedByShopdeck,
        shopdeck_closed_at: t.closed_at || t.shopdeck_closed_at || null,
        has_chat_messages: hasChat,
        no_chat_warning: noChatWarning,
        chat_count: msgs.length,
        last_message_preview: lastMsg ? `${lastMsg.sender === "seller" ? "You" : "ShopDeck"}: ${lastMsg.message}` : null,
        last_message_at: lastMsg?.sent_at || null,
      };
    });

    return NextResponse.json({ tickets });
  } catch (err: any) {
    console.error("Tickets list error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

