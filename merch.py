#!/usr/bin/env python3
"""Free-merch request emailer.

Steps (run in order):
  python merch.py find            # read targets.csv, find public contact emails -> contacts.csv
  python merch.py draft           # write a personalized email for each contact -> drafts.csv
  (open drafts.csv, read each email, set approved=yes on the ones you like)
  python merch.py send            # dry run: shows what would be sent
  python merch.py send --live     # actually sends, up to the daily cap
  python merch.py accounts        # list email accounts saved in the web page

Sends from the default account saved in the web page (npm run dev, or your Vercel site).
Pick another with --account you@example.com. With no saved accounts it falls back to
the "smtp" block in config.json and the SMTP_PASSWORD env var.

Only reads public pages, follows robots.txt, waits between requests.
Never emails the same address twice and skips anyone in optout.txt.
"""
import argparse
import base64
import csv
import datetime as dt
import html
import json
import os
import random
import re
import smtplib
import ssl
import sys
import time
import urllib.parse
import urllib.request
import urllib.robotparser
from email.message import EmailMessage
from email.utils import formataddr, make_msgid

HERE = os.path.dirname(os.path.abspath(__file__))
P = lambda name: os.path.join(HERE, name)

USER_AGENT = "MerchRequestBot/1.0 (personal student project; contact via email in config)"
FETCH_DELAY_SEC = 4          # pause between page requests
MAX_PAGES_PER_SITE = 6
DAILY_CAP_DEFAULT = 40       # safe for a personal Gmail; raise slowly
SEND_GAP_SEC = (90, 240)     # random pause between sends

# Pages that usually list the right people. Tried in order, relative to the site root.
CANDIDATE_PATHS = [
    "/", "/contact", "/contact-us", "/about/contact",
    "/admissions/contact", "/graduate/contact", "/graduate-admissions",
    "/admissions", "/visit", "/alumni", "/marketing", "/communications",
    "/news/media-contacts", "/brand", "/bookstore",
]
# Words that make an email address a better fit for a merch request.
GOOD_WORDS = ["admission", "grad", "visit", "info", "alumni", "marketing",
              "brand", "swag", "communications", "events", "outreach", "recruit",
              "students", "university-relations", "campus", "community"]
BAD_WORDS = ["noreply", "no-reply", "donotreply", "privacy", "abuse", "security",
             "webmaster", "hr@", "jobs", "careers", "legal", "press@", "payroll",
             "billing", "invoice", "it-help", "helpdesk"]
EMAIL_RE = re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}")


# ---------- small helpers ----------

def read_csv(path):
    if not os.path.exists(path):
        return []
    with open(path, newline="", encoding="utf-8") as f:
        return list(csv.DictReader(f))


def write_csv(path, rows, fields):
    with open(path, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=fields, extrasaction="ignore")
        w.writeheader()
        w.writerows(rows)


def load_config():
    path = P("config.json")
    if not os.path.exists(path):
        sys.exit("Missing config.json. Copy config.example.json to config.json and fill it in.")
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def optouts():
    path = P("optout.txt")
    if not os.path.exists(path):
        return set()
    with open(path, encoding="utf-8") as f:
        return {l.strip().lower() for l in f if l.strip() and not l.startswith("#")}


