// Tiny key-value layer for the portal's data (places, drafts, sent log, settings).
// Uses the same Upstash Redis as the accounts page on Vercel, or .data/portal.json on a laptop.
import fs from "node:fs/promises";
import path from "node:path";

const PREFIX = "cm:";

function upstash() {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  return url && token ? { url, token } : null;
}

async function remote(cmd) {
  const { url, token } = upstash();
  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(cmd),
    cache: "no-store",
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.error) throw new Error(`Database error: ${data.error || res.status}`);
  return data.result;
}

// ---- local file fallback (single user, so a simple read-modify-write is fine) ----

const FILE = () => process.env.PORTAL_FILE || path.join(process.cwd(), ".data", "portal.json");
let chain = Promise.resolve();

async function local(fn) {
  const run = chain.then(async () => {
    let db = {};
    try {
      db = JSON.parse(await fs.readFile(FILE(), "utf8"));
    } catch (e) {
      if (e.code !== "ENOENT") throw e;
    }
    const now = Date.now();
    for (const [k, v] of Object.entries(db)) if (v.exp && v.exp < now) delete db[k];
    const out = fn(db);
    await fs.mkdir(path.dirname(FILE()), { recursive: true });
    await fs.writeFile(FILE(), JSON.stringify(db), { mode: 0o600 });
    return out;
  });
  chain = run.catch(() => {});
  return run;
}

function useRemote() {
  if (upstash()) return true;
  if (process.env.VERCEL) {
    throw new Error("No database connected. Add your Upstash settings in Vercel, then redeploy.");
  }
  return false;
}

const k = (key) => PREFIX + key;

export async function get(key) {
  if (useRemote()) return remote(["GET", k(key)]);
  return local((db) => db[k(key)]?.v ?? null);
}

export async function set(key, value, { ex, nx } = {}) {
  if (useRemote()) {
    const cmd = ["SET", k(key), String(value)];
    if (nx) cmd.push("NX");
    if (ex) cmd.push("EX", String(ex));
    return (await remote(cmd)) === "OK";
  }
  return local((db) => {
    if (nx && db[k(key)]) return false;
    db[k(key)] = { v: String(value), exp: ex ? Date.now() + ex * 1000 : undefined };
    return true;
  });
}

export async function del(key) {
  if (useRemote()) return remote(["DEL", k(key)]);
  return local((db) => delete db[k(key)]);
}

export async function incr(key, ex) {
  if (useRemote()) {
    const n = await remote(["INCR", k(key)]);
    if (ex) await remote(["EXPIRE", k(key), String(ex)]);
    return n;
  }
  return local((db) => {
    const n = Number(db[k(key)]?.v || 0) + 1;
    db[k(key)] = { v: String(n), exp: ex ? Date.now() + ex * 1000 : db[k(key)]?.exp };
    return n;
  });
}

// Hash of JSON documents
export async function hgetall(key) {
  if (useRemote()) {
    const flat = (await remote(["HGETALL", k(key)])) || [];
    const out = {};
    for (let i = 0; i < flat.length; i += 2) out[flat[i]] = JSON.parse(flat[i + 1]);
    return out;
  }
  return local((db) => {
    const h = db[k(key)]?.v || {};
    return Object.fromEntries(Object.entries(h).map(([f, v]) => [f, JSON.parse(v)]));
  });
}

export async function hget(key, field) {
  if (useRemote()) {
    const v = await remote(["HGET", k(key), field]);
    return v ? JSON.parse(v) : null;
  }
  return local((db) => {
    const v = db[k(key)]?.v?.[field];
    return v ? JSON.parse(v) : null;
  });
}

export async function hset(key, entries) {
  const pairs = Object.entries(entries);
  if (!pairs.length) return;
  if (useRemote()) return remote(["HSET", k(key), ...pairs.flatMap(([f, v]) => [f, JSON.stringify(v)])]);
  return local((db) => {
    db[k(key)] = db[k(key)] || { v: {} };
    for (const [f, v] of pairs) db[k(key)].v[f] = JSON.stringify(v);
  });
}

export async function hdel(key, field) {
  if (useRemote()) return remote(["HDEL", k(key), field]);
  return local((db) => {
    if (db[k(key)]) delete db[k(key)].v[field];
  });
}

// Sets of strings
export async function sadd(key, ...members) {
  if (!members.length) return;
  if (useRemote()) return remote(["SADD", k(key), ...members]);
  return local((db) => {
    const s = new Set(db[k(key)]?.v || []);
    members.forEach((m) => s.add(m));
    db[k(key)] = { v: [...s] };
  });
}

export async function srem(key, ...members) {
  if (!members.length) return;
  if (useRemote()) return remote(["SREM", k(key), ...members]);
  return local((db) => {
    const s = new Set(db[k(key)]?.v || []);
    members.forEach((m) => s.delete(m));
    db[k(key)] = { v: [...s] };
  });
}

export async function smembers(key) {
  if (useRemote()) return (await remote(["SMEMBERS", k(key)])) || [];
  return local((db) => db[k(key)]?.v || []);
}

export async function sismember(key, member) {
  if (useRemote()) return (await remote(["SISMEMBER", k(key), member])) === 1;
  return local((db) => (db[k(key)]?.v || []).includes(member));
}
