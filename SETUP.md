# Mentara — Setup & Deployment Guide

## App Overview
**Mentara** connects students with verified mentors (professors & industry professionals) for personalized guidance and feedback.

### Brand
- **Name:** Mentara (mentor + ara, a southern constellation)
- **Tagline:** Light Your Path
- **Colors:** Purple (#5B4CF5) + Gold (#F5A623)
- **Logo:** Stylized M mark with gold accent dot

---

## 1. Prerequisites

```bash
# Install Node.js 18+, then:
npm install -g expo-cli eas-cli
```

---

## 2. Supabase Backend Setup

### 2a. Create a Supabase project
1. Go to https://supabase.com and create a free account
2. Create a new project (save your database password!)
3. Wait for the project to spin up

### 2b. Run the schema
1. In your Supabase dashboard, go to **SQL Editor**
2. Copy the contents of `supabase/schema.sql`
3. Paste and click **Run**

### 2c. Get your API keys
1. Go to **Settings → API**
2. Copy your **Project URL** and **anon/public key**

---

## 3. App Configuration

### 3a. Create your .env file
```bash
cp .env.example .env
```

Edit `.env` and fill in your Supabase credentials:
```
EXPO_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=your-anon-key-here
```

### 3b. Update app.json
Replace these placeholders in `app.json`:
- `your-eas-project-id` → Your EAS project ID (from `eas init`)

---

## 4. Install & Run

```bash
cd Mentara
npm install
npx expo start
```

Press **i** for iOS simulator, **a** for Android.

---

## 5. App Store Submission (iOS)

### 5a. Apple Developer Setup
1. Enroll in the **Apple Developer Program** ($99/year) at developer.apple.com
2. Create an App ID: `com.mentara.app`
3. Create an app in **App Store Connect**

### 5b. EAS Build & Submit
```bash
# Initialize EAS
eas init

# Build for App Store
eas build --platform ios --profile production

# Submit to App Store
eas submit --platform ios --profile production
```

### 5c. App Store requirements checklist
- [ ] App icon: 1024×1024 PNG (no transparency)
- [ ] Screenshots: 6.7" iPhone (required), 6.5", 5.5"
- [ ] App description, keywords, privacy policy URL
- [ ] Support URL
- [ ] Privacy policy (required — app collects user data)

### 5d. Create App Store assets
```bash
# Generate icons with expo
npx expo-doctor  # checks your config
```

Place your app icon at `assets/icon.png` (1024×1024)
Place splash screen at `assets/splash.png` (1284×2778)

---

## 6. App Structure

```
Mentara/
├── app/
│   ├── index.tsx          # Landing page
│   ├── about.tsx          # About page
│   ├── _layout.tsx        # Root layout
│   ├── (auth)/
│   │   ├── login.tsx      # Sign in
│   │   ├── register.tsx   # Sign up (student or mentor)
│   │   └── onboarding.tsx # 5-6 step questionnaire
│   └── (app)/
│       ├── (tabs)/
│       │   ├── home.tsx      # Personalized feed
│       │   ├── discover.tsx  # Search & filter mentors
│       │   ├── messages.tsx  # All conversations
│       │   ├── favorites.tsx # Saved mentors
│       │   └── profile.tsx   # User profile & settings
│       ├── mentor/[id].tsx   # Mentor detail + reviews
│       └── chat/[id].tsx     # Real-time chat
├── components/
├── constants/theme.ts     # Colors, typography, spacing
├── context/AuthContext.tsx
├── hooks/
├── lib/
│   ├── supabase.ts       # All DB operations
│   └── types.ts
└── supabase/schema.sql   # Database schema + RLS
```

---

## 7. Key Features

| Feature | Description |
|---------|-------------|
| **Smart Onboarding** | 5-6 step questionnaire for students & mentors |
| **Mentor Discovery** | Search & filter by field, search mentors |
| **Real-time Chat** | Supabase Realtime powered messaging |
| **Favorites** | Students can save mentors |
| **Reviews & Ratings** | Star ratings with comments |
| **Profile Management** | Edit bio, upload avatar |
| **Role-based UX** | Different flows for students vs mentors |

---

## 8. Customization

### Change app name/branding
- `app.json` → update `name`, `slug`, `bundleIdentifier`
- `constants/theme.ts` → update colors

### Add more mentor fields
- `constants/theme.ts` → `FIELDS_OF_EXPERTISE` array
- `supabase/schema.sql` → no changes needed (stored as array)

### Notifications (push)
Add `expo-notifications` for push notifications on new messages.

---

## 9. Environment Variables Reference

| Variable | Description |
|----------|-------------|
| `EXPO_PUBLIC_SUPABASE_URL` | Your Supabase project URL |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon/public key |

---

## Support
For issues or questions about the app, refer to:
- [Expo documentation](https://docs.expo.dev)
- [Supabase documentation](https://supabase.com/docs)
- [EAS Build docs](https://docs.expo.dev/build/introduction/)
