// Run with: npm test
import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import crypto from "node:crypto";

process.env.ACCOUNTS_KEY = crypto.randomBytes(32).toString("base64");
const { encrypt, decrypt } = await import("../lib/crypto.js");

test("encrypt/decrypt round trip, and each encryption is different", () => {
  const a = encrypt("abcd efgh ijkl mnop");
  assert.notEqual(a, encrypt("abcd efgh ijkl mnop"));
  assert.equal(decrypt(a), "abcd efgh ijkl mnop");
});

test("tampered ciphertext is rejected", () => {
  const t = encrypt("secret");
  const buf = Buffer.from(t.slice(3), "base64");
  buf[14] ^= 1;
  assert.throws(() => decrypt("v1:" + buf.toString("base64")));
});

test("merch.py can decrypt what the web page saves", (t) => {
  const token = encrypt("päss wörd");
  const script = `import os,sys; sys.path.insert(0, os.getcwd()); import merch, base64
print(merch.decrypt_secret(sys.argv[1], base64.b64decode(os.environ["ACCOUNTS_KEY"])), end="")`;
  let out;
  try {
    out = execFileSync("python3", ["-c", script, token], { encoding: "utf8" });
  } catch (e) {
    if (/cryptography/.test(String(e.stderr || e.stdout))) return t.skip("pip install cryptography to run this");
    throw e;
  }
  assert.equal(out, "päss wörd");
});
