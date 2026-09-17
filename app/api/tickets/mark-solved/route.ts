import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const { ticket_id, solved } = await req.json();
    if (!ticket_id) {
      return NextResponse.json({ error: "ticket_id is required" }, { status: 400 });
    }

    const isSolved = solved !== false; // default true
    const { data, error } = await supabaseServer
      .from("tickets")
      .update({
        user_status: isSolved ? "solved" : "open",
        user_solved_at: isSolved ? new Date().toISOString() : null,
      })
      .eq("ticket_id", ticket_id)
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ ok: true, ticket: data });
  } catch (err: any) {
    console.error("mark-solved error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
