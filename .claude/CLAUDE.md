# Mentara — Claude Code Project Instructions

## Writing Style Rules (ALWAYS)

- NEVER use the em dash character (—) anywhere. This applies to everything:
  questions, code comments, commit messages, emails, on-screen UI copy, captions,
  alt text, documentation, and your own chat answers. Use a hyphen, comma, colon,
  parentheses, or a reworded sentence instead. The en dash (–) as a sentence
  break is also banned; only use it inside numeric ranges (for example 13-17).
- This rule overrides any default formatting habit.

## Security

- A repeatable security audit lives in the `security-scan` skill
  (`.claude/skills/security-scan/SKILL.md`). Run it for any "scan/check/audit
  for vulnerabilities" request or before a release. It covers exposed secrets,
  input validation/sanitization, RLS coverage, edge-function auth, and content
  safety, and reports findings with fix options.

## Project Overview

Mentara is a React Native 0.81.5 + Expo 54 + expo-router 6 mobile app connecting students with mentors. Backend: Supabase (auth + PostgreSQL + realtime + storage). Language: TypeScript. Build target: iOS App Store via EAS Build.

## Stack Reference

| Layer | Technology |
|-------|-----------|
| Frontend | React Native 0.81.5, Expo 54, expo-router 6 |
| Language | TypeScript 5.9 |
| Backend | Supabase (supabase-js v2.43.4) |
| Auth | Supabase Auth (email/password + Google OAuth) |
| Storage | Supabase Storage (avatars bucket) |
| Realtime | Supabase Realtime (messages, conversations) |
| Animations | react-native-reanimated 4.1.1 |
| Build | EAS Build + EAS Submit |

## Key Files

| File | Purpose |
|------|---------|
| `constants/theme.ts` | Design system: Colors, Spacing, Radius, Typography, Shadow, Gradients |
| `lib/supabase.ts` | ALL Supabase queries — screens must use helpers from here, not raw `supabase.from()` |
| `lib/types.ts` | TypeScript interfaces for all domain objects |
| `lib/authUtils.ts` | Email validation, password strength, error mapping |
| `context/AuthContext.tsx` | Auth state (session, profile, role) |
| `hooks/useMentors.ts` | Mentor list + detail data hooks |
| `hooks/useMessages.ts` | Messages + conversations hooks |
| `supabase/schema.sql` | DB schema, RLS policies, triggers, functions |
| `eas.json` | EAS Build + Submit configuration |
| `app.json` | Expo app config (bundle ID, permissions, plugins) |

## Design System Rules

- **Always use `Colors.*` tokens** — never hardcode hex values in screens or components.
- **Always use `Spacing.*` and `Radius.*`** for layout values.
- **Always use `Shadow.*` presets** instead of manual `shadowColor`/`elevation` combos.
- **Always use `Typography.*`** for font sizes and weights.
- Primary color: `Colors.primary` (`#0D4F5C` deep teal), `Colors.accent` (`#C98B30` amber/gold), `Colors.accent2` (`#C45C3A` terracotta), `Colors.accent3` (`#3D7A5B` sage), `Colors.accent4` (`#4A3B7C` dusty indigo).

## API Pattern Rules

- All Supabase queries live in `lib/supabase.ts` as named helper functions.
- Screens import helpers — they NEVER call `supabase.from(...)` directly.
- Hooks in `hooks/` wrap lib helpers with React state management.

---

## Agent Team

This project has a team of 9 specialized sub-agents. Use them by asking Claude Code to invoke them by name.

### Running the Full Team

Ask: **"Run the Mentara Project Manager & Debugger"**

The manager agent will:
1. Spawn all 6 specialist agents in parallel
2. Facilitate cross-agent communication on shared findings
3. Produce a master priority-ordered action plan with a TodoWrite task list

### Running Individual Agents

Ask Claude Code to invoke the agent by name for targeted audits:

---

#### Mentara Frontend & UI/UX Agent
**When to use:** Reviewing screens, components, styling, theme usage, accessibility, animations.

**Audits:**
- Theme token adherence (hardcoded hex violations)
- Component consistency (Button, Input, Avatar usage)
- Animation quality (cleanup, useNativeDriver, Animated.Value refs)
- Accessibility (accessibilityLabel coverage)
- Typography scale adherence
- Known issues: `_layout.tsx` hardcoded color, `discover.tsx` search input, nested ScrollViews

---

#### Mentara Backend & Data Agent
**When to use:** Reviewing data fetching, hooks, `lib/supabase.ts` patterns, TypeScript types, error handling, race conditions.

**Audits:**
- Duplicate query logic across lib and hooks
- Error state exposure in hooks
- Avatar upload bug (FormData → React Native incompatible)
- TypeScript `as any` casts
- API pattern violations (screens calling Supabase directly)
- Realtime subscription cleanup

---

#### Mentara Database Agent
**When to use:** Reviewing schema, RLS policies, triggers, indexes, query efficiency.

**Audits:**
- Missing RLS DELETE policies (reviews, conversations)
- Trigger bugs (unread counters never incremented, `handle_new_user` misses Google OAuth name)
- Missing indexes (messages.conversation_id, mentor_profiles GIN index)
- Schema design (rating DEFAULT 0, missing content length CHECK)
- Query efficiency (client-side search vs. server-side ilike)

**Outputs:** Structured report + complete SQL migration script.

---

