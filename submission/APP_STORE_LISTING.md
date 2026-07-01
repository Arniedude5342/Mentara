# Mentara — App Store Connect Submission Kit

Everything you paste into App Store Connect lives here. Character limits are noted in
parentheses; the provided copy is already within limits. Replace `‹...›` placeholders
with your real values when you have them.

- **App name:** Mentara
- **Bundle ID:** `com.mentara.app`
- **Version / Build:** 1.0.0 / 1
- **Primary category:** Education
- **Secondary category:** Lifestyle  *(alt: Social Networking — see note in §9)*
- **Support email:** mentarasupport@gmail.com

---

## 1. URLs (host the `submission/` folder — see README.md)

| Field | Value | Required? |
|---|---|---|
| **Privacy Policy URL** | `https://‹your-domain›/privacy-policy.html` | ✅ Required |
| **Support URL** | `https://‹your-domain›/` (the index page) | ✅ Required |
| **Marketing URL** | `https://‹your-domain›/` | Optional |
| **Terms of Use (EULA)** | `https://‹your-domain›/terms-of-service.html` | Optional but recommended |

> Once you host the folder (README has 3 one-click options), drop the real domain in here
> and in **App Store Connect → App Information** (Privacy Policy URL) and the **Version** page
> (Support/Marketing URLs).

---

## 2. Name & Subtitle

- **App Name (30):** `Mentara`
- **Subtitle (30):** `Free 1:1 mentorship, matched`  *(28 chars)*

---

## 3. Promotional Text (170, editable anytime without review)

```
Meet a mentor who's been exactly where you want to go. Get matched with a professor or pro in your field for real 1:1 guidance — monthly calls, always free.
```
*(156 chars)*

---

## 4. Description (4000 max)

```
Mentara connects you with a mentor who has actually walked the path you're on — a professor or working professional in your field — for free, one-on-one guidance.

No gatekeepers. No expensive coaching fees. Just real conversations with someone who's been there.

HOW IT WORKS
• Create a free account as a student or a mentor.
• Our AI reviews your goals and matches you with the right person — no endless browsing.
• Send a message to introduce yourself.
• Schedule a monthly 1-hour call over Zoom, Google Meet, or FaceTime.
• Keep growing, one call at a time.

FOR STUDENTS
Whether you're in high school mapping out a career, navigating undergrad, or deep in graduate research, Mentara gives you a direct line to expert guidance. Ask the questions you can't Google. Get honest feedback. Build a relationship that can shape your trajectory.

FOR MENTORS
You have hard-won knowledge that can change a student's direction. Mentara makes giving back simple: get matched with a motivated student in your area of expertise, and help on your own schedule — one monthly call at a time.

WHAT MAKES MENTARA DIFFERENT
• Completely free — mentorship shouldn't depend on your zip code or your budget.
• AI matching — we pair you with the right person instead of leaving you to search.
• Built around real calls — not endless texting, but genuine 1:1 conversations.
• Stay on track — shared action items, meeting notes, and gentle reminders between calls.
• Private & respectful — you control your profile, and you can report or block anyone at any time.

Mentara was built on a simple belief: the students who succeed aren't always the most talented — they're often the ones who had the right guidance at the right moment. We're here to make that guidance available to everyone.

Questions or feedback? Email mentarasupport@gmail.com — we read every message.
```

---

## 5. Keywords (100 max, comma-separated, no spaces)

