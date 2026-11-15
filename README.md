# Free merch request emailer

Finds the right public contact at each school or company, has Claude write a short, personal email for each one, and sends them slowly from your own Gmail.

## One-time setup (about 10 minutes)

1. Install Python 3.10+ and run `pip install -r requirements.txt`
2. Get a Claude API key at https://console.anthropic.com and run `export ANTHROPIC_API_KEY=sk-ant-...`
   Each email costs well under a cent to write.
3. Gmail app password: turn on 2-Step Verification, then go to https://myaccount.google.com/apppasswords and make one.
   Run `export SMTP_PASSWORD=the16charpassword` (don't put it in a file you share).
4. `cp config.example.json config.json`, then fill in your Gmail address, your mailing address
   (where the merch goes), and anything true about you in `sender_profile`. The more real detail, the better the emails.

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
