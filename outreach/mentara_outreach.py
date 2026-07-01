#!/usr/bin/env python3
"""
Mentara cold-outreach engine.

Reads prospects from a Notion database and, for each one, prepares a personalized
cold email and advances it through a 3-step sequence (first touch -> follow-up 1
-> follow-up 2), writing status back to Notion. Optionally scans your inbox over
IMAP to auto-detect replies / opt-outs and stop emailing those people.

DEFAULT MODE IS "DRAFT": it drops each email into your Gmail Drafts folder for you
to review and send by hand (safest, best reply rates). Use --send to actually send,
or --dry-run to preview without touching anything. Read README.md first.

Only third-party dependency: requests  (everything else is the stdlib).
"""

import argparse
import csv
import os
import random
import smtplib
import sys
import time
from datetime import date, datetime, timedelta
from email.message import EmailMessage
from email.utils import formataddr
from pathlib import Path

import requests

NOTION_VERSION = "2022-06-28"
NOTION_API = "https://api.notion.com/v1"

# Statuses the sequence should never touch again.
SKIP_STATUSES = {"Replied", "Meeting Booked", "Onboarded", "Unsubscribed",
                 "Do Not Contact", "Sent 3 / Done"}
# If a reply body contains any of these, mark them Unsubscribed instead of Replied.
STOP_WORDS = ("unsubscribe", "stop emailing", "opt out", "opt-out",
              "not interested", "take me off", "remove me", "do not contact")
# When advancing, this is the status we move the prospect TO.
NEXT_STATUS = {"first": "Sent 1", "f1": "Sent 2", "f2": "Sent 3 / Done"}


# --------------------------------------------------------------------------- #
# Config
# --------------------------------------------------------------------------- #
def load_env_file():
    """Minimal .env loader so we don't need python-dotenv."""
    path = Path(__file__).with_name(".env")
    if not path.exists():
        return
    for line in path.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))


def env(key, default=None, required=False, cast=str):
    val = os.environ.get(key, default)
    if required and (val is None or val == ""):
        sys.exit(f"[config] Missing required env var: {key}  (see .env.example)")
    if val is None or val == "":
        return None if cast is not str else (default or "")
    if cast is bool:
        return str(val).strip().lower() in ("1", "true", "yes", "on")
    return cast(val)


def build_cfg():
    return {
        "gmail_address": env("GMAIL_ADDRESS", required=True),
        "gmail_app_password": env("GMAIL_APP_PASSWORD", required=True),
        "from_name": env("FROM_NAME", "Arnav Malhotra"),
        "reply_to": env("REPLY_TO", ""),
        "notion_token": env("NOTION_TOKEN", required=True),
        "notion_db_id": env("NOTION_DB_ID", required=True),
        "daily_cap": env("DAILY_CAP", "25", cast=int),
        "followup1_days": env("FOLLOWUP1_DAYS", "3", cast=int),
        "followup2_days": env("FOLLOWUP2_DAYS", "5", cast=int),
        "min_delay": env("MIN_DELAY_SEC", "45", cast=int),
        "max_delay": env("MAX_DELAY_SEC", "150", cast=int),
        "check_replies": env("CHECK_REPLIES", "true", cast=bool),
        "imap_host": env("IMAP_HOST", "imap.gmail.com"),
        "drafts_folder": env("DRAFTS_FOLDER", "[Gmail]/Drafts"),
        "physical_address": env("PHYSICAL_ADDRESS", ""),
        "send_window_start": env("SEND_WINDOW_START", ""),
        "send_window_end": env("SEND_WINDOW_END", ""),
        "do_first": True,
        "do_followups": True,
    }


# --------------------------------------------------------------------------- #
# Notion API
# --------------------------------------------------------------------------- #
def notion_headers(token):
    return {
        "Authorization": f"Bearer {token}",
        "Notion-Version": NOTION_VERSION,
        "Content-Type": "application/json",
    }


def notion_query(db_id, headers, flt=None):
    results, payload = [], {"page_size": 100}
    if flt:
        payload["filter"] = flt
    url = f"{NOTION_API}/databases/{db_id}/query"
    while True:
        r = requests.post(url, headers=headers, json=payload, timeout=30)
        r.raise_for_status()
        data = r.json()
        results.extend(data.get("results", []))
        if data.get("has_more"):
            payload["start_cursor"] = data["next_cursor"]
        else:
            return results


def notion_update(page_id, headers, properties):
    r = requests.patch(f"{NOTION_API}/pages/{page_id}", headers=headers,
                       json={"properties": properties}, timeout=30)
    r.raise_for_status()
    return r.json()


def _rich(prop):
    return "".join(t.get("plain_text", "") for t in (prop or [])).strip()


