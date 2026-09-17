import { NextRequest, NextResponse } from "next/server";
import {
  translateMessageToGujarati,
  getWhatsAppStyleConclusion,
  generateChatReplyDraft,
} from "@/lib/gemini";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const { action, text, messages } = await req.json();

    if (action === "translate") {
      if (!text) {
        return NextResponse.json({ error: "text is required for translation" }, { status: 400 });
      }
      const translation = await translateMessageToGujarati(text);
      return NextResponse.json({ translation });
    }

    if (action === "conclusion") {
      const msgs = messages || (text ? [{ sender: "agent", message: text }] : []);
      if (msgs.length === 0) {
        return NextResponse.json({ error: "messages or text required for conclusion" }, { status: 400 });
      }
      const conclusion = await getWhatsAppStyleConclusion(msgs);
      return NextResponse.json({ conclusion });
    }

    if (action === "generate_reply") {
      const msgs = messages || (text ? [{ sender: "agent", message: text }] : []);
      if (msgs.length === 0) {
        return NextResponse.json({ error: "messages or text required for reply generation" }, { status: 400 });
      }
      const replies = await generateChatReplyDraft(msgs);
      return NextResponse.json({ replies });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (err: any) {
    console.error("AI tools error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
