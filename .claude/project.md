# Project profile: Budgeer

The facts the generic skills (ship-feature, release-to-prod, design-renders,
delegate-and-review, improve-skills) need for THIS project. The skills say how
to work; this file says what's true here. CLAUDE.md holds the code rules and the
architecture map; this file doesn't repeat them. The improve-skills skill keeps
this file current, so add project facts here, not in the skills.

## Product and people

- **What it is:** a financial PWA, an expense/income tracker plus a friend
  bill-splitter. React + Vite + Chakra UI on the client; Supabase (Postgres,
  RLS, definer functions, Edge Functions, Auth, Realtime) on the back end.
- **Owner:** Chrysovalantis Psilos. They decide product questions and approve
  PROD releases explicitly, every time.
- **Which skills to use:** the ones in this repo's `.claude/skills/`, the
  maintained copies that improve-skills edits. Don't use the uploaded
  organisation copies (`anthropic-skills:…`), which may be stale, or the
  separate `claude-skills` repo, which is parked for now.
- **Owner preferences:**
  - Decides from pictures: show renders or screenshots before design
    decisions.
  - Action buttons sit inline, at the end of the content they act on, not in
    sticky or floating bars over the page. Any "apply" gets a clear or
    cancel button beside it. This is the website's rule: the native iOS app
    may use floating menus and controls (Liquid Glass, a floating tab bar on
    every tab) as long as they look good and are easy to use.
  - No unnecessary popups: editing and picking happen inline (rows expand
    in place). Modals and sheets are only for real confirmations (applying
    changes, destructive actions, undo).
  - Short, plain replies. Questions go as multiple choice with a
    recommendation. Don't repeat "Noted." after hook feedback.
  - Dev and PROD behave identically; existing and future accounts get every
    feature (backfill in migrations).
  - Backups must cover every feature.
  - GDPR matters: new personal data goes in docs/GDPR.md and the Privacy
    Notice. Don't bump the legal version for non-material edits. Keep the
    signup consent checkbox.
  - Never commit real data (CSVs, names, IBANs, card numbers); fixtures are
    fake.
  - Never print passwords or secrets; secrets live only in GitHub secrets or
    Supabase Vault.

## Environments

| | Dev / TEST | PROD |
| --- | --- | --- |
| Site | dev.budgeer.com | budgeer.com (www) |
| Branch | `develop` | `main` |
| Supabase project | `ctvdljzybbujuywppixo` | `tuxfpylowcxazinqtrzx` |
| Hosting | Vercel project `budge` (team `chrysovalantis-psilos-projects-f6cf46e9`) | same, production target |

- **Deploys:** a push to `develop` deploys dev; a fast-forward of `main`
  deploys PROD.
- **Live check:** `budgeer.com` answers with a 308 to `www.budgeer.com`, so
  check the bundle there (`curl -sL`). The entry chunk carries the newest
  What's new id; a release also redeploys every function whose import closure
  changed since `main` (work it out by script, not by memory).
- **Auto-update:** open apps reload within a minute of any deploy
  (`src/app/AutoUpdate.jsx`), so batch small pushes while the owner is
  testing.
- **Status page:** status.budgeer.com is a Cloudflare Worker (`status/`),
  deployed by `.github/workflows/status-deploy.yml`.
- **Demo account:** dev only (`demo@budgeer.com`, migration 0090), reset
  nightly by `demo_seed`/`demo_wipe`. A feature storing user data must extend
  `demo_wipe`, via a migration. The credentials live in the session
  scratchpad only, never in the repo. The four AI helpers are on for it
  (0106: `demo_wipe` turns them off, `demo_seed` back on), under a shared
  cap of 100 calls a day (`ai:demo`).

## Commands

```bash
npm test          # node --test, run in UTC, Europe/Brussels and America/Los_Angeles
npm run lint      # eslint --max-warnings=0 (a warning fails)
npm run build
npm run dev       # Vite
```

## Git

- **Develop on `develop`,** or on a feature branch merged into it. Never
  rebase shared branches; merge.
- **Commit identity:** use the env vars
  `GIT_AUTHOR_NAME/GIT_COMMITTER_NAME="Chrysovalantis Psilos"` and
  `GIT_AUTHOR_EMAIL/GIT_COMMITTER_EMAIL=chrysovalantis.psilos@outlook.com`.
