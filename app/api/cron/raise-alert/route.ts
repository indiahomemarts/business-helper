import { NextRequest, NextResponse } from "next/server";
import { isAuthorizedInternalRequest } from "@/lib/internalAuth";
import { raiseAlert } from "@/lib/push";

export async function POST(req: NextRequest) {
  if (!isAuthorizedInternalRequest(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { type, awb_number, ticket_id, title, alertBody } = body;

    if (!type || !title) {
      return NextResponse.json({ error: "type and title are required" }, { status: 400 });
    }

    await raiseAlert({ type, awb_number, ticket_id, title, body: alertBody });
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error(err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
