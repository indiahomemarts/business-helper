import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const awbNumber = form.get("awb_number")?.toString().trim();
    const notes = form.get("notes")?.toString().trim() || null;
    const file = form.get("file") as File | null;

    if (!awbNumber) {
      return NextResponse.json({ error: "AWB number is required" }, { status: 400 });
    }

    let filePath: string | null = null;
    let fileName: string | null = null;
    let fileType: string | null = null;

    if (file && file.size > 0) {
      fileName = file.name;
      fileType = file.type || "application/octet-stream";
      const ext = fileName.split(".").pop() || "bin";
      const path = `${awbNumber}/${Date.now()}.${ext}`;

      try {
        const arrayBuffer = await file.arrayBuffer();
        const { data: uploadData, error: uploadErr } = await supabaseServer.storage
          .from("rto-files")
          .upload(path, Buffer.from(arrayBuffer), {
            contentType: fileType,
            upsert: true,
          });

        if (!uploadErr && uploadData) {
          const { data: publicUrlData } = supabaseServer.storage
            .from("rto-files")
            .getPublicUrl(path);
          filePath = publicUrlData.publicUrl || path;
        } else {
          console.warn("Storage upload note (using fallback):", uploadErr?.message);
          // Fallback path storage
          filePath = path;
        }
      } catch (storageErr) {
        console.warn("Storage upload exception:", storageErr);
        filePath = `local/${path}`;
      }
    }

    // Ensure order exists or record order placeholder
    await supabaseServer.from("orders").upsert(
      {
        awb_number: awbNumber,
        rto_status: "RTO_DELIVERED",
        last_seen_at: new Date().toISOString(),
      },
      { onConflict: "awb_number" }
    );

    // Insert entry into rto_inward_entries
    const { data: entry, error: insertErr } = await supabaseServer
      .from("rto_inward_entries")
      .insert({
        awb_number: awbNumber,
        file_path: filePath,
        file_name: fileName,
        file_type: fileType,
        notes: notes,
      })
      .select()
      .single();

    if (insertErr) {
      console.error("Error inserting rto_inward_entries:", insertErr);
    }

    // Also update/upsert rto_inward_log
    await supabaseServer.from("rto_inward_log").upsert(
      {
        awb_number: awbNumber,
        otp_verified: true,
        scanned_at: new Date().toISOString(),
      },
      { onConflict: "awb_number" }
    );

    return NextResponse.json({
      ok: true,
      entry: entry || {
        awb_number: awbNumber,
        file_path: filePath,
        file_name: fileName,
        notes: notes,
        created_at: new Date().toISOString(),
      },
    });
  } catch (err: any) {
    console.error("RTO inward-entry error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function GET() {
  try {
    const { data, error } = await supabaseServer
      .from("rto_inward_entries")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(50);

    if (error) throw error;
    return NextResponse.json({ entries: data || [] });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