def parse_row(page):
    p = page["properties"]

    def sel(name):
        s = p.get(name, {}).get("select")
        return s["name"] if s else None

    return {
        "id": page["id"],
        "name": _rich(p.get("Name", {}).get("title")),
        "type": sel("Type") or "Individual",
        "company": _rich(p.get("Company", {}).get("rich_text")),
        "role": _rich(p.get("Role", {}).get("rich_text")),
        "field": sel("Field") or "your field",
        "email": p.get("Email", {}).get("email"),
        "status": sel("Status"),
        "personalization": _rich(p.get("Personalization", {}).get("rich_text")),
    }


# --------------------------------------------------------------------------- #
# Email templates
# --------------------------------------------------------------------------- #
def first_name(name):
    name = (name or "").strip()
    return name.split()[0] if name else "there"


def footer(cfg):
    lines = [f"{cfg['from_name']}", "Founder, Mentara · mentara.me"]
    if cfg.get("physical_address"):
        lines.append(cfg["physical_address"])
    return "\n\n" + "\n".join(lines)


def build_email(row, stage, cfg):
    fn = first_name(row["name"])
    field = row["field"]
    company = row["company"] or "your team"
    perso = (row["personalization"] or "").strip()
    perso_line = (perso + "\n\n") if perso else ""
    is_company = row["type"] == "Company"

    if stage == "first" and is_company:
        subject = f"A founding mentor cohort for {company}? (Mentara launches soon)"
        body = (
            f"Hi {fn},\n\n"
            f"I'm {cfg['from_name']}, the founder of Mentara, an app launching soon "
            f"that matches teenagers with mentors in the careers they're curious "
            f"about. We're lining up a few founding partner organizations before we "
            f"open. "
            f"{perso_line}"
            f"{company} stood out because you have so many people in {field}, which is "
            f"exactly who teenagers want to learn from.\n\n"
            f"The idea is simple. We set up a {company} founding mentor cohort inside "
            f"Mentara. Anyone on your team who opts in sets their own availability and "
            f"gets matched with students for short conversations, usually 15 to 30 "
            f"minutes, on their own schedule. For {company} it's basically a ready "
            f"made employee volunteering and community program, with no platform to "
            f"build and no admin work on your end.\n\n"
            f"Since we're still pre launch, founding cohorts help shape the program "
            f"and get credited as launch partners.\n\n"
            f"Could I grab 15 minutes with you, or whoever runs employee volunteering "
            f"or L&D, before we go live? And if it's not a fit, no problem at all."
        )
    elif stage == "first":
        subject = "Want to be a founding mentor? (Mentara launches soon)"
        body = (
            f"Hi {fn},\n\n"
            f"I'm {cfg['from_name']}, the founder of Mentara. It's a mobile app "
            f"launching really soon that matches teenagers with mentors in careers "
            f"they're curious about. I'm bringing on a small group of founding mentors "
            f"before we open, so students actually have great people to learn from on "
            f"day one.\n\n"
            f"{perso_line}"
            f"I came across your background in {field} and honestly thought you'd be "
            f"perfect for this.\n\n"
            f"Being a mentor is light. You set your own availability, students get "
            f"matched to you, and you message or hop on a short call when it works for "
            f"you, usually 15 to 30 minutes. No prep, no long term commitment.\n\n"
            f"Would you want to be a founding mentor? You can set it up in about 2 "
            f"minutes at mentara.me, or just reply here and I'll get you sorted. And "
            f"if it's not for you, totally fine, just let me know."
        )
    elif stage == "f1":
        subject = f"Re: Mentara x {company}" if is_company else "Re: becoming a founding mentor"
        body = (
            f"Hi {fn},\n\n"
            f"Just floating this back to the top of your inbox. We're getting close to "
            f"launch and I'm finalizing our founding mentors. Even 15 minutes a month "
            f"from someone like you could completely change how a teenager sees their "
            f"future.\n\n"
            f"Want me to save you a spot?"
        )
    else:  # f2
        subject = f"Re: Mentara x {company}" if is_company else "Re: becoming a founding mentor"
        body = (
            f"Hi {fn},\n\n"
            f"Last note from me, I promise. We open soon, and if being a founding "
            f"mentor isn't the right fit right now, no worries at all. If you know one "
            f"person who'd be great with students, an intro would mean the world.\n\n"
            f"Thank you either way."
        )

    return subject, body + footer(cfg)


# --------------------------------------------------------------------------- #
# Sending
# --------------------------------------------------------------------------- #
def _build_message(cfg, to_email, subject, body):
    msg = EmailMessage()
    msg["From"] = formataddr((cfg["from_name"], cfg["gmail_address"]))
    msg["To"] = to_email
    msg["Subject"] = subject
    if cfg.get("reply_to"):
        msg["Reply-To"] = cfg["reply_to"]
    msg.set_content(body)
    return msg