```
mentor,mentorship,career,student,guidance,coaching,advice,college,professor,tutor,networking,goals
```
*(98 chars. Tip: don't repeat the app name or subtitle words — Apple already indexes those.)*

---

## 6. What's New / Release Notes (v1.0)

```
Welcome to Mentara! This is our very first release.

• Free, AI-matched 1:1 mentorship between students and mentors
• In-app messaging and monthly call scheduling (Zoom, Google Meet, FaceTime)
• Shared action items, meeting notes, and post-call reflections
• Sign in with Apple, Google, or email

Thanks for being here early. Found a bug or have an idea? Email mentarasupport@gmail.com.
```

---

## 7. App Privacy — "Nutrition Label" answers

In **App Store Connect → App Privacy**, declare the following. **Tracking: NO** — the app
does not track users across other companies' apps/sites, and uses no advertising identifier.

| Apple data category | Specific data | Linked to user? | Purpose |
|---|---|---|---|
| Contact Info | Name | Yes | App Functionality |
| Contact Info | Email Address | Yes | App Functionality |
| User Content | Photos (profile avatar) | Yes | App Functionality |
| User Content | Audio Data (optional voice reflections) | Yes | App Functionality |
| User Content | Other User Content (messages, reviews, notes) | Yes | App Functionality |
| Identifiers | User ID | Yes | App Functionality |
| Identifiers | Device ID (push notification token) | Yes | App Functionality |
| Diagnostics | Crash Data | No (Not linked) | App Functionality |
| Diagnostics | Performance Data | No (Not linked) | App Functionality |

> **Diagnostics** is required because the app uses Sentry for crash/error reporting. Mark both
> as **Not Linked to the user** and purpose **App Functionality** (we send only a random user id
> as context with `sendDefaultPii: false`, which Apple treats as app-functionality diagnostics,
> not tracking).

**Do NOT declare:** Location (the app requests no location permission — the profile "location"
is optional free text), Financial Info, Browsing History, or Tracking.

> ✅ **Usage Data: leave unchecked.** The app has no analytics SDK, and (as of June 16, 2026) the
> privacy policy no longer claims to collect usage analytics — the old "screens visited" line was
> replaced with a Diagnostics/Sentry disclosure. The label, the policy, and the code now match.

---

## 8. Age Rating questionnaire

Answer honestly; with no mature content, the key drivers are messaging + user-generated content.

- Made for Kids: **No**
- Unrestricted Web Access: **No**
- Cartoon/Realistic Violence, Sexual Content, Profanity, Horror, Gambling, Drugs/Alcohol, Mature/Suggestive: **None**
- App allows users to communicate / message: **Yes**
- App contains user-generated content: **Yes**
- Medical/Treatment info: **No**

**Likely result: 13+** (because of open messaging + UGC). That's consistent with our policy
("intended for users 13+"). This is fine for App Review **as long as the safeguards in §10 are
in place** — Apple scrutinizes communication apps under Guideline 1.2, not the rating number.

---

## 9. Categories — note

- **Education** is the right primary category for a mentorship/learning app.
- For secondary, **Lifestyle** is the safe choice. **Social Networking** is also accurate but
  tends to invite extra moderation scrutiny under Guideline 1.2. Either works — Lifestyle is lower-friction.

---

## 10. App Review safeguards (Guideline 1.2 — user-generated content & messaging)

Mentara already includes the four things Apple requires for UGC/communication apps. Mention them
in the Review Notes (§11):
1. **A method to filter objectionable content** — message length limits + zero-tolerance policy in Terms §04.
2. **A mechanism to report** — every chat has Report User (emails mentarasupport@gmail.com with context).
3. **The ability to block abusive users** — Block User in every chat.
4. **A published way to contact you** — mentarasupport@gmail.com (in-app + on the support site).

Also confirmed compliant:
- **Sign in with Apple** is offered alongside Google Sign-In (required by Guideline 4.8). ✅
- **In-app account deletion** exists (Profile → Delete Account → `delete-account` function), required by Guideline 5.1.1(v). ✅
- **Export compliance:** `ITSAppUsesNonExemptEncryption = false` is already set in app.json (no encryption questionnaire at upload). ✅

---

## 11. App Review notes (paste into the "Notes" field)

```
Thanks for reviewing Mentara!

WHAT IT IS
Mentara is a free platform that uses AI to match students with mentors (professors and
professionals) for one-on-one mentorship over monthly video calls. Matching, messaging, and
scheduling all happen in-app. There is no payment or subscription anywhere in the app.

DEMO ACCOUNTS (already matched so you can see the full flow)
Student:  ‹demo-student-email›  /  ‹password›
Mentor:   ‹demo-mentor-email›   /  ‹password›
These two accounts are pre-matched to each other, so after login you'll immediately see the
matched profile, an active chat thread, and the ability to schedule a call.

HOW TO TEST
1. Log in as the student. Open the "Mentor" tab to see the AI-matched mentor.
2. Open Messages to view the chat thread; send a message.
3. In the chat (or Schedule tab), tap "Schedule a call," pick a future time, and confirm.
4. Log in as the mentor on a second device/session to see the same thread and accept the invite.

MODERATION / SAFETY
Every conversation includes Report User and Block User (top-right menu in any chat). Reports are
sent to mentarasupport@gmail.com. Our Terms of Service include a zero-tolerance policy for
objectionable content.

AI
AI features (matching, post-call topic suggestions) run server-side via Google Gemini. No
third-party AI/advertising tracking is used.

Contact: mentarasupport@gmail.com
```

> Replace the two `‹demo-...›` lines with real credentials. **Important:** create the demo
> student and demo mentor, then make sure they're matched to each other (you can trigger matching
> by completing onboarding for both, or I can show you how to force-assign them in Supabase so the
> reviewer sees a populated account on first login).

---

## 12. Copyright

```
2026 Mentara
```

---

## 13. Screenshots (required for upload)

iPad is not needed (`supportsTablet: false`). You need **iPhone 6.7"** at minimum.

| Display size | Resolution (portrait) | Devices | Required? |
|---|---|---|---|
| 6.7" | 1290 × 2796 | iPhone 15/16 Pro Max | ✅ Required (1–10 images) |
| 6.5" | 1242 × 2688 | iPhone 11 Pro Max / XS Max | Optional (Apple can scale 6.7") |

**Suggested 5 screens to capture (on a 6.7" simulator or device):**
1. The "My Mentor" match screen (AI-matched mentor card).
2. A chat thread with the meeting chip + a scheduled call.
3. The Schedule tab (upcoming meeting + action items).
4. The post-call reflection / rating card.
5. The landing or "How it works" screen.

> Tip: run on an iPhone 16 Pro Max simulator (`⌘+S` to save a screenshot) — it outputs 1290×2796 exactly.

---

## 14. Final pre-submit checklist

- [ ] Host `submission/` folder → get a real HTTPS domain (README.md)
- [ ] Fill the 4 URLs in §1 into this doc + App Store Connect
- [ ] Paste Name, Subtitle, Promo, Description, Keywords, What's New
- [ ] Complete App Privacy (§7) — leave Usage Data unchecked, Tracking = No
- [ ] Complete Age Rating (§8)
- [ ] Add 6.7" screenshots (§13)
- [ ] Create + match demo accounts, fill §11 credentials
- [ ] Set Copyright (§12)
- [ ] **Still needed from you (code side):** real EAS project UUID in `app.json`, Apple
      credentials in `eas.json`, then `eas build` + `eas submit`
