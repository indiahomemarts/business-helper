import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";

export async function POST(req: NextRequest) {
  try {
    const { awb_number, otp_code } = await req.json();
    if (!awb_number || !otp_code) {
      return NextResponse.json(
        { error: "awb_number and otp_code are required" },
        { status: 400 }
      );
    }

    const { data: challenge, error: fetchErr } = await supabaseServer
      .from("rto_otp_challenges")
      .select("*")
      .eq("awb_number", awb_number)
      .maybeSingle();

    if (fetchErr) throw fetchErr;
    if (!challenge) {
      return NextResponse.json(
        { error: "No pending OTP for this AWB. Tap \"Mark as received\" again." },
        { status: 400 }
      );
    }
    if (new Date(challenge.expires_at).getTime() < Date.now()) {
      return NextResponse.json({ error: "OTP expired. Request a new one." }, { status: 400 });
    }
    if (challenge.otp_code !== otp_code) {
      return NextResponse.json({ error: "Incorrect code." }, { status: 400 });
    }

    const { error: insertErr } = await supabaseServer.from("rto_inward_log").upsert({
      awb_number,
      otp_verified: true,
    });
    if (insertErr) throw insertErr;

    await supabaseServer.from("rto_otp_challenges").delete().eq("awb_number", awb_number);

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error(err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
