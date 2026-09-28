# Budgeer for iPhone — building the app on your Mac

The iOS app is the Budgeer website wrapped in a native shell (Capacitor 8).
The same React build runs inside an iPhone web view, so every feature ships
to the app with the next build. This guide takes you from a fresh Mac to a
TestFlight build your testers can install.

The first builds point at the **test site's data** (dev, the TEST Supabase
project), exactly like dev.budgeer.com. Switching to live data is one command
(step 5).

## What's in the repo

| Where | What |
| --- | --- |
| `capacitor.config.json` | App ID `com.budgeer.app`, name "Budgeer", the build folder (`dist`), the web view's background colour |
| `ios/` | The Xcode project (Swift Package Manager, no CocoaPods). iPhone only, portrait and landscape |
| `ios/App/App/Info.plist` | The `com.budgeer.app://` URL scheme, and "no special encryption" for export compliance |
| `ios/App/App/App.entitlements` | Associated Domains (universal links), **commented out until the Team ID is known** |
| `ios/App/App/PrivacyInfo.xcprivacy` | The privacy manifest: no tracking; UserDefaults read by the app itself (reason CA92.1) |
| `ios/App/App/Assets.xcassets` | The app icon (1024×1024, from `public/pwa-icon.svg`) and the launch screen's mark |
| `public/.well-known/apple-app-site-association` | Tells iOS which links open the app (`/join/…`, `/auth/confirm`), **with a TEAM_ID placeholder** |
| `src/shared/lib/platform.js` | `isNative()`: everything app-only is behind it, so the website is unchanged |
| `src/shared/lib/deepLinks.js` | Which links open the app and where they go (tested in `test/deepLinks.test.js`) |
| `src/app/NativeBridge.jsx`, `src/shared/lib/native.js` | The app-only glue: links, Google sign-in's return, status bar colour |

`ios/App/App/public/` and `ios/App/App/capacitor.config.json` are made by
`npm run ios:sync` and are not in git.

## 1. What you need

- **A Mac** with the current **Xcode** from the Mac App Store. Open it once
  and let it install its extra components.
- **Node 22 or newer** (`node -v`). The easiest way: `brew install node@22`,
  or the installer from nodejs.org.
- **Your Apple Developer account** (the paid Apple Developer Program, in your
  own name). In Xcode: Settings → Accounts → **+** → Apple ID, and sign in.
- **An iPhone** with a cable, and Developer Mode turned on (Settings →
  Privacy & Security → Developer Mode; the iPhone asks to restart).

## 2. Get the code

```bash
git clone https://github.com/ChrysovalantisPsilos/expense-tracker.git
cd expense-tracker
git checkout ios-app   # until it is merged into develop
npm ci
```

## 3. Create the env file (never committed)

The app's build reads its Supabase address and publishable key from a file
that git ignores (`.env.*` is in `.gitignore`). Create **`.env.ios-dev`** in
the repo's top folder:

```bash
VITE_SUPABASE_URL=https://ctvdljzybbujuywppixo.supabase.co
VITE_SUPABASE_ANON_KEY=<the TEST project's publishable key>
```

The key is in the Supabase dashboard → the TEST project → Project Settings →
API Keys → the **publishable** key (starts `sb_publishable_`), the same one
Vercel gives dev.budgeer.com. Never the `sb_secret_` key.

For live data later, create **`.env.ios-prod`** the same way with the PROD
project (`https://tuxfpylowcxazinqtrzx.supabase.co` and its publishable key).

The build stops with a clear message if the file is missing or names the
wrong project, so a dev build can't quietly talk to live data.

## 4. Build and open Xcode

```bash
npm run ios:sync    # builds the web app for dev and copies it into ios/
npm run ios:open    # opens ios/App/App.xcodeproj in Xcode
```

Run `npm run ios:sync` again after every `git pull` or code change, before
building in Xcode. The first time, Xcode fetches the Capacitor packages
(Swift Package Manager); wait until "Fetching…" disappears from its top bar.

## 5. Dev or live

| Command | Talks to | Env file |
| --- | --- | --- |
| `npm run ios:sync` | dev (TEST project), for TestFlight testing | `.env.ios-dev` |
| `npm run ios:sync:prod` | live (PROD project), for the App Store | `.env.ios-prod` |

Both builds are the same app (`com.budgeer.app`): installing one replaces the
other on a phone. Sync the one you want, then build in Xcode.

## 6. Choose your Team (signing)

1. In Xcode's left column click **App** (the blue project icon), then the
   **App** target, then the **Signing & Capabilities** tab.
2. Keep **Automatically manage signing** ticked.
3. **Team**: pick your name (the team of your paid Developer Program
   membership). The repo has the placeholder `TEAM_ID` here
   (`DEVELOPMENT_TEAM` in `ios/App/App.xcodeproj/project.pbxproj`); picking
   your Team replaces it.
4. Bundle Identifier stays **com.budgeer.app**. Xcode registers it on your
   account the first time.

Your Team ID is the 10-character code shown in the Apple Developer website →
Membership details (e.g. `A1B2C3D4E5`). Keep it for step 11.

## 7. Run it on your iPhone

