import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { sendPushToAllSubscribers } from "@/lib/push";

function generateOtp() {
  return String(Math.floor(100000 + Math.random() * 900000)); // 6 digits
}

export async function POST(req: NextRequest) {
  try {
    const { awb_number } = await req.json();
    if (!awb_number) {
      return NextResponse.json({ error: "awb_number is required" }, { status: 400 });
    }

    const otp = generateOtp();
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString(); // 5 minutes

    const { error } = await supabaseServer.from("rto_otp_challenges").upsert({
      awb_number,
      otp_code: otp,
      expires_at: expiresAt,
    });
    if (error) throw error;

    await sendPushToAllSubscribers({
      title: "Confirm parcel receipt",
      body: `Code for AWB ${awb_number}: ${otp} (valid 5 min)`,
      url: `/rto?awb=${awb_number}`,
    });

    return NextResponse.json({ ok: true, expiresAt });
  } catch (err: any) {
    console.error(err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