- **No AI mentions:** no mention of AI, Claude, agent or assistant in commits,
  branch names, code or docs, and no Co-Authored-By or session trailers.
  Branches get plain names (`plan-header`, `meal-vouchers`), never a tool's
  default like `claude/…`, even when a session suggests one.
- **Merges too:** `git merge` makes a commit, so run it with the same
  identity env vars (a plain `git merge` signs it with the tool's default
  name). Check `git log --format='%an|%cn'` before every push. The check:
  `git log origin/develop..HEAD --format=%B | grep -iE "claude|co-authored|assistant"`.
  The only allowed hit is the file name `CLAUDE.md` in a merge's conflict
  list.
- **Commit messages:** a short plain subject ("Import rules: 15 per page"),
  then a body with what and why.

## Translations

- **Languages:** English + Greek, both in the same change. The engine is in
  `src/shared/lib/i18n/`, the dictionaries in `src/locales/{en,el}/<ns>.js`,
  the conventions in `docs/I18N.md`, and the parity test is
  `test/i18n.test.js`.
- **JSX:** `react/jsx-no-literals` is on for all JSX. Props and toasts need a
  manual check.
- **Greek wording rules** (`docs/i18n-glossary-el.md`):
  - informal «σου», never «σας»
  - «Μοιράσου», never «Μοίρασε»; avoid «μοιρασιά»
  - sentence case («Προσπάθησε ξανά»)
  - short, natural phrasing
  - a budget cap is «όριο»; a group owner is «Διαχειριστής»
  - default category names show in the app language
- **Length:** Greek runs 20–30% longer, so check chips and buttons at 390px.

## Database