1. Plug in the iPhone and unlock it; tap **Trust** if asked.
2. At the top of Xcode, choose your iPhone as the run destination.
3. Press **▶ Run** (⌘R). The first time, the iPhone may ask you to trust
   the developer: Settings → General → VPN & Device Management.

The app shows the Budgeer launch screen, then the dev sign-in page. Check the
list in docs/TESTING.md → "N. iOS app".

## 8. Upload to TestFlight

1. In App Store Connect (appstoreconnect.apple.com) → Apps → **+** → New
   App: iOS, name "Budgeer", primary language English, bundle ID
   `com.budgeer.app`, SKU e.g. `budgeer-ios`.
2. Before each upload, raise the build number: Xcode → App target → General
   → **Build** (1, 2, 3…). Keep **Version** at 1.0 until the App Store
   release.
3. Choose **Any iOS Device (arm64)** as the run destination.
4. Product → **Archive**. When it finishes, the Organizer window opens.
5. **Distribute App** → **App Store Connect** → **Upload**, and accept the
   defaults (automatic signing).
6. After 5–30 minutes the build shows in App Store Connect → your app →
   **TestFlight**. Export compliance is already answered in `Info.plist`
   (the app only uses the system's HTTPS).

## 9. Add testers

- **Internal testers** (up to 100 people on your App Store Connect team):
  TestFlight → Internal Testing → **+** → add them; they get the build as
  soon as it's processed.
- **External testers** (anyone with an email address): TestFlight →
  External Testing → **+** a group → add emails → add the build. The first
  build of a version goes through a short Beta App Review (usually a day).
- Testers install the **TestFlight** app from the App Store and open the
  invite from their email.

Testers use the dev data, so they need an account on dev.budgeer.com (or can
sign up in the app).

## 10. Supabase redirect URLs (the dashboard, once per project)

Google sign-in returns to the app on its own URL scheme. In the Supabase
dashboard → the **TEST** project → Authentication → URL Configuration →
**Redirect URLs**, add:

```
com.budgeer.app://**
```

Keep everything that's already there (the site URLs). Do the same on the
**PROD** project before the first live build. The Site URL stays as it is:
the email links keep going to the website, and open the app once universal
links are on (step 11).

Nothing changes in Google Cloud: Google still returns to Supabase, which then
hands over to the app.

## 11. Fill in the Team ID (universal links)

Until this is done, the app works fully, but invite links and the sign-up and
reset emails open in Safari instead of the app. With your Team ID:

1. In `public/.well-known/apple-app-site-association`, replace `TEAM_ID`
   with your Team ID (`"A1B2C3D4E5.com.budgeer.app"`). Commit and push to
   develop, and check https://dev.budgeer.com/.well-known/apple-app-site-association
   shows it (served as `application/json`, set in `vercel.json`). It goes to
   www.budgeer.com with the next production release.
2. In `ios/App/App/App.entitlements`, move the Associated Domains key out of
   the comment (delete the `<!--` and `-->` lines around it).
3. In Xcode → Signing & Capabilities, check **Associated Domains** now lists
   `applinks:www.budgeer.com` and `applinks:dev.budgeer.com`.
4. Build and install again. Tapping a `https://dev.budgeer.com/join/…` link
   in Notes or Mail opens the app on the invite.

Find every placeholder with: `grep -rn TEAM_ID public ios`.

The bare `budgeer.com` isn't listed: it redirects to www, and iOS doesn't
follow redirects for this file. Links to it open in Safari as before.

## 12. For the next maintainer (not on the Mac)

- **Edge functions:** the app calls them from the origin `capacitor://localhost`,
  now allowed in `supabase/functions/_shared/cors.ts`. Redeploy the functions
  that use it (`send-invite`, `generate-report`, `group-report`,
  `delete-account`, `privacy-request`) to TEST, and to PROD at the next
  release, or those five features fail in the app with a network error.

## How the app differs from the website

- **No service worker.** The iPhone web view doesn't run one, and each app
  build carries its own copy of the web app, so there is no auto-update
  (a new version comes with the next TestFlight build) and no web push.
  The app opens offline, since its files are on the phone, but its data
  needs the network: offline, a page can't load what the website would have
  served from its cached reads.
- **Google sign-in** opens in the system browser sheet (Google blocks
  sign-in inside app web views) and comes back on
  `com.budgeer.app://auth/callback` with a one-time code (PKCE).
- **Links the app shares** (invites, FAQ answers) use the website's address,
  never the app's internal `capacitor://localhost`.
- **Passkeys** are hidden in the app for now: a passkey belongs to the
  website's domain, and the web view's `capacitor://` origin can't use it.
  They need the Associated Domains `webcredentials` entry and a native
  passkey plugin (next phase). Email/password and Google work.
- **Web push** is off in the app (reminders still reach the in-app bell and
  email). Apple push comes next phase.

## Next phase

- Sign in with Apple (required by Apple because Google sign-in is offered)
- Apple push notifications (APNs) in place of web push
- Face ID lock
- The share sheet and saving files for statements and backups
- The camera for receipts
- Haptics
- Passkeys (webcredentials + a native passkey flow)
- The App Store listing (EN + EL), the privacy label, and a reviewer account
  on PROD
