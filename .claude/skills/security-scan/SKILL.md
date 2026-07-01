---
name: security-scan
description: Run a full security audit of the Mentara codebase. Use when the user asks to scan/check/audit for security vulnerabilities, exposed secrets, missing input validation/sanitization, missing RLS, or general security review before a release. Covers client secrets, env handling, RLS policies, input validation, edge-function auth, and content safety.
---

# Mentara Security Scan

A repeatable, codebase-specific security audit. Work through every section in
order. For each finding, report: what is wrong, where (file:line), the impact,
and one recommended fix (or two-to-three options when the fix is not trivial).
Do not auto-fix unless the user asks; default to reporting findings + options.

Writing rule for the whole report: never use the em dash character. Use hyphens,
commas, colons, or parentheses instead.

## Severity scale

- CRITICAL: exploitable now, leaks data or grants access. Block release.
- HIGH: real exposure (PII leak, auth gap) that a motivated user can hit.
- MEDIUM: weakens a defense layer or a content-safety requirement.
- LOW / INFO: hardening, defense in depth, or low-impact edge case.

## 1. Exposed API keys and secrets in client code

Anything bundled into the app ships to every device and can be extracted.

```
# Secrets hardcoded in client source
grep -rnEi "service_role|secret|api[_-]?key|sk_live|AIza|eyJ[A-Za-z0-9_-]{10,}" \
  app lib components constants context hooks web | grep -viE "anon|publishable"

# .env must be gitignored and NOT tracked
grep -nE "env|secret|key" .gitignore
git ls-files | grep -iE "\.env"            # only .env.example should appear

# Client-readable env vars (EXPO_PUBLIC_* are bundled = public by design)
grep -rnE "process\.env\.[A-Z_]+|EXPO_PUBLIC_[A-Z_]+" app lib components hooks
```

Rules for this project:
- The Supabase anon key and URL are meant to be public. The real boundary is
  RLS, so a leaked anon key is only as safe as the RLS policies (see section 3).
- `GOOGLE_API_KEY` (Gemini) and `SUPABASE_SERVICE_ROLE_KEY` must live ONLY in
  Supabase secrets and be read via `Deno.env.get(...)` inside edge functions.
  They must never appear with an `EXPO_PUBLIC_` prefix or in client files.
- Flag any new `EXPO_PUBLIC_*` var that is actually a secret.

## 2. Missing input validation and sanitization

Every place a user can type. Confirm defense in depth: client trim + length
(`maxLength`), a server/helper-side check, and a DB CHECK constraint.

```
# All text inputs and their maxLength
grep -rln "TextInput" app components
grep -rnE "maxLength" app components

# Write helpers (these must trim + length-check + rate-limit)
grep -nE "export async function (send|submit|create|update|insert|add|save|report|block)" lib/supabase.ts

# DB length / range constraints
grep -rhinE "check \(|char_length|rating >=" supabase/schema.sql supabase/migrations/*.sql
```

Check each free-text field for:
- Trim + min/max length on the client AND a DB `CHECK (char_length(...) <= N)`.
- Content moderation where the text is visible to OTHER users. `moderateMessage`
  in `lib/moderation.ts` currently runs only in `sendMessage`. Any other
  user-visible free text (bio, mentoring_style, title, learning_goals, goal
  titles/descriptions, post-meeting notes, reviews) is a moderation gap.
- Injection: search/query helpers must not interpolate raw user text into
  PostgREST `.or(...)` / `.ilike(...)` filters. Confirm `.or()` only uses
  session UUIDs, not free text.
  `grep -rnE "\.or\(|\.ilike\(|\.filter\(" lib hooks`
- URL fields (website, linkedin_url): validate the scheme is http(s) and never
  pass user-supplied URLs to `Linking.openURL` (javascript: / app-scheme risk).
- XSS surface: no `WebView`, `dangerouslySetInnerHTML`, `eval`, or `innerHTML`
  rendering user content. In edge-function emails, HTML-escape every user value.

## 3. Missing or weak RLS on database tables

```
# Every table must enable RLS
grep -rhoE "create table (if not exists )?[a-z_]+" supabase/schema.sql supabase/migrations/*.sql -i | sort -u
grep -rhoE "alter table [a-z_]+ enable row level security" supabase/schema.sql supabase/migrations/*.sql -i | sort -u

# Overly permissive policies
grep -rinE "using \(\s*true\s*\)|with check \(\s*true\s*\)" supabase/schema.sql supabase/migrations/*.sql
```

Rules:
- Every table has RLS enabled (compare the two lists above; any table in the
  first list missing from the second is CRITICAL).
- `USING (true)` is only acceptable for SELECT on data that is genuinely public
  AND contains no PII. PII (email) must stay OUT of the public `profiles` table:
  it lives in the owner-only `private_profiles` table (RLS `auth.uid() = id`),
  populated by the handle_new_user / sync_private_email triggers. When auditing,
  confirm no PII column was added back to `profiles` and that no query selects
  email from `profiles` (it is read via the `private_profiles(email)` embed for
  self only). Do not allow PII columns under a public read policy.
- Confirm each table has the CRUD policies its features need, including DELETE
  (a missing DELETE policy silently locks users out of deleting their own rows).
- `rate_limit_log` must be unreachable directly (`WITH CHECK (false)`, no SELECT)
  and only touched through a SECURITY DEFINER RPC.

## 4. Other security checks

- Token storage: sessions must use `expo-secure-store`, not AsyncStorage
  (`lib/supabase.ts` SecureStoreAdapter).
- Rate limiting: every write helper calls `checkRateLimit`. Note that it fails
  OPEN on RPC error. Decide if the most sensitive ops (signup, login, password,
  delete) should fail closed instead.
- Edge function auth: any function doing privileged work must derive the caller
  from a verified JWT (`userClient.auth.getUser()`), never trust an id passed in
  the request body. Service-role-only functions should require an internal
  secret.
  `grep -rnE "getUser\(|SERVICE_ROLE|req.json|Allow-Origin" supabase/functions/*/index.ts`
- CORS: prefer scoping `Access-Control-Allow-Origin` to the app origin over `*`
  for authenticated functions.
- AI prompt injection: user text interpolated into Gemini prompts (report-triage,
  generate-call-topics, process-voice-memo) must be clearly delimited and the
  model output treated as untrusted (parse defensively, keep a human in the loop
  for moderation actions).
- Verify `verify_jwt` is pinned per function in `supabase/config.toml` for
  gateway-level enforcement (defense in depth).

## Output format

End with a table ordered by severity:

| # | Severity | Area | Finding | File | Fix |
|---|----------|------|---------|------|-----|

Then list options for any non-trivial fix. Confirm explicitly which checks
passed (for example "no hardcoded secrets", "all tables have RLS") so the clean
areas are on record, not just the problems.
