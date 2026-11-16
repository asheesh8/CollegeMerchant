// Every page and API route needs a login, except the login page and the token-checked agent API.
import { NextResponse } from "next/server";
import { COOKIE, validSession } from "./lib/session.js";

export async function middleware(req) {
  const { pathname } = req.nextUrl;
  if (pathname === "/login" || pathname === "/api/login") return NextResponse.next();
  // The scheduled drafting task signs in with its own token, checked in each route.
  if (pathname.startsWith("/api/agent/")) return NextResponse.next();
  if (await validSession(req.cookies.get(COOKIE)?.value)) return NextResponse.next();
  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }
  return NextResponse.redirect(new URL("/login", req.url));
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
