// "Find emails" that keeps going after you close the tab.
//
// Vercel's free plan only allows a once-a-day cron, so the job drives itself instead: each step
// answers its request right away, looks up one place in the background (after()), then calls the
// next step. The job's state lives in the database, so Stop, progress and resume work from any tab.
import crypto from "node:crypto";
import * as kv from "./kv.js";
import { findFor, listTargets } from "./portal.js";

const KEY = "find_job";
const LOCK = "find_job_lock";
const STEP_BUDGET_MS = 8000; // start another place only if this step is still young
export const STALL_MS = 2 * 60 * 1000; // no progress for this long means the chain broke

const sha = (s) => crypto.createHash("sha256").update(String(s)).digest("hex");

async function load() {
  const raw = await kv.get(KEY);
  return raw ? JSON.parse(raw) : null;
}

async function save(job) {
  await kv.set(KEY, JSON.stringify(job), { ex: 14 * 24 * 3600 });
  return job;
}

// What the Places page shows. Never includes the step secret.
export function publicJob(job) {
  if (!job) return null;
  const { secret_hash, ids, ...rest } = job;
  const stalled = job.status === "running" && Date.now() - Date.parse(job.beat_at) > STALL_MS;
  return { ...rest, left: ids.length, stalled };
}

export async function getJob() {
  return publicJob(await load());
}

export const needsFinding = (t) => t.status === "new" && t.website;

// Start (or restart) a run over every place that still needs an email. Returns the step secret.
export async function startJob() {
  const ids = (await listTargets()).filter(needsFinding).map((t) => t.id);
  const secret = crypto.randomBytes(24).toString("base64url");
  const now = new Date().toISOString();
  const job = {
    run: crypto.randomBytes(8).toString("hex"),
    secret_hash: sha(secret),
    status: ids.length ? "running" : "done",
    ids,
    total: ids.length,
    done: 0,
    found: 0,
    current: "",
    last_error: "",
    started_at: now,
    beat_at: now,
    finished_at: ids.length ? "" : now,
  };
  await save(job);
  await kv.del(LOCK);
  return { job: publicJob(job), secret };
}

export async function stopJob() {
  const job = await load();
  if (job && job.status === "running") {
    job.status = "stopped";
    job.current = "";
    job.finished_at = new Date().toISOString();
    await save(job);
  }
  return publicJob(job);
}

// A new secret for the same run, used to restart a chain that broke (a deploy, a crash).
export async function resumeJob() {
  const job = await load();
  if (!job || job.status !== "running") return null;
  const secret = crypto.randomBytes(24).toString("base64url");
  job.secret_hash = sha(secret);
  job.beat_at = new Date().toISOString();
  await save(job);
  await kv.del(LOCK);
  return { job: publicJob(job), secret };
}

// Ask the site to run the next step. That route answers at once and does the work afterwards.
export async function kickStep(origin, run, secret) {
  try {
    const res = await fetch(`${origin}/api/agent/find-job/step`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ run, secret }),
      cache: "no-store",
      signal: AbortSignal.timeout(20000),
    });
    return res.ok;
  } catch (e) {
    console.error("find job: couldn't start the next step", e);
    return false;
  }
}

export async function validStep(run, secret) {
  const job = await load();
  return Boolean(job && job.status === "running" && job.run === run && secret && sha(secret) === job.secret_hash);
}

// Look up places until this step's time is used. Returns true if another step should follow.
export async function runStep(run, { find = findFor, now = Date.now } = {}) {
  const started = now();
  // One step at a time, even if two calls race. The lock outlives the longest lookup.
  if (!(await kv.set(LOCK, run, { nx: true, ex: 90 }))) return false;
  try {
    for (;;) {
      let job = await load();
      if (!job || job.run !== run || job.status !== "running") return false;
      const id = job.ids[0];
      if (!id) {
        job.status = "done";
        job.current = "";
        job.finished_at = new Date().toISOString();
        await save(job);
        return false;
      }
      // Take it off the list first, so a lookup that crashes the step is not retried forever.
      job.ids = job.ids.slice(1);
      job.current = id;
      job.beat_at = new Date().toISOString();
      await save(job);

      let found = false;
      let error = "";
      try {
        const r = await find(id);
        found = Boolean(r.target.email);
      } catch (e) {
        error = e.message || "Lookup failed.";
      }

      // Re-read: Stop may have been pressed while we were reading the site.
      job = await load();
      if (!job || job.run !== run) return false;
      job.done += 1;
      if (found) job.found += 1;
      if (error) job.last_error = error;
      job.current = "";
      job.beat_at = new Date().toISOString();
      await save(job);
      if (job.status !== "running") return false;
      if (now() - started > STEP_BUDGET_MS) return true;
    }
  } finally {
    await kv.del(LOCK);
  }
}