def send_email(cfg, to_email, subject, body):
    msg = _build_message(cfg, to_email, subject, body)
    with smtplib.SMTP_SSL("smtp.gmail.com", 465, timeout=30) as s:
        s.login(cfg["gmail_address"], cfg["gmail_app_password"])
        s.send_message(msg)


def create_draft(cfg, to_email, subject, body):
    """Append the message to Gmail's Drafts folder via IMAP — nothing is sent."""
    import imaplib
    msg = _build_message(cfg, to_email, subject, body)
    folder = cfg.get("drafts_folder") or "[Gmail]/Drafts"
    if not folder.startswith('"'):
        folder = f'"{folder}"'  # IMAP needs the mailbox name quoted
    M = imaplib.IMAP4_SSL(cfg.get("imap_host", "imap.gmail.com"))
    try:
        M.login(cfg["gmail_address"], cfg["gmail_app_password"])
        M.append(folder, "\\Draft", imaplib.Time2Internaldate(time.time()),
                 msg.as_bytes())
    finally:
        try:
            M.logout()
        except Exception:
            pass


def log_send(stage, row, dry):
    log_path = Path(__file__).with_name("outreach_log.csv")
    is_new = not log_path.exists()
    with log_path.open("a", newline="") as f:
        w = csv.writer(f)
        if is_new:
            w.writerow(["timestamp", "stage", "name", "email", "type",
                        "status_before", "dry_run"])
        w.writerow([datetime.now().isoformat(timespec="seconds"), stage,
                    row["name"], row["email"], row["type"], row["status"], dry])


# --------------------------------------------------------------------------- #
# Reply / opt-out detection (IMAP)
# --------------------------------------------------------------------------- #
def _top_reply_text(raw):
    """Return the lowercased *new* portion of a reply, excluding quoted history."""
    import email as emaillib
    msg = emaillib.message_from_bytes(raw)
    body = ""
    if msg.is_multipart():
        for part in msg.walk():
            if part.get_content_type() == "text/plain":
                payload = part.get_payload(decode=True) or b""
                body = payload.decode(part.get_content_charset() or "utf-8", "ignore")
                break
    else:
        payload = msg.get_payload(decode=True) or b""
        body = payload.decode(msg.get_content_charset() or "utf-8", "ignore")
    # Cut at common quote markers so our own "Reply STOP" footer (quoted back)
    # doesn't trigger a false opt-out.
    markers = ["\n>", "\nOn ", "-----Original", "\nFrom:", "\n—\n", "wrote:"]
    cut = len(body)
    for m in markers:
        i = body.find(m)
        if i != -1:
            cut = min(cut, i)
    return body[:cut].lower()


def check_replies(cfg, headers):
    import imaplib
    db = cfg["notion_db_id"]
    rows = []
    for st in ("Sent 1", "Sent 2", "Sent 3 / Done"):
        rows += [parse_row(p) for p in
                 notion_query(db, headers, {"property": "Status", "select": {"equals": st}})]
    if not rows:
        return
    try:
        M = imaplib.IMAP4_SSL(cfg.get("imap_host", "imap.gmail.com"))
        M.login(cfg["gmail_address"], cfg["gmail_app_password"])
        M.select("INBOX")
    except Exception as e:
        print(f"[warn] IMAP login failed, skipping reply check: {e}")
        return
    for row in rows:
        if not row["email"]:
            continue
        try:
            _, data = M.search(None, "FROM", f'"{row["email"]}"')
            ids = data[0].split() if data and data[0] else []
            if not ids:
                continue
            _, msgdata = M.fetch(ids[-1], "(RFC822)")
            raw = msgdata[0][1] if msgdata and msgdata[0] else b""
            text = _top_reply_text(raw)
            new_status = "Unsubscribed" if any(w in text for w in STOP_WORDS) else "Replied"
            notion_update(row["id"], headers, {"Status": {"select": {"name": new_status}}})
            print(f"[reply] {row['name']} <{row['email']}> -> {new_status}")
        except Exception as e:
            print(f"[warn] reply check failed for {row['email']}: {e}")
    try:
        M.logout()
    except Exception:
        pass