- **Migrations:** `supabase/migrations/NNNN_*.sql`, append-only, next free
  number. Apply with Supabase MCP `apply_migration` using the file's exact
  contents: TEST during development, PROD at release. If `apply_migration`
  (or any write) times out after 60 s, reads still work but writes are
  blocked: check nothing landed, then hand the owner the file for that
  project's SQL Editor with a last line recording it in
  `supabase_migrations.schema_migrations`, and verify by reading. The test
  suite run there shows only "Success. No rows returned": that is a pass
  (it raises when any test fails or doesn't run).
- **Functions:** change a function by editing
  `supabase/sql/functions/<name>.sql` and pasting it into the new migration;
  the test (`test/sqlFunctions.test.js`) keeps them equal.
- **Security bar:** CLAUDE.md #5–#6.
  - RLS on every table, with per-verb policies.
  - BEFORE triggers force ownership and server-owned columns.
  - Definer functions pin `search_path = public, pg_temp` and revoke EXECUTE
    from public/anon.
  - Money and personal text are encrypted (`*_enc` + `app_enc_key()`), and
    read through `my_*` functions.
  - Fan-out is rate-limited.
- **Tests:** `supabase/tests/db_tests.sql` is rolled back (each block raises
  `ROLLBACK_OK`), so it's safe on live data.
  - A new block copies an existing one (`pg_temp.zz_user(...)`, act as
    `authenticated`, PASS/FAIL via `_t`) and bumps `expected_tests`.
  - The suite must end with `ALL DATABASE TESTS PASSED (N tests)`.
- **Running the suite remotely:** too big for one `execute_sql`, so split it
  into ~10 chunks at the `-- ---` test headers and turn notices into a temp
  `_log` table. A chunker is `gen_chunks.py`: keep it in the session
  scratchpad, never in the repo.
- **GDPR hooks:** `export_my_data()` must include new tables, and account
  deletion must cover them.

## Edge functions

- **Layout:** `supabase/functions/<name>/`, with shared code in
  `supabase/functions/_shared/`.
- **Which to deploy:** every function whose files changed, or that imports a
  changed `_shared` file. Work out each function's relative-import closure.
- **How to upload:** with MCP `deploy_edge_function`, upload `index.ts` plus
  `../_shared/<file>.ts`, entrypoint `index.ts`, and function-local files by
  bare name.
- **verify_jwt:** as in `supabase/config.toml`. User-called functions keep it
  true (`generate-report`, `group-report`, `send-invite`, `delete-account`,
  `privacy-request`); cron/webhook ones keep it false.
- **Smoke test:** `OPTIONS` → 200 with CORS, and `POST` without a JWT → 401.

## Release notes

- **Every PROD release** adds a What's new entry at the top of
  `src/features/whatsnew/releases.js`. The words go in
  `src/locales/{en,el}/whatsnew.js`.
- **Id:** the id is `YYYY-MM-DD`, unique, and plain-date only (DB check
  `profiles_whats_new_seen_check`). If today's id is taken, use the next day.
- **Test:** `test/whatsNew.test.js` pins the newest release, so update it.
- **Dev pushes** get no entry.
- **Architecture page:** each release also refreshes the owner's private
  architecture explainer (https://claude.ai/artifact/7C3kqraCdWXE8KpkaKRBHF):
  re-check it against the code (tables, functions, jobs, routes, workflows),
  update its "As of" date and develop sha, and republish to the same link.
  Never put keys, passwords, user data or row counts on it.
- **Inflation table:** each release refreshes the HICP figures in
  `src/features/salary/salaryMath.js` (`INFLATION`, `INFLATION_LATEST`) from
  Eurostat's API (`prc_hicp_ainr` RCH_A_AVG and `prc_hicp_minr` RCH_A,
  coicop18 TOTAL, geo BE and EL) and updates the retrieval date there.

## Screenshots and design renders

- **Browser:** Chromium at `/opt/pw-browsers/chromium-1194/chrome-linux/chrome`,
  Playwright from `/opt/node22/lib/node_modules/`. Never run
  `playwright install`.
- **Prototype app:** serve a scratch copy with
  `VITE_SUPABASE_URL=https://fake.supabase.co VITE_SUPABASE_ANON_KEY=fake`
  and mock Supabase in Playwright. Past harnesses live in the session
  scratchpad (`group-add-design/`, `plan-design/`: `harness.mjs`,
  `mockdata.mjs`, `shoot.mjs`, `vite.shots.mjs`).
- **Serving the harness:** run it with the harness's own Vite config
  (`vite.shots.mjs`, which sets `allowedHosts: true`), or Vite blocks the
  mapped `www.budgeer.com` host. Stop the server by PID. `pkill -f` with the
  port in the pattern also kills your own shell.
- **Sizes:** phone 390×844 (dsf 2), sideways phone 844×390
  (`shortLandscape.js`), desktop 1280×800, plus dark mode.
- **Live sites from the cloud sandbox:** Chromium needs
  `--ignore-certificate-errors-spki-list=<proxy CA hashes>` (built from
  `/root/.ccr/ca-bundle.crt`) for pages and service workers to load. The
  sandbox blocks Supabase realtime websockets.

## Brand

- **Mark:** a lowercase "b" whose bowl is a budget progress ring, with a short
  amber segment and a long coral one. The master is `public/budgeer-mark.svg`.
- **Wordmark:** "budgeer" in Poppins Bold 700, tracking -0.02em, outlined in
  the final SVGs.
- **Colours:**
  - coral `#F95D38` (the mark)
  - accent `#E2431F`
  - amber `#FBB324`
  - ink `#242019`
  - canvas `#FAF8F4`
  - pale amber `#FDDF8A`, used only in the on-coral mark
  - all theme values are in `src/shared/ui/palette.js`
- **Fonts:** headings in Poppins, body in Nunito Sans. Greek letters fall
  back to Manrope (headings) and Noto Sans (body). All are installed via
  `@fontsource`; `FONTS` in `src/shared/ui/palette.js` holds the stacks.
- **Clear space and sizes:** clear space is the b's counter (30% of the mark
  box). Minimum sizes: horizontal lockup 96 px, stacked lockup 56 px, mark
  alone 16 px.
- **Logo pack v1 (Sep 2026):** marks, lockups, app icons, favicons, a brand
  sheet and a README. Built in the session scratchpad (`logo-pack/`); ask the
  owner for the zip if it's needed again.
- **Promo set v1:** store frames 1–6 (home, split, budgets, currency, import,
  privacy), OG 1200×630, social 1080 and 1080×1920, hero 1920×1080. Built from
  the app with fake data (scratchpad `promo/`).
- **Link previews:** the live OG image is `https://www.budgeer.com/og-image.png`
  (1200×630). Invite links (`/join/…`) currently share the generic preview.
- **Rule:** the landing copy never opens with "Free app".

## Sign in with Apple

- **On the website and the iOS app (Oct 2026, the owner's paid Apple
  Developer account).** Web: `signInWithOAuth({ provider: 'apple' })` next to
  Google on Login/Sign up, Connect/Disconnect in Settings › Security (the
  same consent marker and legal prompt as Google). iOS: the system's sheet
  (`Auth/AppleSignIn.swift`, a hashed nonce) → `signInWithIdToken`; Connect
  in Security is `linkIdentityWithIdToken`; the name Apple gives once is
  saved (`authMethods.appleProfileName`).
