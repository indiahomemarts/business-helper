import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";

export async function GET(req: NextRequest) {
  const path = req.nextUrl.searchParams.get("path");
  if (!path) {
    return NextResponse.json({ error: "path query param is required" }, { status: 400 });
  }

  // Valid for 24 hours — plenty of time to paste into a message to the
  // logistics team, without leaving the recording permanently public.
  const { data, error } = await supabaseServer.storage
    .from("ndr-recordings")
    .createSignedUrl(path, 60 * 60 * 24);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ url: data.signedUrl });
}