# --------------------------------------------------------------------------- #
# Pipeline
# --------------------------------------------------------------------------- #
def candidates(cfg, headers):
    db, today = cfg["notion_db_id"], date.today()
    f1_cut = (today - timedelta(days=cfg["followup1_days"])).isoformat()
    f2_cut = (today - timedelta(days=cfg["followup2_days"])).isoformat()
    out = []
    if cfg["do_followups"]:
        # Warmest first: close out follow-up 2, then follow-up 1.
        for p in notion_query(db, headers, {"and": [
                {"property": "Status", "select": {"equals": "Sent 2"}},
                {"property": "Last Contacted", "date": {"on_or_before": f2_cut}}]}):
            out.append(("f2", parse_row(p)))
        for p in notion_query(db, headers, {"and": [
                {"property": "Status", "select": {"equals": "Sent 1"}},
                {"property": "Last Contacted", "date": {"on_or_before": f1_cut}}]}):
            out.append(("f1", parse_row(p)))
    if cfg["do_first"]:
        for p in notion_query(db, headers, {"property": "Status", "select": {"equals": "Queued"}}):
            out.append(("first", parse_row(p)))
    return out


def run(cfg, args, mode):
    headers = notion_headers(cfg["notion_token"])
    if cfg["check_replies"] and not args.no_reply_check:
        check_replies(cfg, headers)

    items = candidates(cfg, headers)
    cap = args.max if args.max is not None else cfg["daily_cap"]
    today, done = date.today(), 0
    verb = {"draft": "drafted", "send": "sent", "dry": "previewed"}[mode]

    for stage, row in items:
        if done >= cap:
            print(f"[cap] reached limit of {cap} for this run.")
            break
        if not row["email"]:
            print(f"[skip] {row['name']}: no email yet — add it in Notion to activate.")
            continue

        subject, body = build_email(row, stage, cfg)

        if mode == "dry":
            print(f"[dry-run] {stage:5} -> {row['name']} <{row['email']}> | {subject}")
            log_send(stage, row, True)
            done += 1
            continue

        try:
            if mode == "draft":
                create_draft(cfg, row["email"], subject, body)
            else:
                send_email(cfg, row["email"], subject, body)
        except Exception as e:
            print(f"[error] {mode} failed for {row['email']}: {e}")
            continue

        next_status = NEXT_STATUS[stage]
        props = {
            "Status": {"select": {"name": next_status}},
            "Last Contacted": {"date": {"start": today.isoformat()}},
        }
        if stage == "first":
            props["Next Follow-up"] = {"date": {"start":
                (today + timedelta(days=cfg["followup1_days"])).isoformat()}}
        elif stage == "f1":
            props["Next Follow-up"] = {"date": {"start":
                (today + timedelta(days=cfg["followup2_days"])).isoformat()}}
        else:
            props["Next Follow-up"] = {"date": None}
        try:
            notion_update(row["id"], headers, props)
        except Exception as e:
            print(f"[warn] {verb} but Notion update failed for {row['name']}: {e}")

        log_send(stage, row, False)
        done += 1
        print(f"[{verb}] {stage:5} -> {row['name']} <{row['email']}> "
              f"({row['status']} -> {next_status})  [{done}/{cap}]")

        # Throttle only matters for real sends; drafts are local.
        if done < cap and mode == "send":
            time.sleep(random.randint(cfg["min_delay"], cfg["max_delay"]))

    tail = " — review them in Gmail and hit send." if mode == "draft" else "."
    print(f"Done. {done} email(s) {verb}{tail}")


def main():
    load_env_file()
    parser = argparse.ArgumentParser(description="Mentara cold-outreach engine")
    parser.add_argument("--send", action="store_true",
                        help="Actually SEND the emails (default is to create Gmail drafts)")
    parser.add_argument("--dry-run", action="store_true",
                        help="Preview only — create no drafts and send nothing")
    parser.add_argument("--max", type=int, default=None,
                        help="Override the daily cap for this run")
    parser.add_argument("--first-only", action="store_true",
                        help="Only send first-touch emails (no follow-ups)")
    parser.add_argument("--followups-only", action="store_true",
                        help="Only send follow-ups (no new first-touch)")
    parser.add_argument("--no-reply-check", action="store_true",
                        help="Skip the IMAP reply / opt-out scan this run")
    parser.add_argument("--check-replies-only", action="store_true",
                        help="Only scan for replies / opt-outs, then exit")
    args = parser.parse_args()

    cfg = build_cfg()
    if args.first_only:
        cfg["do_followups"] = False
    if args.followups_only:
        cfg["do_first"] = False

    if args.check_replies_only:
        check_replies(cfg, notion_headers(cfg["notion_token"]))
        return

    mode = "dry" if args.dry_run else ("send" if args.send else "draft")

    # Optional cron safety: never auto-SEND outside a configured hour window.
    # (Drafts are harmless any time, so the guard only applies to --send.)
    if mode == "send" and cfg["send_window_start"] and cfg["send_window_end"]:
        h = datetime.now().hour
        if not (int(cfg["send_window_start"]) <= h < int(cfg["send_window_end"])):
            print(f"[guard] outside send window "
                  f"{cfg['send_window_start']}-{cfg['send_window_end']}h; exiting.")
            return

    run(cfg, args, mode)


if __name__ == "__main__":
    main()
