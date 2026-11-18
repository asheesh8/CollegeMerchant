import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";

process.env.PORTAL_FILE = path.join(os.tmpdir(), `cm-findjob-${process.pid}.json`);
delete process.env.KV_REST_API_URL;
delete process.env.UPSTASH_REDIS_REST_URL;
const kv = await import("../lib/kv.js");
const job = await import("../lib/findjob.js");

const place = (id, status = "new") => ({ id, name: id, website: `https://${id}.edu`, status, created_at: id });

test.after(() => import("node:fs").then((fs) => fs.rmSync(process.env.PORTAL_FILE, { force: true })));

test("a run looks up every new place, survives a failed lookup, then finishes", async () => {
  await kv.hset("targets", { a: place("a"), b: place("b"), c: place("c"), d: place("d", "found") });
  const { job: j, secret } = await job.startJob();
  assert.equal(j.total, 3);
  assert.ok(await job.validStep(j.run, secret));
  assert.equal(await job.validStep(j.run, "wrong"), false);

  const seen = [];
  const find = async (id) => {
    seen.push(id);
    if (id === "b") throw new Error("site down");
    return { target: { email: id === "a" ? "info@a.edu" : "" } };
  };
  // A clock that jumps past the step budget after each place, so each step does one place.
  let t = 0;
  const now = () => (t += 10000);
  let steps = 0;
  while (await job.runStep(j.run, { find, now })) steps++;

  assert.deepEqual(seen, ["a", "b", "c"]);
  const end = await job.getJob();
  assert.equal(end.status, "done");
  assert.equal(end.done, 3);
  assert.equal(end.found, 1);
  assert.equal(end.last_error, "site down");
  assert.equal("secret_hash" in end, false);
  assert.ok(steps >= 2);
});

test("Stop ends the run before the next place", async () => {
  await kv.del("targets");
  await kv.hset("targets", { e: place("e"), f: place("f") });
  const { job: j } = await job.startJob();
  const seen = [];
  const find = async (id) => {
    seen.push(id);
    await job.stopJob();
    return { target: { email: "" } };
  };
  assert.equal(await job.runStep(j.run, { find }), false);
  assert.deepEqual(seen, ["e"]);
  assert.equal((await job.getJob()).status, "stopped");
});
