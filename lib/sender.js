// Sends ONE approved email per call. The dashboard calls this, waits a few
// random minutes, and calls it again, so emails go out slowly like a person.
import nodemailer from "nodemailer";
import { load } from "./store.js";
import { decrypt } from "./crypto.js";
import * as kv from "./kv.js";
import { getSettings, listTargets, saveTarget, getTarget, sentToday, todayKey } from "./portal.js";

export async function senderAccount() {
  const data = await load();
  const a = data.accounts.find((x) => x.id === data.default_id) || data.accounts[0];
  return a || null;
}

const randomGap = (s) => (s.gap_min_sec + Math.random() * (s.gap_max_sec - s.gap_min_sec)) * 1000;

// Result shapes:
//  { sent: {...}, next_in_ms, sent_today, cap }   one email went out
//  { wait_ms }                                     too soon after the last one
//  { done: "cap" | "empty" | "no_account" | "busy", message }
//  { error, message }                              sending failed; the dashboard stops
export async function sendNext() {
  const settings = await getSettings();
  const cap = settings.daily_cap;
  const count = await sentToday(settings);
  if (count >= cap) {
    return { done: "cap", message: `Sent ${count} of ${cap} today. It'll pick up again tomorrow.`, sent_today: count, cap };
  }
  const last = Number((await kv.get("last_send")) || 0);
  const minGap = settings.gap_min_sec * 1000;
  if (Date.now() - last < minGap) return { wait_ms: minGap - (Date.now() - last) };

  // One sender at a time, even with two tabs open.
  if (!(await kv.set("send_lock", "1", { nx: true, ex: 90 }))) {
    return { done: "busy", message: "Another tab is already sending." };
  }
  try {
    const account = await senderAccount();
    if (!account) return { done: "no_account", message: "Add an email account first (Accounts tab)." };

    const optout = new Set(await kv.smembers("optout"));
    const queue = (await listTargets())
      .filter((t) => t.status === "approved")
      .sort((a, b) => ((a.approved_at || "") < (b.approved_at || "") ? -1 : 1));
    let target = null;
    for (const q of queue) {
      const t = await getTarget(q.id);
      const email = t.email.toLowerCase();
      if (optout.has(email) || (await kv.sismember("sent_emails", email))) {
        t.status = "skipped";
        t.error = optout.has(email) ? "On your opt-out list" : "Already emailed this address before";
        await saveTarget(t);
        continue;
      }
      target = t;
      break;
    }
    if (!target) return { done: "empty", message: "Nothing approved is waiting to go out." };

    const transport = nodemailer.createTransport({
      host: account.host,
      port: account.port,
      secure: account.secure,
      requireTLS: !account.secure,
      auth: { user: account.username, pass: decrypt(account.password_enc) },
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 20000,
    });
    const name = account.display_name || settings.sender_profile.name;
    let info;
    try {
      info = await transport.sendMail({
        from: name ? { name, address: account.email } : account.email,
        to: target.email,
        subject: target.draft.subject,
        text: target.draft.body + (settings.footer ? "\n\n" + settings.footer : ""),
      });
    } catch (err) {
      target.status = "error";
      target.error = `Send failed: ${String(err.message || err).slice(0, 200)}`;
      await saveTarget(target);
      return { error: true, message: `Couldn't send to ${target.email}: ${err.message}. Stopped so your account doesn't get flagged.` };
    } finally {
      transport.close();
    }

    const now = Date.now();
    target.status = "sent";
    target.error = "";
    target.sent = { at: new Date(now).toISOString(), from: account.email, message_id: info.messageId || "" };
    await saveTarget(target);
    await kv.sadd("sent_emails", target.email.toLowerCase());
    const n = await kv.incr(`count:${todayKey(settings.timezone)}`, 60 * 60 * 48);
    await kv.set("last_send", String(now));
    return {
      sent: { id: target.id, name: target.name, email: target.email, subject: target.draft.subject, at: target.sent.at },
      next_in_ms: Math.round(randomGap(settings)),
      sent_today: n,
      cap,
    };
  } finally {
    await kv.del("send_lock");
  }
}
