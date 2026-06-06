# Mentara — Project Briefing

A React Native mobile app connecting students with mentors. Students are **auto-assigned** a mentor by AI — there is no manual browse/discover page. The `auto-assign-mentor` Supabase Edge Function handles matching.

---

## Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React Native 0.81.5, Expo 54, expo-router 6 |
| Language | TypeScript 5.9 |
| Backend | Supabase (auth + PostgreSQL + realtime + storage) |
| Auth | Supabase Auth (email/password + Google OAuth + Apple Sign In) |
| Storage | Supabase Storage (avatars bucket) |
| Realtime | Supabase Realtime (messages, conversations) |
| Animations | react-native-reanimated 4.1.1 |
| Build | EAS Build + EAS Submit |
| AI (in-app) | **Google Gemini only** (free tier) — never use Claude/Anthropic API inside the app |

---

## Key Files

| File | Purpose |
|------|---------|
| `constants/theme.ts` | Design system: Colors, Spacing, Radius, Typography, Shadow, Gradients |
| `lib/supabase.ts` | ALL Supabase queries — screens must use helpers here, never call `supabase.from()` directly |
| `lib/types.ts` | TypeScript interfaces for all domain objects |
| `lib/authUtils.ts` | Email validation, password strength, error mapping |
| `lib/meetings.ts` | Meeting scheduling, post-meeting feedback |
| `lib/botMessages.ts` | Bot message rendering helpers |
| `lib/googleCalendar.ts` | Google Calendar OAuth + event creation |
| `context/AuthContext.tsx` | Auth state (session, profile, role) |
| `hooks/useMentors.ts` | Mentor list + detail data hooks |
| `hooks/useMessages.ts` | Messages + conversations hooks |
| `hooks/usePushNotifications.ts` | Push token registration + removal |
| `supabase/schema.sql` | DB schema, RLS policies, triggers, functions |
| `eas.json` | EAS Build + Submit configuration |
| `app.json` | Expo app config (bundle ID, permissions, plugins) |

---

## App Structure

```
app/
  index.tsx              — public landing page
  _layout.tsx            — root layout (auth deep links handled here)
  (auth)/
    login.tsx
    register.tsx
    onboarding.tsx       — role selection, student (5 steps) + mentor (6 steps) flows
    reset-password.tsx
  (app)/
    _layout.tsx          — protected shell
    (tabs)/
      home.tsx
      messages.tsx
      profile.tsx
      _layout.tsx
    chat/[id].tsx        — real-time chat screen
    mentor/[id].tsx      — mentor profile screen
    privacy.tsx

components/
  ScheduleCallCard.tsx   — schedule meetings + Google Calendar "Add to Calendar"
  RescheduleCard.tsx
  PostMeetingRatingCard.tsx
  BotMessageBubble.tsx
  MessageBubble.tsx
  VoiceMemoCard.tsx
  ActionItemsCard.tsx
  GoalMapCard.tsx
  ui/Button.tsx, ui/Input.tsx, ui/Avatar.tsx
  ErrorBoundary.tsx
```

---

## Design System Rules

Always use tokens from `constants/theme.ts`. Never hardcode hex values, spacing numbers, or shadow properties.

| Token | Values |
|-------|--------|
| `Colors.primary` | `#0D4F5C` (deep teal) |
| `Colors.accent` | `#C98B30` (amber/gold) |
| `Colors.accent2` | `#C45C3A` (terracotta) |
| `Colors.accent3` | `#3D7A5B` (sage) |
| `Colors.accent4` | `#4A3B7C` (dusty indigo) |
| `Colors.background` | `#F8F7FC` |

Use `Spacing.*`, `Radius.*`, `Shadow.*`, `Typography.*` — never manual values.

---

## Supabase Edge Functions

| Function | Purpose |
|----------|---------|
| `auto-assign-mentor` | AI matching — assigns a mentor to a new student |
| `bot-message-handler` | Gemini AI monitors conversations, nudges scheduling |
| `generate-call-topics` | Dynamic agenda generation for upcoming calls |
| `post-meeting-checkin` | Post-meeting follow-up and rating prompt |
| `send-meeting-invite` | Sends email invites via Resend |
| `send-meeting-confirmation` | Sends confirmation emails |
| `delete-account` | Privacy — full account deletion |
| `linkedin-token-exchange` | LinkedIn OAuth token handling |

All AI calls use **Gemini 1.5 Flash** via `GOOGLE_API_KEY` in Supabase secrets.

---

## Auth Flow

- Email/password + Google OAuth + Apple Sign In
- Role is set during onboarding (`student` or `mentor`) and stored in `profiles.role`
- Google OAuth pending role is stored in SecureStore (`mentara_pending_role`) and applied on `SIGNED_IN` event in `AuthContext.tsx`
- Deep link scheme: `mentara://`

