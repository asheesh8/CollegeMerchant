// Signed login cookie. Uses Web Crypto so it works in middleware (edge) and in route handlers.
// Cookie value: "<expiry-ms>.<hex hmac>". Changing ADMIN_PASSWORD or ACCOUNTS_KEY logs everyone out.

export const COOKIE = "cm_session";
export const MAX_AGE_SEC = 60 * 60 * 24 * 7; // one week

const enc = new TextEncoder();

async function hmacHex(message) {
  const secret = `${process.env.ADMIN_PASSWORD || ""}|${process.env.ACCOUNTS_KEY || ""}`;
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(message));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function sameString(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export function authConfigured() {
  return Boolean(process.env.ADMIN_PASSWORD && process.env.ACCOUNTS_KEY);
}

export async function makeSession() {
  const exp = String(Date.now() + MAX_AGE_SEC * 1000);
  return `${exp}.${await hmacHex(exp)}`;
}

export async function validSession(value) {
  if (!value || !authConfigured()) return false;
  const [exp, sig] = value.split(".");
  if (!exp || !sig || Number(exp) < Date.now()) return false;
  return sameString(sig, await hmacHex(exp));
}

// Compare passwords through HMAC so the comparison takes the same time whatever the input.
export async function passwordMatches(input) {
  if (!process.env.ADMIN_PASSWORD) return false;
  const [a, b] = await Promise.all([hmacHex("pw:" + String(input || "")), hmacHex("pw:" + process.env.ADMIN_PASSWORD)]);
  return sameString(a, b);
}
