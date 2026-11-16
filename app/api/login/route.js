import { NextResponse } from "next/server";
import { COOKIE, MAX_AGE_SEC, authConfigured, makeSession, passwordMatches } from "../../../lib/session.js";

export async function POST(req) {
  if (!authConfigured()) {
    return NextResponse.json(
      { error: "Set ADMIN_PASSWORD and ACCOUNTS_KEY first (see README), then restart or redeploy." },
      { status: 503 },
    );
  }
  const { password } = await req.json().catch(() => ({}));
  if (!(await passwordMatches(password))) {
    await new Promise((r) => setTimeout(r, 1000)); // slow down guessing
    return NextResponse.json({ error: "Wrong password." }, { status: 401 });
  }
  const res = NextResponse.json({ ok: true });
  res.cookies.set(COOKIE, await makeSession(), {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE_SEC,
  });
  return res;
}
