import { NextRequest, NextResponse } from "next/server";

const SESSION_COOKIE = "sda_session";

export async function POST(req: NextRequest) {
  const { password } = await req.json();

  const appPassword = process.env.APP_PASSWORD;
  const sessionSecret = process.env.APP_SESSION_SECRET;

  if (!appPassword || !sessionSecret) {
    return NextResponse.json(
      { error: "Server is missing APP_PASSWORD / APP_SESSION_SECRET env vars." },
      { status: 500 }
    );
  }

  if (password !== appPassword) {
    return NextResponse.json({ error: "Wrong password." }, { status: 401 });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, sessionSecret, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 90, // 90 days — this is a personal device, not a shared kiosk
  });
  return res;
}
