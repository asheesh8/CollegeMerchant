import { NextResponse } from "next/server";
import { UserError } from "./accounts.js";

// Run a route handler and turn errors into JSON the form can show.
export async function handle(fn) {
  try {
    return NextResponse.json(await fn());
  } catch (err) {
    if (err instanceof UserError || err instanceof SyntaxError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    console.error(err);
    return NextResponse.json({ error: err.message || "Something went wrong." }, { status: 500 });
  }
}

// Only accept JSON bodies. Browsers can't send these cross-site without CORS, which blocks CSRF.
export async function jsonBody(req) {
  if (!(req.headers.get("content-type") || "").includes("application/json")) {
    throw new UserError("Expected JSON.");
  }
  return req.json();
}
