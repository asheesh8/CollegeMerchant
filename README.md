# Free merch request emailer

Finds the right public contact at each school or company, has Claude write a short, personal email for each one, and sends them slowly from your own email account (Gmail or any other).

## One-time setup (about 10 minutes)

1. Install Python 3.10+ and run `pip install -r requirements.txt`
2. Get a Claude API key at https://console.anthropic.com and run `export ANTHROPIC_API_KEY=sk-ant-...`
   Each email costs well under a cent to write.
3. Add the email account(s) you want to send from in the web page (see "Email accounts page" below).
   It works with Gmail (app password), Outlook, Yahoo, iCloud, Zoho, or any SMTP server.
4. `cp config.example.json config.json`, then fill in your mailing address
   (where the merch goes), and anything true about you in `sender_profile`. The more real detail, the better the emails.

## The portal (web app)

Everything can now be done from the website, no terminal needed:

1. **Accounts**: connect the email you send from (Gmail, school Google/Microsoft account, or any SMTP).
2. **Settings**: fill in your profile and **mailing address**. Every email is written from this, so keep it true. The daily limit starts at 20.
3. **Places**: add schools and companies (one at a time, or paste a list: `name, website, why you like them`).
   Click **Find emails** to read a few public pages of each site (follows robots.txt, pauses between pages),
   then **Write drafts** to have Claude write a personal email for each one.
   Finding emails runs on the server, so you can close the page once it starts: each step looks up a place
   in the background and then starts the next step itself (Vercel's free cron only runs once a day, so it
   doesn't wait for one). Opening Places shows progress and a Stop button, and picks a run back up if it
   was interrupted, for example by a redeploy. A daily cron (`/api/agent/find-job/cron`) does the same as a
   backup. Optional: set `CRON_SECRET` in Vercel so only Vercel's cron can call it.
4. **Review**: read each draft, fact-check the detail it used, edit anything, and **Approve** it. Nothing is sent without your approval.
5. **Dashboard**: click **Start sending**. Emails go out one at a time with a random 2 to 5 minute gap, up to your daily limit.
   Keep the tab open while it runs; close it or click Stop to pause.
6. **Sent**: see everything that went out. Mark replies, and mark "Said no" to add someone to the opt-out list.

It never emails the same address twice and always skips the opt-out list.

**Drafts without an API key:** a daily scheduled Claude task (on your Claude subscription) does the drafting. In Settings > Daily drafting task, click **Make a token** and save it as `CM_AGENT_TOKEN` in the Claude cloud environment the task runs in. The task calls `/api/agent/*` with `Authorization: Bearer <token>`: it reads the queue, asks the site to look up emails, and hands back drafts, which land in Review. It can't approve or send. Only the token's SHA-256 hash is stored (or set `PORTAL_AGENT_TOKEN` in Vercel instead).

Optional: set `ANTHROPIC_API_KEY` in Vercel to also get **Write drafts** and **Rewrite** buttons on the site, billed to that API key.

## Email accounts page

A small locked web page where you type an email address, enter its password or app password, test it, and save it.
`merch.py send` then sends from your default account (or `--account you@example.com`). Run `python merch.py accounts` to list them.

**On your laptop**

1. Install Node 20+ and run `npm install`
2. `cp .env.example .env.local`, then fill in:
   - `ADMIN_PASSWORD`: anything you like, used to open the page
   - `ACCOUNTS_KEY`: run `openssl rand -base64 32` and paste the result. This encrypts the saved passwords.
3. `npm run dev` and open http://localhost:3000. Accounts are saved, encrypted, to `.data/accounts.json` (never committed).

**On Vercel**

1. Import the repo in Vercel. It detects Next.js; no settings to change.
2. In Project > Settings > Environment Variables, add `ADMIN_PASSWORD` and `ACCOUNTS_KEY`.
3. In the Storage tab, add an Upstash Redis database to the project (free tier is plenty). That sets `KV_REST_API_URL` and `KV_REST_API_TOKEN`.
4. Redeploy. To have `merch.py` on your laptop use the accounts saved on Vercel, copy `ACCOUNTS_KEY`, `KV_REST_API_URL`
   and `KV_REST_API_TOKEN` into your local `.env.local`.

**Gmail:** turn on 2-Step Verification, then make an app password at https://myaccount.google.com/apppasswords
and paste it in. Your normal Gmail password won't work.

How the secrets are kept: passwords are encrypted with AES-256-GCM using `ACCOUNTS_KEY` before they're stored, the page never
sends a saved password back to the browser, and every page and API route needs the admin password (signed, HTTP-only cookie).
If you lose `ACCOUNTS_KEY` you'll need to re-enter the passwords. If you never save an account, the old `smtp` block in
config.json plus `SMTP_PASSWORD` still works.

## Every time

1. **Add targets** to `targets.csv`, one per row: `name, website, kind (school/company), contact_email, contact_name, notes`.
   Leave `contact_email` blank to let the tool look for one. Put a real reason in `notes`
   (e.g. "applying to their MS in Cybersecurity", "I use CUDA in class"). That's what makes the email personal.
2. `python merch.py find` scans a few public pages per site (contact, admissions, alumni, marketing),
   follows robots.txt, and waits 4 seconds between pages. Results go to `contacts.csv`.
   Check the `email` column. Companies like Apple and NVIDIA rarely list emails, so for those, add a
   contact you found yourself (university relations, campus recruiting, a dev-relations or community team).
3. `python merch.py draft` writes one email per contact into `drafts.csv`, using real details from their site and your notes.
   The `personal_detail_used` column shows what it referenced so you can fact-check in seconds.
4. Open `drafts.csv`, edit anything you want, and type `yes` in `approved` for the ones to send.
5. `python merch.py send` shows exactly what would go out. `python merch.py send --live` sends it.

## Built-in safety

- **Daily cap of 40** with a random 1.5 to 4 minute gap between emails. Gmail flags new senders who blast hundreds of
  near-identical emails, and a flagged account can get locked. Once you're getting replies and no bounces, raise
  `daily_cap` in config.json by about 20 per week. Personal Gmail tops out around 500 a day, and you don't want to get near that.
- Never emails the same address twice (tracked in `sent.csv`).
- Anyone who says no goes in `optout.txt` and is skipped forever.
- Stops sending right away if Gmail returns an error.
- Only reads public pages, obeys robots.txt, and skips addresses like privacy@, security@, jobs@ and noreply@.

## Tips that get more merch

- Admissions offices for programs you're actually applying to are your best bet. Say that you're applying.
- Alumni and marketing/brand offices often have swag budgets.
- For tech companies, campus recruiting and developer-community teams send swag. So do hackathon sponsors.
- Reply to every response quickly and send a thank-you photo when merch shows up. People like that.
