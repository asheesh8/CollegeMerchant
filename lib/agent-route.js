import { NextResponse } from "next/server";
import { handle } from "./http.js";
import { agentAuthorized } from "./agent.js";

// Like handle(), but the caller must present the agent token.
export async function agentHandle(req, fn) {
  if (!(await agentAuthorized(req))) return NextResponse.json({ error: "Bad or missing agent token." }, { status: 401 });
  return handle(fn);
}
