// Places ("targets"), settings, opt-outs and the sent log.
import crypto from "node:crypto";
import * as kv from "./kv.js";
import { UserError } from "./accounts.js";
import { EMAIL_RE } from "./providers.js";

export const DEFAULT_SETTINGS = {
  sender_profile: {
    name: "Ashish",
    about:
      "Senior at Champlain College studying computer science, minoring in math and cybersecurity. Graduating soon and applying to master's programs.",
    why_i_collect: "I collect school and tech company merch and like repping places I admire.",
    items_i_would_love: "socks, sweaters or hoodies, mugs, or anything you usually give out",
    mailing_address: "",
    signature: "Ashish\nChamplain College, Class of 2026",
  },
  daily_cap: 20,
  gap_min_sec: 120,
  gap_max_sec: 300,
  timezone: "America/New_York",
  model: "claude-opus-5-5",
  footer: "If you'd rather not hear from me again, just reply 'no thanks' and I won't email again.",
};

// Statuses a place moves through.
export const STATUS = {
  new: "New",
  finding: "Looking for email",
  no_email: "No email found",
  found: "Email found",
  drafted: "Ready to review",
  approved: "Approved",
  sent: "Sent",
  replied: "Replied",
  declined: "Said no",
  skipped: "Skipped",
  error: "Problem",
};

export async function getSettings() {
  const raw = await kv.get("settings");
  const saved = raw ? JSON.parse(raw) : {};
  return {
    ...DEFAULT_SETTINGS,
    ...saved,
    sender_profile: { ...DEFAULT_SETTINGS.sender_profile, ...(saved.sender_profile || {}) },
  };
}

export async function saveSettings(input) {
  const cur = await getSettings();
  const p = input.sender_profile || {};
  const profile = { ...cur.sender_profile };
  for (const key of Object.keys(DEFAULT_SETTINGS.sender_profile)) {
    if (typeof p[key] === "string") profile[key] = p[key].slice(0, 2000);
  }
  const num = (v, lo, hi, d) => (Number.isFinite(Number(v)) ? Math.min(hi, Math.max(lo, Math.round(Number(v)))) : d);
  const next = {
    ...cur,
    sender_profile: profile,
    daily_cap: num(input.daily_cap, 1, 200, cur.daily_cap),
    gap_min_sec: num(input.gap_min_sec, 30, 3600, cur.gap_min_sec),
    gap_max_sec: num(input.gap_max_sec, 30, 7200, cur.gap_max_sec),
    footer: typeof input.footer === "string" ? input.footer.slice(0, 500) : cur.footer,
    model: typeof input.model === "string" && input.model.trim() ? input.model.trim() : cur.model,
    timezone: typeof input.timezone === "string" && input.timezone.trim() ? input.timezone.trim() : cur.timezone,
  };
  if (next.gap_max_sec < next.gap_min_sec) next.gap_max_sec = next.gap_min_sec;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: next.timezone });
  } catch {
    throw new UserError("That time zone isn't valid. Try America/New_York.");
  }
  await kv.set("settings", JSON.stringify(next));
  return next;
}

// ---- places ----