- **Supabase Auth → Apple provider, both projects:** Client IDs = the
  Services ID (web) plus the app's bundle id (`com.budgeer.app.dev` on TEST,
  `com.budgeer.app` on PROD); the secret key is a JWT signed with the Sign in
  with Apple key, which **expires after 6 months**: regenerate and paste it
  into both projects before then (calendar it). Only the web flow uses it.
- **Emails to "Hide My Email" addresses** reach the user only from senders
  registered in Apple's private email relay (budgeer.com and each From
  address: Supabase Auth's SMTP sender, INVITE_FROM, privacy@, no-reply@).

## iOS app

- **Capacitor shell dropped by the owner (28 Sep 2026)** after it was built;
  it was removed again (reverted).
- **iOS: native SwiftUI; the maths is the web's JS via JavaScriptCore**
  (`mobile-core/`, `ios/BudgeerCore`), proven by recorded vectors
  (`npm run core:vectors` → `vectors.json`, replayed by `test/mobileCore.test.js`
  on Linux and by the Swift tests in `.github/workflows/ios-app.yml` on
  macOS). Maths is never re-implemented in Swift: a figure the app needs goes
  in a pure web module first (ios/README.md "Adding a module"). UI, storage,
  auth and push are Swift.
- **Two apps, side by side:** "Budgeer Dev" (`com.budgeer.app.dev`, the Dev
  scheme, TEST) and "Budgeer" (`com.budgeer.app`, the Prod scheme, PROD); the
  bundle id and name come from `Config/Dev.xcconfig` / `Prod.xcconfig`, the
  icons from the ios-polish work. Capabilities: Push Notifications and Sign
  in with Apple (`Config/Budgeer-Debug.entitlements` = development APNs,
  `Budgeer-Release.entitlements` = production; TestFlight and the App Store
  are Release builds). Automatic signing; `DEVELOPMENT_TEAM` lives only in
  `Config/Local.xcconfig` (gitignored) or CI's command line.
