import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const { data, error } = await supabaseServer
      .from("tickets")
      .select("*")
      .order("last_synced_at", { ascending: false });

    if (error) throw error;
    return NextResponse.json({ tickets: data || [] });
  } catch (err: any) {
    console.error(err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
