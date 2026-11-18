// Once-a-day safety net (Vercel's free cron limit): restarts a "Find emails" run whose chain broke,
// for example during a redeploy. It can only resume a run you already started.
import { NextResponse } from "next/server";
import { getJob, kickStep, resumeJob } from "../../../../../lib/findjob.js";

export const dynamic = "force-dynamic";

export async function GET(req) {
  const want = process.env.CRON_SECRET;
  if (want && req.headers.get("authorization") !== `Bearer ${want}`) {
    return NextResponse.json({ error: "Bad cron secret." }, { status: 401 });
  }
  const job = await getJob();
  if (!job?.stalled) return NextResponse.json({ resumed: false });
  const r = await resumeJob();
  const ok = r ? await kickStep(req.nextUrl.origin, r.job.run, r.secret) : false;
  return NextResponse.json({ resumed: ok });
}