- **TestFlight:** `.github/workflows/ios-testflight.yml`, by hand (Run
  workflow, app = dev | prod; default dev). macos-26 / Xcode 26.5,
  `xcodebuild archive` + `-exportArchive` (ExportOptions: app-store-connect,
  destination upload) with `-allowProvisioningUpdates` and the App Store
  Connect API key (cloud signing: the key needs the **Admin** role). Build
  number = the workflow's run number. GitHub secrets (names only):
  `ASC_KEY_ID`, `ASC_ISSUER_ID`, `ASC_KEY_P8`, `APPLE_TEAM_ID`. It fails at
  once, naming what's missing, without them. `ITSAppUsesNonExemptEncryption`
  is NO (only the OS's TLS/Keychain and a SHA-256 nonce hash).
  `ASC_KEY_P8` holds the whole .p8 text, BEGIN/END lines included
  ("invalidPEMDocument" = it doesn't). The app is iPhone-only: keep
  `TARGETED_DEVICE_FAMILY: "1"` on the Budgeer target itself (XcodeGen's
  preset sets "1,2" per target, and a portrait-only iPad build is refused,
  error 90474).
- **Push (APNs):** the app asks only from Settings › Notifications or once
  after the first entry saved (`Push/PushModel.swift`), stores the token with
  `save_apns_token` (0108: `apns_devices`, demo refused, 20/hour, 10 installs
  max, deleted on sign-out, with the account, exported without the token).
  `notify-user` sends to APNs (`_shared/apns.ts`: ES256 provider token kept
  50 min, host by the token's env, topic by project: PROD → `com.budgeer.app`,
  else `.dev`; dead tokens deleted). Function secrets (names): `APNS_KEY_ID`,
  `APNS_TEAM_ID`, `APNS_KEY_P8`; without them APNs is skipped. A tap opens
  the notification's web path (`AppRouter.open(path:)`).
- **The app (phase 2, `ios/Budgeer`):** XcodeGen project (`project.yml`;
  never commit the .xcodeproj), Dev scheme = TEST project, Prod scheme =
  PROD, from `Config/*.xcconfig` (public anon keys only). `npm run
  ios:prepare` builds the core, the strings and the project. Sign-in is
  email/password or Google (`budgeer://auth-callback`) via supabase-swift
  2.49.0 (chosen when CI ran Xcode 15.4; CI now pins Xcode 26.5 on macos-26),
  or Apple; the legal gate records the acceptance in the app
  (`accept_legal_documents`), as the web's prompt. Real: Home (period
  picker, projection, Recurring card), Add/Edit, Transactions, Budgets,
  Recurring and Insights (from More), and (phase 3) Groups with Add's
  "Who's it for?", and (step 6) the statement import with its rules and
  Your data's backup and restore, over a cached, realtime data layer
  (ios/README.md lists what is not yet there). A backup file is the same
  on both: the app seals with CryptoKit what the web seals with WebCrypto
  (backupMath.SEAL); SheetJS is the one package the core bundles.
  Strings come from `src/locales` (`mobile-core/strings.mjs`), never written
  in Swift; the app's own few words are the `ios` namespace. Each screen's
  figures are checked against the web's through `Fixtures/*.json`
  (`npm run ios:fixture` after a maths change; `test/iosHome.test.js`,
  `test/iosScreens.test.js`); logic a screen needs that a web component
  worked out inline moves into the feature's pure module first.
  Fonts: Poppins, Nunito Sans and Manrope are bundled (OFL, static TTFs);
  Greek body text uses the system font. CI: `.github/workflows/ios-app.yml`
  (snapshots of every screen as the `snapshots` artifact).
- **CI minutes are scarce** (macOS minutes cost 10x). The iOS checks are one
  macOS job (`ios-app.yml`: the core's Swift replay, build, tests,
  snapshots) that runs on its own only for pushes to develop touching the
  app, and on pull requests; a feature branch gets it by hand (Actions → Run
  workflow, or the API's workflow_dispatch) once its batch is ready. Newer
  pushes cancel older runs. Helpers commit locally and push checked batches,
  never WIP. Snapshot pictures (~20 min of a ~27 min run) are taken only on
  runs by hand with "snapshots" ticked; develop pushes and PRs skip them.
  A commit that can't change a check (notes, workflow-only edits
  already checked) may carry `[skip ci]`.
- **Universal Links and passkeys (Oct 2026):** the site serves
  `/.well-known/apple-app-site-association` (both app ids under team
  `Z9KGWP5G82`, applinks + webcredentials); each build claims its own host
  through `BUDGEER_WEB_HOST`/`_APEX` in the xcconfigs. Apple's CDN follows
  no redirect, so `budgeer.com` verifies only once the Vercel domain serves
  (vercel.json then redirects everything but `/.well-known/` to www).
  Passkeys' relying party is the site host the server names
  (`www.budgeer.com` on PROD, `dev.budgeer.com` on TEST); the app calls
  Supabase Auth's `/auth/v1/passkeys/*` itself (supabase-swift has no
  passkey API) with the system's passkey sheet.
- **Feature parity (owner rule, 1 Oct 2026):** every feature the website
  offers must also be in the iOS app, and the other way round, before a
  release; no discrepancies. App-only extras that are platform features
  (widgets, Siri, Face ID lock, push on iOS) are fine. A release to PROD
  ships both: budgeer.com and the two TestFlight apps (Budgeer on PROD,
  Budgeer Dev on TEST).
- **The owner builds and runs the app with Xcode 27** on their Mac (with the
  paid developer team in `Config/Local.xcconfig`), while CI builds with Xcode 26.5 (macos-26, iPhone 17
  on iOS 26.5; moved from 15.4 for Liquid Glass). Every package pin
  and Swift change must work on both: check a dependency's newest releases
  (what Xcode 27 resolves) as well as the oldest CI accepts. Package pins
  live in `ios/Budgeer/project.yml` with the reason beside each; the
  swift-clocks / swift-custom-dump caps exist because Xcode 27 otherwise
  resolves them onto the renamed swift-issue-reporting and refuses the graph.
  Local run steps: `git pull`, `npm run ios:prepare`, then
  `xcodebuild -resolvePackageDependencies -scheme "Budgeer Dev"` in
  `ios/Budgeer` if packages changed.

## Follow-ups a feature here usually needs

- **Backups:** the data round-trips through `src/features/backup/`, tested in
  `test/backupMath.test.js`.
- **Browser storage:** new keys go in `STORAGE_KEYS` (`src/shared/lib/keys.js`)
  AND the Privacy Notice list, checked by `test/storageKeys.test.js`.
- **Docs:** CLAUDE.md's architecture map, and `docs/TESTING.md`'s feature
  inventory and manual plan.
- **Layouts:** check dark mode and sideways phones (landscape ≤ 500px tall).
