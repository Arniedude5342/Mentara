# Sentry — Production Error & Crash Tracking

Sentry is wired into the app. It captures JavaScript errors, unhandled rejections, and native
crashes from **release builds** (TestFlight / App Store) and reports them to your Sentry
dashboard. It stays a **safe no-op until you add a DSN**, and never sends from local dev.

## What's already wired (no action needed)

- `@sentry/react-native` installed; config plugin in `app.json`.
- `Sentry.init()` in [`app/_layout.tsx`](app/_layout.tsx) — always initialized; sending is enabled only when a DSN is set in a release build (`enabled: !!DSN && !__DEV__`), `sendDefaultPii: false`.
- Root component wrapped with `Sentry.wrap(...)`.
- Signed-in user's **id only** attached to reports (cleared on sign-out).
- [`lib/logger.ts`](lib/logger.ts) forwards `logError → captureException`, `logEvent`/`addBreadcrumb → breadcrumbs`.
  Everything that already calls `logError` (the `ErrorBoundary`, all `lib/*` failures) now reports automatically.

## What YOU need to do

### 1. Get a DSN (required — turns reporting on) · ~3 min
1. Create a free account at **https://sentry.io** and a new project (platform: **React Native**).
2. **Settings → Projects → [your project] → Client Keys (DSN)** → copy the DSN.
3. Put it in `.env`:
   ```
   EXPO_PUBLIC_SENTRY_DSN=https://<key>@o<org>.ingest.sentry.io/<project>
   ```
4. Make it available to **EAS builds** too (it's a public client key, so an env var is fine):
   ```
   eas env:create --name EXPO_PUBLIC_SENTRY_DSN --value "https://...." --visibility plaintext --environment production
   ```
   (or add it under EAS → Project → Environment variables in the dashboard).

### 2. Readable stack traces (strongly recommended) · ~3 min
Without this, errors still arrive but stacks are minified (`index.bundle:1:284553`). To symbolicate:
1. In `app.json`, replace the two placeholders in the `@sentry/react-native` plugin:
   ```json
   { "organization": "your-org-slug", "project": "your-project-slug" }
   ```
2. Create an auth token: **Sentry → Settings → Auth Tokens** → scope `project:releases` (and `org:read`).
3. Add it as an **EAS secret** (kept private, used only at build time to upload source maps/dSYMs):
   ```
   eas env:create --name SENTRY_AUTH_TOKEN --value "<token>" --visibility secret --environment production
   ```
   The plugin uploads maps automatically during `eas build`. If the token is absent, the upload
   step just **skips** — it never fails your build.

### 3. Verify it works
- Easiest: in a **release/preview build** (`eas build --profile preview`), trigger an error and
  confirm it appears in Sentry within ~1 min.
- To test from your machine, temporarily set `enabled: true` in the `Sentry.init` call in
  `app/_layout.tsx` and call `Sentry.captureMessage('hello from dev')` once. **Revert afterward**
  so local dev noise doesn't hit your quota.

## Privacy / App Store note
Adding Sentry means you must declare **Diagnostics → Crash Data + Performance Data** in the App
Privacy label (Not Linked to user, App Functionality, no tracking). This is already reflected in
[`submission/APP_STORE_LISTING.md`](submission/APP_STORE_LISTING.md) §7.

## Free tier
5,000 errors/month + performance monitoring — plenty for launch. `tracesSampleRate` is set to
`0.2` (20%); lower it if you approach limits.