def load_env_files():
    """Read KEY=value lines from .env and .env.local (same files the web page uses). Real env vars win."""
    for name in (".env", ".env.local"):
        path = P(name)
        if not os.path.exists(path):
            continue
        with open(path, encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line or line.startswith("#") or "=" not in line:
                    continue
                k, v = line.split("=", 1)
                v = v.strip().strip('"').strip("'")
                if v and not os.environ.get(k.strip()):
                    os.environ[k.strip()] = v


# ---------- saved email accounts (from the web page) ----------

ACCOUNTS_REDIS_KEY = "collegemerchant:accounts"


def _accounts_key():
    raw = os.environ.get("ACCOUNTS_KEY", "")
    if not raw:
        return None
    key = base64.b64decode(raw)
    if len(key) != 32:
        sys.exit("ACCOUNTS_KEY must be 32 bytes, base64 encoded (openssl rand -base64 32).")
    return key


def decrypt_secret(token, key):
    """Undo lib/crypto.js encrypt(): "v1:" + base64(iv[12] | ciphertext | tag[16]), AES-256-GCM."""
    try:
        from cryptography.hazmat.primitives.ciphers.aead import AESGCM
    except ImportError:
        sys.exit("Run: pip install -r requirements.txt  (needs the cryptography package)")
    if not token.startswith("v1:"):
        raise ValueError("unknown encryption format")
    buf = base64.b64decode(token[3:])
    return AESGCM(key).decrypt(buf[:12], buf[12:], None).decode("utf-8")


def load_saved_accounts():
    """Return {"accounts": [...], "default_id": ...} from Upstash Redis or .data/accounts.json, or None."""
    url = os.environ.get("KV_REST_API_URL") or os.environ.get("UPSTASH_REDIS_REST_URL")
    token = os.environ.get("KV_REST_API_TOKEN") or os.environ.get("UPSTASH_REDIS_REST_TOKEN")
    raw = None
    if url and token:
        req = urllib.request.Request(url, data=json.dumps(["GET", ACCOUNTS_REDIS_KEY]).encode(),
                                     headers={"Authorization": f"Bearer {token}",
                                              "Content-Type": "application/json"})
        with urllib.request.urlopen(req, timeout=20) as r:
            raw = json.load(r).get("result")
    else:
        path = os.environ.get("ACCOUNTS_FILE") or P(os.path.join(".data", "accounts.json"))
        if os.path.exists(path):
            with open(path, encoding="utf-8") as f:
                raw = f.read()
    if not raw:
        return None
    data = json.loads(raw)
    return data if data.get("accounts") else None


def pick_sender(cfg, wanted=None):
    """Settings to send with: a saved account (default, or the one named by --account), else config.json."""
    data = load_saved_accounts()
    if data:
        accts = data["accounts"]
        if wanted:
            match = [a for a in accts if a["email"].lower() == wanted.lower()]
            if not match:
                sys.exit(f"No saved account for {wanted}. Saved: " + ", ".join(a["email"] for a in accts))
            a = match[0]
        else:
            a = next((x for x in accts if x["id"] == data.get("default_id")), accts[0])
        key = _accounts_key()
        if not key:
            sys.exit("Found saved accounts but ACCOUNTS_KEY isn't set. Put it in .env.local (same value as the web page).")
        try:
            password = decrypt_secret(a["password_enc"], key)
        except Exception:
            sys.exit("Couldn't decrypt the saved password. Is ACCOUNTS_KEY the same one the web page uses?")
        return {"host": a["host"], "port": int(a["port"]), "secure": bool(a.get("secure")),
                "username": a.get("username") or a["email"], "from_address": a["email"],
                "name": a.get("display_name") or cfg["sender_profile"]["name"],
                "password": password, "source": "saved account"}
    if wanted:
        sys.exit("No accounts saved in the web page yet, so --account can't be used.")
    s = cfg["smtp"]
    return {"host": s["host"], "port": int(s.get("port", 587)), "secure": int(s.get("port", 587)) == 465,
            "username": s["username"], "from_address": s["from_address"],
            "name": cfg["sender_profile"]["name"],
            "password": os.environ.get("SMTP_PASSWORD") or s.get("password", ""), "source": "config.json"}


def cmd_accounts(args):
    data = load_saved_accounts()
    if not data:
        print("No saved accounts. Add one in the web page (npm run dev, then open http://localhost:3000).")
        return
    for a in data["accounts"]:
        mark = "*" if a["id"] == data.get("default_id") else " "
        test = a.get("last_test") or {}
        status = "working" if test.get("ok") else ("last test failed" if test else "not tested")
        print(f"{mark} {a['email']:<36} {a['host']}:{a['port']}  ({status})")
    print("\n* = default. Use --account EMAIL with send to pick another.")


_robots = {}

def allowed(url):
    parts = urllib.parse.urlsplit(url)
    root = f"{parts.scheme}://{parts.netloc}"
    if root not in _robots:
        rp = urllib.robotparser.RobotFileParser()
        rp.set_url(root + "/robots.txt")
        try:
            rp.read()
        except Exception:
            rp = None  # robots.txt unreachable: treat as allowed
        _robots[root] = rp
    rp = _robots[root]
    return True if rp is None else rp.can_fetch(USER_AGENT, url)


def fetch(url):
    """Return page text, or None. Respects robots.txt and waits after each request."""
    if not allowed(url):
        print(f"   robots.txt says no: {url}")
        return None
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            if "text/html" not in r.headers.get("Content-Type", ""):
                return None
            raw = r.read(1_500_000).decode("utf-8", errors="ignore")
    except Exception:
        return None
    finally:
        time.sleep(FETCH_DELAY_SEC)
    return raw


def html_to_text(raw):
    raw = re.sub(r"(?is)<(script|style|noscript|svg).*?</\1>", " ", raw)
    text = re.sub(r"(?s)<[^>]+>", " ", raw)
    return re.sub(r"\s+", " ", html.unescape(text)).strip()


def score_email(email, site_domain):
    e = email.lower()
    if any(b in e for b in BAD_WORDS):
        return -1
    s = 0
    dom = e.split("@")[1]
    if site_domain and (dom == site_domain or dom.endswith("." + site_domain)):
        s += 5
    s += sum(2 for g in GOOD_WORDS if g in e.split("@")[0])
    return s


def base_domain(url):
    host = urllib.parse.urlsplit(url).netloc.lower().split(":")[0]
    if host.startswith("www."):
        host = host[4:]
    return host


# ---------- step 1: find contacts ----------

def cmd_find(args):
    targets = read_csv(P("targets.csv"))
    if not targets:
        sys.exit("targets.csv is empty. Add schools/companies first (see README).")
    existing = {r["name"]: r for r in read_csv(P("contacts.csv"))}
    out = []
    for t in targets:
        name = t["name"].strip()
        if name in existing and existing[name].get("email") and not args.refresh:
            out.append(existing[name])
            continue
        site = t.get("website", "").strip().rstrip("/")
        if site and not site.startswith("http"):
            site = "https://" + site
        row = {"name": name, "kind": t.get("kind", "school"), "website": site,
               "email": t.get("contact_email", "").strip(), "contact_name": t.get("contact_name", "").strip(),
               "other_emails": "", "notes": t.get("notes", ""), "page_text": ""}
        print(f"-> {name}")
        texts, found = [], {}
        if site:
            for path in CANDIDATE_PATHS[:MAX_PAGES_PER_SITE * 2]:
                if len(texts) >= MAX_PAGES_PER_SITE:
                    break
                raw = fetch(site + path)
                if not raw:
                    continue
                for e in EMAIL_RE.findall(raw):
                    e = e.strip(".").lower()
                    if e.endswith((".png", ".jpg", ".gif", ".webp", ".svg")):
                        continue
                    found[e] = score_email(e, base_domain(site))
                texts.append(html_to_text(raw)[:4000])
        ranked = [e for e, s in sorted(found.items(), key=lambda kv: -kv[1]) if s >= 0]
        if not row["email"] and ranked:
            row["email"] = ranked[0]
        row["other_emails"] = " ".join(e for e in ranked if e != row["email"])[:500]
        # Keep a short excerpt of what the site says, used to personalize the email.
        row["page_text"] = " | ".join(texts)[:6000]
        print(f"   email: {row['email'] or '(none found, fill in by hand)'}")
        out.append(row)
    write_csv(P("contacts.csv"), out,
              ["name", "kind", "website", "email", "contact_name", "other_emails", "notes", "page_text"])
    print(f"\nSaved {len(out)} rows to contacts.csv. Check the email column before drafting.")


# ---------- step 2: draft personalized emails with Claude ----------

DRAFT_SCHEMA = {
    "type": "object",
    "properties": {
        "subject": {"type": "string"},
        "body": {"type": "string"},
        "personal_detail_used": {"type": "string"},
    },
    "required": ["subject", "body", "personal_detail_used"],
    "additionalProperties": False,
}

SYSTEM_PROMPT = """You write short, warm, genuine emails from a college student to a school or company, asking whether they could send some free merch. Mention the items from the sender profile (items_i_would_love) naturally, as examples, not a shopping list.

Rules:
- Sound like a real person wrote it by hand. No marketing language, no hype, no emojis, no em-dashes.
- 90 to 150 words in the body. Short paragraphs.
- Open with one specific, true detail about THIS recipient taken from the page excerpt or notes (a program, a team, a product, a tradition, an event). Never invent facts. If the excerpt has nothing specific, use the notes, and if those are empty, keep the opener honest and general.
- Explain briefly who the sender is and why they genuinely care about this school or company, using only facts from the sender profile.
- Make the ask clearly and politely, say any small item would be appreciated, and include the mailing address from the profile.
- Make it easy to say no. Thank them.
- Sign off with the sender's name and the signature from the profile.
- Subject line: under 8 words, specific to the recipient, not clickbait.
- personal_detail_used: say in a few words which detail you personalized with, so the sender can fact-check it."""


def cmd_draft(args):
    try:
        import anthropic
    except ImportError:
        sys.exit("Run: pip install anthropic")
    cfg = load_config()
    client = anthropic.Anthropic()  # reads ANTHROPIC_API_KEY
    contacts = read_csv(P("contacts.csv"))
    drafts = {r["email"].lower(): r for r in read_csv(P("drafts.csv")) if r.get("email")}
    sent = {r["email"].lower() for r in read_csv(P("sent.csv"))}
    blocked = optouts()
    profile = json.dumps(cfg["sender_profile"], indent=2)
    made = 0
    for c in contacts:
        email = c.get("email", "").strip().lower()
        if not email or email in sent or email in blocked:
            continue
        if email in drafts and not args.redo:
            continue
        if args.limit and made >= args.limit:
            break
        print(f"-> drafting for {c['name']} <{email}>")
        user_msg = (
            f"SENDER PROFILE:\n{profile}\n\n"
            f"RECIPIENT: {c['name']} ({c.get('kind','school')})\n"
            f"Contact name (may be blank): {c.get('contact_name','')}\n"
            f"Sender's own notes about this recipient: {c.get('notes','')}\n\n"
            f"EXCERPT FROM THEIR PUBLIC WEBSITE:\n{c.get('page_text','')[:6000]}"
        )
        try:
            resp = client.beta.messages.create(
                model=cfg.get("model", "claude-opus-5-5"),
                max_tokens=4000,
                system=SYSTEM_PROMPT,
                messages=[{"role": "user", "content": user_msg}],
                output_config={"effort": "low",
                               "format": {"type": "json_schema", "schema": DRAFT_SCHEMA}},
                betas=["server-side-fallback-2026-07-01"],
                fallbacks="default",
            )
        except anthropic.RateLimitError:
            print("   rate limited, waiting 30s"); time.sleep(30); continue
        except anthropic.APIStatusError as e:
            print(f"   API error {e.status_code}: {e.message}"); continue
        except anthropic.APIConnectionError:
            print("   network error, skipping"); continue
        if resp.stop_reason == "refusal":
            print("   declined, skipping"); continue
        text = "".join(b.text for b in resp.content if b.type == "text")
        try:
            d = json.loads(text)
        except json.JSONDecodeError:
            print("   bad output, skipping"); continue
        drafts[email] = {"approved": "", "name": c["name"], "email": email,
                         "subject": d["subject"], "body": d["body"],
                         "personal_detail_used": d["personal_detail_used"]}
        made += 1
        write_csv(P("drafts.csv"), list(drafts.values()),
                  ["approved", "name", "email", "subject", "body", "personal_detail_used"])
    print(f"\nWrote {made} new drafts to drafts.csv. Read each one and put 'yes' in the approved column.")


# ---------- step 3: send ----------

def cmd_send(args):
    cfg = load_config()
    s = pick_sender(cfg, args.account)
    cap = args.limit or cfg.get("daily_cap", DAILY_CAP_DEFAULT)
    today = dt.date.today().isoformat()
    sent_rows = read_csv(P("sent.csv"))
    sent = {r["email"].lower() for r in sent_rows}
    sent_today = sum(1 for r in sent_rows if r["date"].startswith(today))
    left = max(0, cap - sent_today)
    blocked = optouts()
    queue = [d for d in read_csv(P("drafts.csv"))
             if d.get("approved", "").strip().lower() in ("yes", "y", "1", "x")
             and d["email"].lower() not in sent and d["email"].lower() not in blocked]
    queue = queue[:left]
    print(f"Sending from {s['from_address']} ({s['source']}).")
    print(f"{sent_today} sent today, cap {cap}. {len(queue)} ready to go.")
    if not queue:
        return
    if not args.live:
        for d in queue:
            print(f"\nTO: {d['email']}\nSUBJECT: {d['subject']}\n{d['body']}\n" + "-" * 50)
        print("\nDry run only. Add --live to send these.")
        return

    ctx = ssl.create_default_context()
    if s["secure"]:
        server_cm = smtplib.SMTP_SSL(s["host"], s["port"], timeout=60, context=ctx)
    else:
        server_cm = smtplib.SMTP(s["host"], s["port"], timeout=60)
    with server_cm as server:
        if not s["secure"]:
            server.starttls(context=ctx)
        server.login(s["username"], s["password"])
        for i, d in enumerate(queue):
            msg = EmailMessage()
            msg["From"] = formataddr((s["name"], s["from_address"]))
            msg["To"] = d["email"]
            msg["Subject"] = d["subject"]
            msg["Message-ID"] = make_msgid()
            msg.set_content(d["body"] + "\n\n" + cfg.get(
                "footer", "If you'd rather not hear from me again, just reply 'no thanks' and I won't email again."))
            try:
                server.send_message(msg)
            except smtplib.SMTPException as e:
                print(f"   failed for {d['email']}: {e}. Stopping so the account isn't flagged.")
                break
            sent_rows.append({"date": dt.datetime.now().isoformat(timespec="seconds"),
                              "name": d["name"], "email": d["email"], "subject": d["subject"]})
            write_csv(P("sent.csv"), sent_rows, ["date", "name", "email", "subject"])
            print(f"   sent {i+1}/{len(queue)} to {d['email']}")
            if i < len(queue) - 1:
                time.sleep(random.randint(*SEND_GAP_SEC))
    print("Done.")


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    f = sub.add_parser("find"); f.add_argument("--refresh", action="store_true", help="re-scan sites already done")
    d = sub.add_parser("draft"); d.add_argument("--limit", type=int, default=0); d.add_argument("--redo", action="store_true")
    s = sub.add_parser("send"); s.add_argument("--live", action="store_true"); s.add_argument("--limit", type=int, default=0)
    s.add_argument("--account", help="email of a saved account to send from (default: the default account)")
    sub.add_parser("accounts", help="list email accounts saved in the web page")
    args = ap.parse_args()
    load_env_files()
    {"find": cmd_find, "draft": cmd_draft, "send": cmd_send, "accounts": cmd_accounts}[args.cmd](args)


if __name__ == "__main__":
    main()
