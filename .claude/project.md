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
  contents: TEST during development, PROD at release.
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

- **Dropped by the owner (28 Sep 2026):** it needs the paid Apple Developer
  Program ($99/yr) plus a secret rotated every 6 months, and a website doesn't
  require it. Sign-in stays email/password, Google and passkeys.

## iOS app

- **Capacitor shell dropped by the owner (28 Sep 2026)** after it was built;
  it was removed again (reverted).
- **iOS: native SwiftUI; the maths is the web's JS via JavaScriptCore**
  (`mobile-core/`, `ios/BudgeerCore`), proven by recorded vectors
  (`npm run core:vectors` → `vectors.json`, replayed by `test/mobileCore.test.js`
  on Linux and by the Swift tests in `.github/workflows/ios-core.yml` on
  macOS). Maths is never re-implemented in Swift: a figure the app needs goes
  in a pure web module first (ios/README.md "Adding a module"). UI, storage,
  auth and push are Swift.
- **The app (phase 2, `ios/Budgeer`):** XcodeGen project (`project.yml`;
  never commit the .xcodeproj), Dev scheme = TEST project, Prod scheme =
  PROD, from `Config/*.xcconfig` (public anon keys only). `npm run
  ios:prepare` builds the core, the strings and the project. Sign-in is
  email/password or Google (`budgeer://auth-callback`) via supabase-swift
  2.49.0 (the last on Swift tools 5.10; CI pins Xcode 15.4 on macos-14);
  the legal gate sends the user to the web to accept. Real: Home (period
  picker, projection, Recurring card), Add/Edit, Transactions, Budgets,
  Recurring and Insights (from More), and (phase 3) Groups with Add's
  "Who's it for?", over a cached, realtime data layer (ios/README.md lists
  what is not yet there).
  Strings come from `src/locales` (`mobile-core/strings.mjs`), never written
  in Swift; the app's own few words are the `ios` namespace. Each screen's
  figures are checked against the web's through `Fixtures/*.json`
  (`npm run ios:fixture` after a maths change; `test/iosHome.test.js`,
  `test/iosScreens.test.js`); logic a screen needs that a web component
  worked out inline moves into the feature's pure module first.
  Fonts: Poppins, Nunito Sans and Manrope are bundled (OFL, static TTFs);
  Greek body text uses the system font. CI: `.github/workflows/ios-app.yml`
  (snapshots of every screen as the `snapshots` artifact).
- **The owner builds and runs the app with Xcode 27** on their Mac (and a
  free Apple ID for now), while CI builds with Xcode 15.4. Every package pin
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
