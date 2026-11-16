// AES-256-GCM encryption for saved email passwords.
// The key comes from the ACCOUNTS_KEY env var (32 random bytes, base64).
// Make one with:  openssl rand -base64 32
// merch.py decrypts the same format, so keep the two in sync.
import crypto from "node:crypto";

const PREFIX = "v1:";

export function getKey() {
  const raw = process.env.ACCOUNTS_KEY || "";
  if (!raw) throw new Error("ACCOUNTS_KEY is not set. Run `openssl rand -base64 32` and set it as ACCOUNTS_KEY.");
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) throw new Error("ACCOUNTS_KEY must be 32 bytes, base64 encoded (openssl rand -base64 32).");
  return key;
}

// Output: "v1:" + base64(iv[12] | ciphertext | tag[16])
export function encrypt(plaintext) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", getKey(), iv);
  const ct = Buffer.concat([cipher.update(String(plaintext), "utf8"), cipher.final()]);
  return PREFIX + Buffer.concat([iv, ct, cipher.getAuthTag()]).toString("base64");
}

export function decrypt(token) {
  if (!token || !token.startsWith(PREFIX)) throw new Error("Not an encrypted value");
  const buf = Buffer.from(token.slice(PREFIX.length), "base64");
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(buf.length - 16);
  const ct = buf.subarray(12, buf.length - 16);
  const decipher = crypto.createDecipheriv("aes-256-gcm", getKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString("utf8");
}
