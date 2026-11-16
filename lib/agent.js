// Lets a scheduled Claude task (on Ashish's Claude subscription) read the queue and hand
// back drafts, without the site calling the Claude API. Auth is a long random token,
// sent as "Authorization: Bearer <token>". Only its SHA-256 hash is stored.
import crypto from "node:crypto";
import * as kv from "./kv.js";

const sha = (s) => crypto.createHash("sha256").update(String(s)).digest();

export async function newAgentToken() {
  const token = "cm_" + crypto.randomBytes(32).toString("base64url");
  await kv.set("agent_token_hash", sha(token).toString("hex"));
  await kv.set("agent_token_created", new Date().toISOString());
  return token;
}

export async function revokeAgentToken() {
  await kv.del("agent_token_hash");
  await kv.del("agent_token_created");
}

export async function agentTokenInfo() {
  return { connected: Boolean(await kv.get("agent_token_hash")), created_at: (await kv.get("agent_token_created")) || null };
}

export async function agentAuthorized(req) {
  const h = req.headers.get("authorization") || "";
  const token = h.startsWith("Bearer ") ? h.slice(7).trim() : "";
  if (!token) return false;
  const got = sha(token);
  const hashes = [];
  const stored = await kv.get("agent_token_hash");
  if (stored) hashes.push(Buffer.from(stored, "hex"));
  if (process.env.PORTAL_AGENT_TOKEN) hashes.push(sha(process.env.PORTAL_AGENT_TOKEN));
  return hashes.some((want) => want.length === got.length && crypto.timingSafeEqual(want, got));
}
