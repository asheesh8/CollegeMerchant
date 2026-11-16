// Where saved accounts live.
//  - On Vercel: an Upstash Redis database (add it from Vercel > Storage, which sets KV_REST_API_URL/TOKEN).
//  - On your laptop: a local file, .data/accounts.json (gitignored).
// Passwords are always encrypted before they get here (see lib/crypto.js).
import fs from "node:fs/promises";
import path from "node:path";

const REDIS_KEY = "collegemerchant:accounts";
const EMPTY = { accounts: [], default_id: null };

function redisCreds() {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  return url && token ? { url, token } : null;
}

export function storeKind() {
  if (redisCreds()) return "redis";
  if (process.env.VERCEL) return "missing";
  return "file";
}

function filePath() {
  return process.env.ACCOUNTS_FILE || path.join(process.cwd(), ".data", "accounts.json");
}

async function redis(command) {
  const { url, token } = redisCreds();
  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(command),
    cache: "no-store",
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.error) throw new Error(`Redis error: ${data.error || res.status}`);
  return data.result;
}

export async function load() {
  const kind = storeKind();
  if (kind === "missing") {
    throw new Error("No database connected. In Vercel, open Storage, add an Upstash Redis database to this project, then redeploy.");
  }
  let raw = null;
  if (kind === "redis") {
    raw = await redis(["GET", REDIS_KEY]);
  } else {
    try {
      raw = await fs.readFile(filePath(), "utf8");
    } catch (e) {
      if (e.code !== "ENOENT") throw e;
    }
  }
  if (!raw) return structuredClone(EMPTY);
  const data = JSON.parse(raw);
  return { accounts: data.accounts || [], default_id: data.default_id || null };
}

export async function save(data) {
  const body = JSON.stringify(data, null, 2);
  if (storeKind() === "redis") {
    await redis(["SET", REDIS_KEY, body]);
    return;
  }
  const file = filePath();
  await fs.mkdir(path.dirname(file), { recursive: true });
  const tmp = file + ".tmp";
  await fs.writeFile(tmp, body, { mode: 0o600 });
  await fs.rename(tmp, file);
}
