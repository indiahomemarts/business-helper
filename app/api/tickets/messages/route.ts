import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const ticketId = req.nextUrl.searchParams.get("ticket_id");
  if (!ticketId) {
    return NextResponse.json({ error: "ticket_id is required" }, { status: 400 });
  }

  try {
    const { data, error } = await supabaseServer
      .from("chat_history")
      .select("*")
      .eq("ticket_id", ticketId)
      .order("sent_at", { ascending: true });

    if (error) throw error;
    return NextResponse.json({ messages: data || [] });
  } catch (err: any) {
    console.error(err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
