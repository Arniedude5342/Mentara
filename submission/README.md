# Mentara Submission Kit

This folder contains everything you need for the App Store listing **except** your Apple/Expo
credentials.

## Files

| File | What it is | Used for |
|---|---|---|
| `index.html` | Support / landing page | **Support URL** + **Marketing URL** |
| `privacy-policy.html` | Hostable privacy policy | **Privacy Policy URL** (required) |
| `terms-of-service.html` | Hostable terms of service | EULA / Terms URL |
| `APP_STORE_LISTING.md` | All listing copy + metadata + checklist | Paste into App Store Connect |

These are plain static HTML — no build step, no dependencies. Host the whole folder and you
instantly get all three URLs.

---

## Get your URLs — pick ONE (all free, ~3 min)

### Option A — Netlify Drop (fastest, no account needed to try)
1. Go to **https://app.netlify.com/drop**
2. Drag this `submission/` folder onto the page.
3. You get a URL like `https://mentara-legal.netlify.app/`. That's it.
   - Privacy: `…/privacy-policy.html`  •  Terms: `…/terms-of-service.html`  •  Support: `…/`
4. (Optional) Create a free account to keep the site permanent and rename it.

### Option B — GitHub Pages (permanent, free)
1. Create a public repo, e.g. `mentara-legal`.
2. Upload the 3 `.html` files to the repo root.
3. Repo **Settings → Pages → Source: Deploy from a branch → `main` / root → Save**.
4. After ~1 min your site is at `https://‹your-username›.github.io/mentara-legal/`.
   - Privacy: `…/privacy-policy.html`

### Option C — Vercel (permanent, free)
1. Push these files to a GitHub repo (or use `vercel` CLI in this folder).
2. Import the repo at **https://vercel.com/new** → Deploy (framework preset: "Other").
3. You get `https://‹project›.vercel.app/`.

---

## After hosting

1. Copy your domain into **`APP_STORE_LISTING.md` → §1** (replace every `‹your-domain›`).
2. In **App Store Connect**:
   - **App Information → Privacy Policy URL** = your `…/privacy-policy.html`
   - **Version page → Support URL** = your `…/`
   - **Version page → Marketing URL** (optional) = your `…/`
3. Work top-to-bottom through the checklist in `APP_STORE_LISTING.md → §14`.

---

## Notes

- **Keep the hosted policy in sync with the in-app one.** The HTML here mirrors the text in
  `app/(app)/privacy.tsx` / `app/privacy.tsx` (last updated June 16, 2026). If you change one,
  change the other so they match — App Review compares them.
- The app collects crash/diagnostic data via Sentry (disclosed in the policy as of June 16, 2026)
  but has **no** usage-analytics SDK — so leave "Usage Data" unchecked in the App Privacy label.
  See `APP_STORE_LISTING.md → §7`.
- A custom domain (e.g. `mentara.app/privacy`) is nicer but **not** required — a
  `netlify.app` / `github.io` / `vercel.app` URL is perfectly acceptable to Apple.
