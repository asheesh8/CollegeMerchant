// The Places page's "Find emails" button. The work runs on the server, so the tab can be closed.
import { handle, jsonBody } from "../../../lib/http.js";
import { getJob, kickStep, resumeJob, startJob, stopJob } from "../../../lib/findjob.js";
import { UserError } from "../../../lib/accounts.js";

export const dynamic = "force-dynamic";

export async function GET() {
  return handle(async () => ({ job: await getJob() }));
}

// { action: "start" | "stop" | "resume" }
export async function POST(req) {
  return handle(async () => {
    const { action } = await jsonBody(req);
    if (action === "stop") return { job: await stopJob() };
    if (action !== "start" && action !== "resume") throw new UserError("Unknown action.");
    if (action === "resume") {
      const cur = await getJob();
      if (!cur?.stalled) return { job: cur };
    } else {
      const cur = await getJob();
      if (cur?.status === "running" && !cur.stalled) return { job: cur };
    }
    const r = action === "start" ? await startJob() : await resumeJob();
    if (!r) return { job: await getJob() };
    if (r.job.status === "running" && !(await kickStep(req.nextUrl.origin, r.job.run, r.secret))) {
      throw new Error("Couldn't start the background lookup. Try again in a minute.");
    }
    return { job: r.job };
  });
}