function normWebsite(w) {
  let s = String(w || "").trim();
  if (!s) return "";
  if (!/^https?:\/\//i.test(s)) s = "https://" + s;
  try {
    const u = new URL(s);
    return `${u.protocol}//${u.host}`.toLowerCase();
  } catch {
    throw new UserError(`"${w}" doesn't look like a website.`);
  }
}

function cleanEmail(e) {
  const s = String(e || "").trim().toLowerCase();
  if (s && !EMAIL_RE.test(s)) throw new UserError(`"${e}" isn't a valid email address.`);
  return s;
}

export async function listTargets({ full = false } = {}) {
  const all = Object.values(await kv.hgetall("targets"));
  all.sort((a, b) => (a.created_at < b.created_at ? -1 : 1));
  if (full) return all;
  return all.map(({ page_text, ...t }) => ({ ...t, has_page_text: Boolean(page_text) }));
}

export async function getTarget(id) {
  const t = await kv.hget("targets", id);
  if (!t) throw new UserError("That place no longer exists.");
  return t;
}

export async function saveTarget(t) {
  t.updated_at = new Date().toISOString();
  await kv.hset("targets", { [t.id]: t });
  return t;
}

export async function addTargets(items) {
  if (!Array.isArray(items) || !items.length) throw new UserError("Add at least one place.");
  if (items.length > 300) throw new UserError("Add up to 300 places at a time.");
  const existing = await listTargets({ full: true });
  const host = (w) => w.replace(/^https?:\/\//, "").replace(/^www\./, "");
  const seen = new Set(existing.map((t) => `${t.name.toLowerCase()}|${host(t.website)}`));
  const added = [];
  const skipped = [];
  const out = {};
  for (const raw of items) {
    const name = String(raw.name || "").trim().slice(0, 200);
    if (!name) continue;
    const website = normWebsite(raw.website);
    const key = `${name.toLowerCase()}|${host(website)}`;
    if (seen.has(key)) {
      skipped.push(name);
      continue;
    }
    seen.add(key);
    const email = cleanEmail(raw.email);
    const now = new Date().toISOString();
    const t = {
      id: crypto.randomUUID(),
      name,
      website,
      kind: raw.kind === "company" ? "company" : "school",
      notes: String(raw.notes || "").trim().slice(0, 1000),
      contact_name: String(raw.contact_name || "").trim().slice(0, 200),
      email,
      other_emails: [],
      page_text: "",
      status: email ? "found" : "new",
      created_at: now,
      updated_at: now,
    };
    out[t.id] = t;
    added.push(t);
  }
  await kv.hset("targets", out);
  return { added: added.length, skipped };
}

// Edits from the page. Only these fields can be changed by hand.
export async function updateTarget(id, body) {
  const t = await getTarget(id);
  if (["sent", "replied", "declined"].includes(t.status) && (body.email || body.draft)) {
    throw new UserError("This one has already been sent.");
  }
  if (body.name !== undefined) t.name = String(body.name).trim().slice(0, 200) || t.name;
  if (body.website !== undefined) t.website = normWebsite(body.website);
  if (body.kind !== undefined) t.kind = body.kind === "company" ? "company" : "school";
  if (body.notes !== undefined) t.notes = String(body.notes).trim().slice(0, 1000);
  if (body.contact_name !== undefined) t.contact_name = String(body.contact_name).trim().slice(0, 200);
  if (body.email !== undefined) {
    t.email = cleanEmail(body.email);
    if (["new", "no_email", "error", "found"].includes(t.status)) t.status = t.email ? "found" : "new";
  }
  if (body.draft) {
    if (!t.draft) throw new UserError("Write a draft first.");
    t.draft.subject = String(body.draft.subject ?? t.draft.subject).slice(0, 200);
    t.draft.body = String(body.draft.body ?? t.draft.body).slice(0, 5000);
  }
  if (body.status !== undefined) {
    const allowed = {
      approved: ["drafted", "skipped", "error"],
      drafted: ["approved", "skipped"],
      skipped: ["new", "found", "no_email", "drafted", "approved", "error"],
      found: ["skipped", "error"],
      replied: ["sent", "declined"],
      declined: ["sent", "replied"],
      sent: ["replied", "declined"],
    };
    if (!allowed[body.status]?.includes(t.status)) {
      throw new UserError(`Can't change "${STATUS[t.status]}" to "${STATUS[body.status] || body.status}".`);
    }
    if (body.status === "approved") {
      if (!t.draft?.subject || !t.draft?.body) throw new UserError("This place has no draft to approve.");
      if (!t.email) throw new UserError("Add an email address first.");
      t.approved_at = new Date().toISOString();
    }
    if (body.status === "found" && !t.email) throw new UserError("Add an email address first.");
    if (body.status === "declined") await kv.sadd("optout", t.email);
    if (t.status === "declined" && body.status !== "declined") await kv.srem("optout", t.email);
    t.status = body.status;
  }
  return saveTarget(t);
}

export async function deleteTarget(id) {
  await kv.hdel("targets", id);
}

// ---- opt-outs and sent history ----

export async function optouts() {
  return (await kv.smembers("optout")).sort();
}

export async function setOptouts(list) {
  const want = new Set(
    String(list || "")
      .split(/[\s,;]+/)
      .map((e) => e.trim().toLowerCase())
      .filter((e) => EMAIL_RE.test(e)),
  );
  const have = new Set(await kv.smembers("optout"));
  await kv.sadd("optout", ...[...want].filter((e) => !have.has(e)));
  await kv.srem("optout", ...[...have].filter((e) => !want.has(e)));
  return [...want].sort();
}

export function todayKey(timezone) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

export async function sentToday(settings) {
  return Number((await kv.get(`count:${todayKey(settings.timezone)}`)) || 0);
}

export async function stats() {
  const [targets, settings] = await Promise.all([listTargets(), getSettings()]);
  const by = {};
  for (const t of targets) by[t.status] = (by[t.status] || 0) + 1;
  const lastSend = Number((await kv.get("last_send")) || 0);
  return {
    total: targets.length,
    by_status: by,
    sent_today: await sentToday(settings),
    daily_cap: settings.daily_cap,
    last_send_at: lastSend ? new Date(lastSend).toISOString() : null,
    profile_ready: Boolean(settings.sender_profile.mailing_address.trim()),
  };
}