#### Mentara Authentication Agent
**When to use:** Reviewing auth flows, Google OAuth, session persistence, onboarding, role assignment.

**Audits:**
- Google OAuth deep link handler (mobile callback processing)
- Stale `mentara_pending_role` in AsyncStorage
- Email confirmation race condition in register flow
- Debounce on profile loads in `onAuthStateChange`
- Password reset deep link handling
- Onboarding incomplete state handling

---

#### Mentara Security Agent
**When to use:** Security reviews, before deployment, when adding new data access patterns.

**Audits:**
- API key exposure (`.env` in `.gitignore`, no service role key in client)
- Rate limiting: **5 attempts per 15-minute window** on all write operations
- Input validation (message length, review rating constraints)
- Token storage (AsyncStorage vs. expo-secure-store)
- OAuth redirect scheme security (custom scheme collision risk)
- Password policy enforcement
- Avatar upload size/type enforcement
- Missing RLS DELETE policies (security surface)

**Outputs:** Complete rate limiting SQL schema + TypeScript integration code.

---

#### Mentara Deployment & App Store Agent
**When to use:** Preparing for App Store submission, reviewing build configuration, checking Apple policies.

**Phase 1 — Research:** Fetches current Apple App Store Review Guidelines, metadata requirements, privacy nutrition label requirements, and EAS submit requirements from official documentation.

**Phase 2 — Audits:**
- EAS `eas.json` placeholder credentials
- `app.json` missing required fields (icon, splash, version, owner)
- iOS permission description accuracy
- Privacy Nutrition Label mapping
- Age rating determination
- Google OAuth production configuration
- Missing crash reporting and OTA update config

**Outputs:** Apple Policy Summary + complete submission checklist.

---

#### Mentara Project Manager & Debugger
**When to use:** Complete project health check, pre-deployment audit, or when you want a master bug list across all pillars.

**Process:**
1. Round 1: All 6 specialists run in parallel
2. Round 2: Cross-agent collaboration on shared findings
3. Round 3: Master report + prioritized TodoWrite task list

**Outputs:** Executive summary, App Store blockers, all issues by priority, rate limiting plan, master action plan.

---

#### Mentara HARD Debugger Agent
**When to use:** Deep, exhaustive bug hunt across the entire codebase. Traces every function path, import chain, DB query, hook lifecycle, navigation route, and schema constraint. More thorough than the specialist agents — reads every file, not just its domain.

**Process:**
1. Phase 1: Full codebase discovery — maps every file, export, import, and DB call
2. Phase 2: Systematic bug hunting across 10 categories (auth flows, navigation routes, query correctness, hook lifecycle, TypeScript safety, screen logic, DB triggers, RLS, component props, build config)
3. Phase 3: Compiles structured bug report (BUG-N with severity, file, code context, impact, fix)
4. Phase 4: Automatically spawns the Bug Fixer Agent and passes the full report

**Model:** claude-sonnet-4-6
**Outputs:** Structured bug report handed directly to Bug Fixer Agent.

---

#### Mentara Bug Fixer Agent
**When to use:** After the HARD Debugger Agent has produced a bug report. Fixes every bug in priority order (CRITICAL → HIGH → MEDIUM → LOW), edits the actual files, then reports exactly what changed.

**Process:**
1. Parses the bug report and creates a TodoWrite task list
2. Reads each file before editing — never edits from memory
3. Applies minimal correct fix for each bug
4. Cross-file consistency check after all fixes
5. Produces a Fix Summary Report with before/after code, root cause, and remaining recommendations

**Model:** claude-opus-4-7
**Outputs:** Fix Summary Report — what was fixed, before/after diffs, what was skipped and why.

---

## Known Issues (Pre-Seeded for Agent Verification)

The following issues were identified during project setup. Each specialist agent is pre-seeded to verify these:

### Critical
- Unread badge `student_unread`/`mentor_unread` counters never incremented by `update_conversation_last_message` trigger → badges permanently show 0
- `uploadAvatar()` uses `FormData` → fails silently on React Native (web-only pattern)
- `eas.json` `submit.production.ios` has placeholder Apple credentials → `eas submit` will fail
- Google OAuth deep link handler missing in `app/_layout.tsx` → OAuth sign-in silently fails on mobile
- Missing RLS DELETE policy on `reviews` table → students permanently locked into reviews

### High
- No rate limiting on any write operations (login, register, messages, reviews, conversations)
- `handle_new_user` trigger doesn't extract `full_name` from Google OAuth `raw_user_meta_data`
- Zero `accessibilityLabel` props across all interactive elements (App Store accessibility requirement)
- `app.json` missing: `icon`, `splash`, `version`, `ios.buildNumber`, `owner`
- `MentorData` type in `hooks/useMentors.ts` out of sync with `MentorProfile` in `lib/types.ts`
- Multiple screens bypass `lib/supabase.ts` and call Supabase directly (`home.tsx`, `profile.tsx`)

### Medium
- `mentor_profiles.rating DEFAULT 0` — new mentors show 0.0 instead of NULL/"New"
- Missing GIN index on `mentor_profiles.fields_of_expertise` for `@>` queries
- Hardcoded `'#FAFAF9'` in `app/(app)/_layout.tsx` vs `Colors.background` (`'#F8F7FC'`)
- No rate limiting on message send, review submit, conversation creation
- Supabase session tokens stored in unencrypted AsyncStorage (should use expo-secure-store)