---

## Google Calendar Integration

Added to `ScheduleCallCard` — after scheduling a meeting, user can add it to Google Calendar.

**How it works:**
- `lib/googleCalendar.ts` handles OAuth (PKCE flow) + event creation
- iOS OAuth Client ID: `737315950959-32fidg7e7pt0lrtehbbhukru6i7kodg9.apps.googleusercontent.com`
- Redirect URI: `com.googleusercontent.apps.737315950959-32fidg7e7pt0lrtehbbhukru6i7kodg9:/oauth2redirect` (single slash — Google iOS OAuth requirement)
- Tokens stored in `expo-secure-store` (`gcal_access_token`, `gcal_refresh_token`)
- Scope: `https://www.googleapis.com/auth/calendar.events`

**Setup required:**
- `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID` set in `.env` ✓ (done)
- `app.json` scheme includes `com.googleusercontent.apps.737315950959-32fidg7e7pt0lrtehbbhukru6i7kodg9` ✓ (done)
- Google Cloud Console: Calendar API enabled, iOS OAuth client created, user's Gmail added as test user
- The Google account `reacharnavmalhotra@gmail.com` is supervised (Google Family Link) — parent approval needed to authorize the app during testing

---

## Known Issues & Fix Status

### Fixed (as of 2026-05-18)
- Avatar upload (was broken on React Native — fixed with base64 approach)
- Voice memo upload (same fix)
- `update_conversation_last_message` trigger synced to bot-aware version
- Sentry fully removed (was causing build issues)
- OTA/expo-updates dead code removed from `app.json`
- Mentor profile screen (`app/(app)/mentor/[id].tsx`) created
- Post-meeting star rating UI added
- Grade-level picker in student onboarding
- Preferred student levels in mentor onboarding
- Login screen loading states separated (Google/Apple/email spinners independent)
- `removePushToken` called on sign-out
- OAuth pending role applied correctly on Google Sign In
- Dead code removed (`formatTime`, `Favorite` interface)

### Still Outstanding (user action required)
- `eas.json` Apple credentials: `appleId`, `ascAppId`, `appleTeamId` are placeholders
- `extra.eas.projectId` in `app.json` is `"mentara"` (slug) — needs real UUID from expo.dev
- Privacy policy needs to be hosted at a public HTTPS URL
- Supabase secrets not set: `GOOGLE_API_KEY`, `RESEND_API_KEY`, `MEETING_INVITE_SECRET`
- Apple Sign In capability needs to be enabled in Apple Developer portal for `com.mentara.app`
- App Store Connect listing not created yet

---

## Push Notifications

**Status: Partially implemented client-side, not yet wired to send.**

- `expo-notifications` is installed and in `app.json`
- `hooks/usePushNotifications.ts` handles token registration + removal on logout
- `push_tokens` table exists in Supabase
- `lib/supabase.ts` has `savePushToken` and `removePushToken` helpers

**Still needed:**
- `send-push-notification` Edge Function (calls Expo Push API)
- Wire `auto-assign-mentor`, `bot-message-handler`, `post-meeting-checkin` to call it
- Database webhook on `messages` INSERT to notify the other conversation participant

---

## App Store Submission Checklist

### Must do before `eas submit`
1. Replace `extra.eas.projectId` in `app.json` with real UUID from expo.dev (log in as `mentarasupport`)
2. Fill `eas.json` Apple credentials (`appleId`, `ascAppId`, `appleTeamId`)
3. Create app in App Store Connect (bundle ID: `com.mentara.app`)
4. Enable Sign In with Apple in Apple Developer → Identifiers → `com.mentara.app`
5. Set Supabase secrets: `GOOGLE_API_KEY`, `RESEND_API_KEY`, `MEETING_INVITE_SECRET`

### Required for listing
6. Host privacy policy at a public HTTPS URL
7. Screenshots: 6.7" iPhone 16 Pro Max (1290×2796 px) — minimum 2
8. App description, keywords, support URL, copyright
9. Privacy Nutrition Label: Name, Email, User content (messages/voice), Identifiers
10. Age Rating: 12+ (messaging strangers, user-generated content)
11. Demo credentials for App Review (test student + test mentor)

### Build & submit
```bash
eas build --platform ios --profile production
eas submit --platform ios --profile production
```

---

## Hard Rules

- **All Supabase queries go in `lib/supabase.ts`** — screens import helpers, never call `supabase.from()` directly
- **All AI uses Google Gemini** — never add Claude/Anthropic API calls inside the app
- **Always use design tokens** — no hardcoded hex, spacing, or shadow values
- **No discover/browse page** — mentor matching is 100% AI-driven via `auto-assign-mentor`
- Running in **Expo dev build** (not Expo Go) — custom URL schemes and native modules are used
