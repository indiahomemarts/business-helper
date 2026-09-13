import { NextResponse } from "next/server";
import { sendPushToAllSubscribers } from "@/lib/push";

export async function POST() {
  try {
    const result = await sendPushToAllSubscribers({
      title: "Test notification",
      body: "If you can see this, push notifications are working.",
      url: "/",
    });
    return NextResponse.json(result);
  } catch (err: any) {
    console.error(err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
