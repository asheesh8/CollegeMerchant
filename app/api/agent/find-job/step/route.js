// One step of the background "Find emails" run. Answers at once, then looks up places and calls the
// next step. Checked with the run's own secret (made when Start is pressed), not the login cookie.
import { after, NextResponse } from "next/server";
import { kickStep, runStep, validStep } from "../../../../../lib/findjob.js";

export const maxDuration = 60;

export async function POST(req) {
  const { run, secret } = await req.json().catch(() => ({}));
  if (!(await validStep(run, secret))) return NextResponse.json({ error: "Not a running job." }, { status: 401 });
  const origin = req.nextUrl.origin;
  after(async () => {
    try {
      if (await runStep(run)) await kickStep(origin, run, secret);
    } catch (e) {
      console.error("find job step failed", e);
    }
  });
  return NextResponse.json({ ok: true }, { status: 202 });
}
