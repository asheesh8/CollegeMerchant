// Find a public contact email for a place by reading a few of its pages.
// Same approach as merch.py find: follows robots.txt, pauses between pages,
// skips addresses like privacy@ and noreply@, and prefers admissions/alumni/marketing.

const USER_AGENT = "MerchRequestBot/1.0 (personal student project)";
const PAGE_DELAY_MS = 2000; // pause between pages on the same site
const MAX_PAGES = 6;
const TIME_BUDGET_MS = 40000; // stay well inside the server's time limit

const CANDIDATE_PATHS = [
  "/", "/contact", "/contact-us", "/about/contact",
  "/admissions/contact", "/graduate/contact", "/graduate-admissions",
  "/admissions", "/visit", "/alumni", "/marketing", "/communications",
  "/news/media-contacts", "/brand", "/bookstore",
];
const GOOD_WORDS = ["admission", "grad", "visit", "info", "alumni", "marketing", "brand", "swag",
  "communications", "events", "outreach", "recruit", "students", "university-relations", "campus", "community"];
const BAD_WORDS = ["noreply", "no-reply", "donotreply", "privacy", "abuse", "security", "webmaster", "hr@",
  "jobs", "careers", "legal", "press@", "payroll", "billing", "invoice", "it-help", "helpdesk"];
const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchText(url, maxBytes = 1_500_000) {
  const res = await fetch(url, {
    headers: { "User-Agent": USER_AGENT, Accept: "text/html,text/plain" },
    redirect: "follow",
    signal: AbortSignal.timeout(10000),
    cache: "no-store",
  });
  if (!res.ok) return null;
  const type = res.headers.get("content-type") || "";
  const text = (await res.text()).slice(0, maxBytes);
  return { text, type };
}

// Minimal robots.txt: the rules for "*" (or our bot), longest matching rule wins.
export function parseRobots(txt) {
  const groups = [];
  let cur = null;
  let lastWasAgent = false;
  for (const line of txt.split(/\r?\n/)) {
    const m = line.replace(/#.*/, "").match(/^\s*([A-Za-z-]+)\s*:\s*(.*?)\s*$/);
    if (!m) continue;
    const field = m[1].toLowerCase();
    if (field === "user-agent") {
      if (!lastWasAgent) groups.push((cur = { agents: [], rules: [] }));
      cur.agents.push(m[2].toLowerCase());
      lastWasAgent = true;
    } else {
      lastWasAgent = false;
      if (cur && (field === "allow" || field === "disallow")) cur.rules.push({ allow: field === "allow", path: m[2] });
    }
  }
  const mine = groups.filter((g) => g.agents.some((a) => a !== "*" && USER_AGENT.toLowerCase().includes(a)));
  const rules = (mine.length ? mine : groups.filter((g) => g.agents.includes("*"))).flatMap((g) => g.rules);
  return (pathname) => {
    let best = null;
    for (const r of rules) {
      if (!r.path) continue;
      const re = new RegExp("^" + r.path.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\\\$$/, "$"));
      if (re.test(pathname) && (!best || r.path.length > best.path.length || (r.path.length === best.path.length && r.allow))) best = r;
    }
    return !best || best.allow;
  };
}

function htmlToText(html) {
  return html
    .replace(/<(script|style|noscript|svg)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&[a-z]+;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function baseDomain(site) {
  return new URL(site).hostname.toLowerCase().replace(/^www\./, "");
}

export function scoreEmail(email, domain) {
  const e = email.toLowerCase();
  if (BAD_WORDS.some((b) => e.includes(b))) return -1;
  const [local, dom] = e.split("@");
  let s = 0;
  if (domain && (dom === domain || dom.endsWith("." + domain))) s += 5;
  s += GOOD_WORDS.filter((g) => local.includes(g)).length * 2;
  return s;
}

// Returns { email, other_emails, page_text, pages_read, blocked }
export async function findContact(site) {
  const started = Date.now();
  const domain = baseDomain(site);
  let allowed = () => true;
  try {
    const r = await fetchText(site + "/robots.txt", 200_000);
    if (r) allowed = parseRobots(r.text);
  } catch {
    // robots.txt unreachable: treat as allowed, like merch.py
  }
  const found = new Map();
  const texts = [];
  let blocked = 0;
  let first = true;
  for (const p of CANDIDATE_PATHS) {
    if (texts.length >= MAX_PAGES || Date.now() - started > TIME_BUDGET_MS) break;
    if (!allowed(p)) {
      blocked++;
      continue;
    }
    if (!first) await sleep(PAGE_DELAY_MS);
    first = false;
    let page;
    try {
      page = await fetchText(site + p);
    } catch {
      continue;
    }
    if (!page || !page.type.includes("text/html")) continue;
    for (let e of page.text.match(EMAIL_RE) || []) {
      e = e.replace(/^\.+|\.+$/g, "").toLowerCase();
      if (/\.(png|jpe?g|gif|webp|svg)$/.test(e)) continue;
      found.set(e, scoreEmail(e, domain));
    }
    texts.push(htmlToText(page.text).slice(0, 4000));
  }
  const ranked = [...found.entries()].filter(([, s]) => s >= 0).sort((a, b) => b[1] - a[1]).map(([e]) => e);
  return {
    email: ranked[0] || "",
    other_emails: ranked.slice(1, 15),
    page_text: texts.join(" | ").slice(0, 6000),
    pages_read: texts.length,
    blocked,
  };
}
