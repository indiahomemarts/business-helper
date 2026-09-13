import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import type { NdrCallStatus } from "@/lib/types";

const VALID_STATUSES: NdrCallStatus[] = [
  "no_answer",
  "call_disconnected",
  "refused_delivery",
  "language_barrier_wrong_number",
];

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const awbNumber = form.get("awb_number")?.toString();
    const callStatus = form.get("call_status")?.toString() as NdrCallStatus;
    const notes = form.get("notes")?.toString() || null;
    const attemptCount = form.get("attempt_count_at_call");
    const audioFile = form.get("audio") as File | null;

    if (!awbNumber || !callStatus || !VALID_STATUSES.includes(callStatus)) {
      return NextResponse.json(
        { error: "awb_number and a valid call_status are required" },
        { status: 400 }
      );
    }

    let audioFilePath: string | null = null;

    if (audioFile && audioFile.size > 0) {
      const arrayBuffer = await audioFile.arrayBuffer();
      const ext = audioFile.name.split(".").pop() || "mp3";
      const path = `${awbNumber}/${Date.now()}.${ext}`;

      const { error: uploadErr } = await supabaseServer.storage
        .from("ndr-recordings")
        .upload(path, Buffer.from(arrayBuffer), {
          contentType: audioFile.type || "audio/mpeg",
        });

      if (uploadErr) throw uploadErr;
      audioFilePath = path;
    }

    const { error } = await supabaseServer.from("ndr_logs").insert({
      awb_number: awbNumber,
      call_status: callStatus,
      notes,
      attempt_count_at_call: attemptCount ? Number(attemptCount) : null,
      audio_file_path: audioFilePath,
    });

    if (error) throw error;

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error(err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
