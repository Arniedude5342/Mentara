# Mentara Outreach Engine

Automated cold outreach to recruit **mentors** (individuals) and **partner companies**.
It reads prospects from your Notion database, writes a personalized email for each one
**into your Gmail Drafts** (you review + send by hand), runs a 3-step follow-up sequence,
auto-detects replies/opt-outs, and writes status back to Notion.

> **Default = draft mode.** Nothing is sent automatically. The script drops emails in your
> Gmail Drafts; you open Gmail, glance over them, and hit send. Add `--send` only once you
> trust the output and want it hands-free.

- **Notion tracker:** "Mentor & Company Outreach" (under your Mentara page)
- **Script:** `mentara_outreach.py`
- **Only dependency:** `requests`

---

## ⚠️ Read this first (safety)

You chose **fully automated sending from your personal Gmail**. That's the highest-risk setup:
cold email can land in spam and, at volume, can get your main Google account flagged — and that
account is tied to everything you own. To stay safe:

1. **Start in `--dry-run`**, then send a real test to yourself, *before* going live.
2. **Keep `DAILY_CAP` low** (start at 15–20/day, raise by ~5/week max). The default is 25.
3. **Warm up:** a brand-new sending habit looks suspicious. Ramp slowly; don't blast 200 on day one.
4. **Personalize** — fill the `Personalization` field in Notion for each prospect. Generic mail = spam + no replies.
5. **Compliance is built in** (opt-out line + reply detection), but only email people with a
   legitimate reason to hear from you. Don't email Canadian contacts without prior consent (CASL).
6. Consider moving to a dedicated **arnav@mentara.me** sending address later — it protects your
   personal account and looks more credible.

---

## Setup (one time, ~10 min)

### 1. Install
```bash
cd outreach
python3 -m pip install -r requirements.txt
cp .env.example .env
```

### 2. Gmail app password
- Turn on **2-Step Verification**: https://myaccount.google.com/security
- Create an **App Password**: https://myaccount.google.com/apppasswords
- Put it in `.env` as `GMAIL_APP_PASSWORD` (the 16-char code, spaces ok).

### 3. Notion integration
- Go to https://www.notion.so/profile/integrations → **New integration** (internal). Copy the token (starts `ntn_`).
- Open the **Mentor & Company Outreach** database in Notion → top-right `•••` → **Connections** → add your integration.
- Paste the token into `.env` as `NOTION_TOKEN`. (`NOTION_DB_ID` is already filled in.)

> If the script can't see your prospects, it's almost always step 3 — the database must be shared with the integration.

### 4. Add prospects
Two ways:
- **Manually** in Notion: one row per person. Set `Type`, `Email`, `Field`, `Company`, `Role`, and a `Personalization` sentence. Leave `Status` = **Queued**.
- **Bulk via CSV:** edit `prospects_template.csv`, then in Notion open the database → `•••` → **Merge with CSV** (or create a new view and import). Delete the example rows first.

**Where to find prospects (legitimately):** LinkedIn search by title+industry, company "Contact"/"Team" pages, your school's alumni office, professional associations, Rotary clubs. Don't scrape; don't guess emails.

---

## Run it

```bash
# 1) Preview — touches nothing, just prints who/what
python3 mentara_outreach.py --dry-run

# 2) DEFAULT: create drafts in your Gmail (review + send them yourself)
python3 mentara_outreach.py

# 3) Only when you're ready to go hands-free: actually send
python3 mentara_outreach.py --send

# Other modes (work with draft or --send)
python3 mentara_outreach.py --first-only          # no follow-ups
python3 mentara_outreach.py --followups-only       # only chase existing threads
python3 mentara_outreach.py --check-replies-only   # just scan inbox for replies/opt-outs
python3 mentara_outreach.py --max 5                # cap this run at 5
```

**Recommended daily flow:** run `python3 mentara_outreach.py` each morning → open Gmail →
review the new drafts → send the good ones. Each run writes a line per email to `outreach_log.csv`.

> Draft mode advances each prospect's Notion status (e.g. Queued → Sent 1) so they aren't
> re-drafted and follow-ups schedule correctly. So **send your drafts the same day you generate
> them.** If you decide to skip someone, set their status to `Do Not Contact` in Notion.

---

## How the sequence works

| Stage | Picks up rows with… | Sends | Moves status to |
|-------|--------------------|-------|-----------------|
| First touch | `Status = Queued` | Email A (individual) or Email B (company) | `Sent 1` |
| Follow-up 1 | `Sent 1` + last contacted ≥ `FOLLOWUP1_DAYS` ago | short nudge | `Sent 2` |
| Follow-up 2 | `Sent 2` + last contacted ≥ `FOLLOWUP2_DAYS` ago | final nudge | `Sent 3 / Done` |

The script **never** re-emails anyone whose status is `Replied`, `Meeting Booked`, `Onboarded`,
`Unsubscribed`, or `Do Not Contact`. To stop a thread manually, just set one of those in Notion.
The IMAP reply check auto-sets `Replied` (or `Unsubscribed` if the reply asks to stop).

---

## Schedule it daily (cron, macOS)

Run `crontab -e` and add (adjust the absolute paths):

```cron
# 9:10am every weekday — only first touches + follow-ups, capped by .env
10 9 * * 1-5 cd /Users/arnavmalhotra/Downloads/Mentara/outreach && /usr/bin/python3 mentara_outreach.py >> cron.log 2>&1
```

For an extra guard, set `SEND_WINDOW_START=9` and `SEND_WINDOW_END=17` in `.env` so it refuses to
send outside business hours even if cron misfires.

> On modern macOS, cron needs Full Disk Access for `cron` under System Settings → Privacy & Security,
> or use `launchd` instead. If you'd rather, just run the command manually each morning — it takes seconds.

---

## Troubleshooting

- **`Missing required env var`** → fill it in `.env`.
- **Notion 404 / no prospects** → database not shared with the integration (Setup step 3).
- **Gmail auth error** → you used your normal password; use an **app password** with 2FA on.
- **Everything goes to spam** → cap too high / not personalized / sending too fast. Slow down, personalize, warm up.
