// Server-side account logic: validation, saving, and SMTP checks.
import crypto from "node:crypto";
import nodemailer from "nodemailer";
import { encrypt, decrypt } from "./crypto.js";
import { load, save } from "./store.js";
import { PROVIDERS, EMAIL_RE } from "./providers.js";

// What the browser is allowed to see. Never includes the password.
export function publicView(a, defaultId) {
  return {
    id: a.id,
    email: a.email,
    display_name: a.display_name,
    provider: a.provider,
    host: a.host,
    port: a.port,
    secure: a.secure,
    username: a.username,
    has_password: Boolean(a.password_enc),
    is_default: a.id === defaultId,
    created_at: a.created_at,
    updated_at: a.updated_at,
    last_test: a.last_test || null,
  };
}

export async function listAccounts() {
  const data = await load();
  return data.accounts.map((a) => publicView(a, data.default_id));
}

// Clean up form input. `existing` is the saved account when editing.
export function cleanInput(body, existing = null) {
  const email = String(body.email ?? existing?.email ?? "").trim().toLowerCase();
  if (!EMAIL_RE.test(email)) throw new UserError("Enter a valid email address.");
  const provider = PROVIDERS[body.provider] ? body.provider : existing?.provider || "custom";
  const preset = PROVIDERS[provider];
  const host = String(body.host ?? existing?.host ?? preset.host).trim().toLowerCase();
  if (!/^[a-z0-9.-]+$/.test(host)) throw new UserError("Enter the SMTP server, like smtp.example.com.");
  const port = Number(body.port ?? existing?.port ?? preset.port);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new UserError("Port must be a number like 587 or 465.");
  const secure = body.secure !== undefined ? Boolean(body.secure) : existing?.secure ?? port === 465;
  const username = String(body.username || existing?.username || email).trim();
  const display_name = String(body.display_name ?? existing?.display_name ?? "").trim().slice(0, 100);
  // Gmail shows app passwords in groups of four; spaces don't belong in the password.
  let password = body.password ? String(body.password) : "";
  if (provider === "gmail") password = password.replace(/\s+/g, "");
  if (!password && !existing?.password_enc) throw new UserError("Enter the password for this account.");
  return { email, provider, host, port, secure, username, display_name, password };
}

export class UserError extends Error {}

export async function upsertAccount(body, id = null) {
  const data = await load();
  let existing = id ? data.accounts.find((a) => a.id === id) : null;
  if (id && !existing) throw new UserError("That account no longer exists.");
  const input = cleanInput(body, existing);
  const clash = data.accounts.find((a) => a.email === input.email && a.id !== id);
  if (clash) {
    if (id) throw new UserError(`${input.email} is already saved as another account.`);
    existing = clash; // adding an email that's already saved just updates it
  }
  const now = new Date().toISOString();
  const { password, ...fields } = input;
  const record = {
    ...(existing || { id: crypto.randomUUID(), created_at: now }),
    ...fields,
    updated_at: now,
  };
  if (password) record.password_enc = encrypt(password);
  const settingsChanged =
    existing && (password || ["host", "port", "secure", "username"].some((k) => existing[k] !== record[k]));
  if (settingsChanged) delete record.last_test;
  data.accounts = existing ? data.accounts.map((a) => (a.id === existing.id ? record : a)) : [...data.accounts, record];
  if (!data.default_id) data.default_id = record.id;
  await save(data);
  return publicView(record, data.default_id);
}

export async function deleteAccount(id) {
  const data = await load();
  data.accounts = data.accounts.filter((a) => a.id !== id);
  if (data.default_id === id) data.default_id = data.accounts[0]?.id || null;
  await save(data);
}

export async function setDefault(id) {
  const data = await load();
  if (!data.accounts.some((a) => a.id === id)) throw new UserError("That account no longer exists.");
  data.default_id = id;
  await save(data);
}

function transportFor(s) {
  return nodemailer.createTransport({
    host: s.host,
    port: s.port,
    secure: s.secure, // true = SSL from the start (465); false = upgrade with STARTTLS (587)
    requireTLS: !s.secure,
    auth: { user: s.username, pass: s.password },
    connectionTimeout: 15000,
    greetingTimeout: 15000,
    socketTimeout: 20000,
  });
}

function friendlyError(err) {
  const msg = String(err?.message || err);
  if (err?.code === "EAUTH" || /535|auth/i.test(msg)) {
    return "The server rejected the login. Check the username and password (for Gmail, use an app password, not your normal one).";
  }
  if (["ENOTFOUND", "EDNS"].includes(err?.code)) return "Couldn't find that SMTP server. Check the server name.";
  if (["ETIMEDOUT", "ECONNECTION", "ESOCKET", "ECONNREFUSED"].includes(err?.code)) {
    return "Couldn't connect. Check the port and the SSL setting (465 uses SSL, 587 uses STARTTLS).";
  }
  return msg.slice(0, 300);
}

// Try logging in with the given settings. If `sendTo` is set, also send a short test email.
// `body.id` lets the form test a saved account without retyping its password.
export async function testSettings(body, sendTo = false) {
  let existing = null;
  if (body.id) {
    const data = await load();
    existing = data.accounts.find((a) => a.id === body.id) || null;
  }
  const s = cleanInput(body, existing);
  if (!s.password) s.password = decrypt(existing.password_enc);
  let result;
  const transport = transportFor(s);
  try {
    await transport.verify();
    if (sendTo) {
      await transport.sendMail({
        from: s.display_name ? { name: s.display_name, address: s.email } : s.email,
        to: s.email,
        subject: "CollegeMerchant test email",
        text: "This is a test from your CollegeMerchant email settings. If you got it, this account is ready to send.",
      });
    }
    result = { ok: true, at: new Date().toISOString(), message: sendTo ? `Sent a test email to ${s.email}.` : "Signed in successfully." };
  } catch (err) {
    result = { ok: false, at: new Date().toISOString(), message: friendlyError(err) };
  } finally {
    transport.close();
  }
  // Remember the result on the saved account, but only if we tested what's actually saved.
  if (existing && !body.password && ["host", "port", "secure", "username"].every((k) => s[k] === existing[k])) {
    const data = await load();
    const acct = data.accounts.find((a) => a.id === existing.id);
    if (acct) {
      acct.last_test = result;
      await save(data);
    }
  }
  return result;
}
