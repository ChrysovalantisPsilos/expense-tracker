# Budgeer

**Track your money. Split with friends.** Budgeer is an installable web app
(PWA) that combines a personal expense and income tracker with a bill
splitter for trips, flats and nights out.

- Live: [budgeer.com](https://budgeer.com) (production) ·
  [dev.budgeer.com](https://dev.budgeer.com) (test)
- Stack: React 18, Vite, Chakra UI · Supabase (Postgres, Row Level Security,
  Auth, Realtime, Edge Functions, Vault, pg_cron) · Vercel

It's a portfolio project, built as a production app with real users in mind.
It has a written quality bar ([`CLAUDE.md`](CLAUDE.md)), security reviews, and
tests for the database as well as the client.

---

## Features

**Personal finance**
- Expenses and income with categories and notes. One Transactions page with
  search and filters across all history.
- Multi-currency: each entry keeps the currency you paid in, plus the exchange
  rate captured when it was logged (ECB reference rates), so past totals never
  shift. Zero-decimal currencies (JPY, KRW, …) are handled exactly.
- Monthly budgets per category. Bars turn amber at 80% and red when you're
  over, with a notification at each threshold.
- Recurring payments (rent, subscriptions, salary) are booked automatically,
  with optional reminders before each charge.
- Savings goals, accounts and net worth, and insights: spending by category
  and a six-month trend.
- On-device receipt scanning: OCR (Tesseract, self-hosted) fills in the amount
  and date. The photo is never uploaded.
- Smart import from CSV or Excel: columns are detected automatically,
  re-imports are duplicate-proof, and merchant-to-category rules are learned.
- Branded PDF and Excel statements.
- Backup and restore as one JSON file, optionally password-encrypted in the
  browser (PBKDF2 + AES-GCM). Restore merges and skips duplicates.

**Groups**
- Invite friends by link, email or in-app. Friends join with a free account.
- Split equally, by exact amount, by percentage or by shares.
- Live balances and a "fewest payments" settle-up plan. Payments are recorded
  as settlements.
- Pay-back shortcuts: Revolut link, SEPA/EPC QR code with the exact amount,
  copy IBAN, and friendly nudges.
- Your share of each group expense is mirrored into your personal spending
  and budgets automatically.
- Comments on expenses and settlements, an immutable audit log, and a group
  PDF statement.

**Platform**
- Installable PWA with an offline app shell and offline reading of your
  last-synced data.
- Realtime updates everywhere, with no polling.
- Updates install automatically when you're not mid-task.
- Notification bell, web push and email (big events only), each with its own
  switch. There's also a weekly digest.
- Sign in with email and password, Google, or a passkey — or several: connect
  Google to a password account, or set a password on a Google one (Settings →
  Security). Light, dark or system theme.
- Account deletion that hands group data over to the remaining members.

---

## Architecture

```
src/
  app/           shell, routing, providers, theme (no data access)
  features/      one folder per feature: components (*.jsx), a data module
                 (*.js, wraps Supabase) and a pure, unit-tested math module
    auth  backup  budgets  dashboard  groups  import  insights  landing
    notifications  onboarding  privacy  recurring  settings  transactions
  shared/
    lib/         cross-feature data (db.js, supabase.js, realtime.js, …) and
                 pure helpers (currency, dates, moneyParse, paginate, …)
    ui/          cross-feature components
    ui/kit/      the design-system kit (panels, tiles, figures, rows, bars)
    auth/        the auth context
  sw.js          service worker: precache, offline reads, web push
supabase/
  migrations/    NNNN_*.sql, append-only and ordered
  functions/     Edge Functions (+ _shared/ for CORS, auth, money, email, PDF)
  tests/         db_tests.sql, a rolled-back security and behaviour suite
test/            node:test unit tests for every pure module
```

**Feature-first layout.** Each feature owns its UI, its data access and its
maths. Code moves into `shared/` only when two or more features need it, and
`shared/` never imports from `features/` (lint enforces this).

**Separation of concerns.** Components never call Supabase directly: reads
and writes go through the feature's data module or `shared/lib/db.js`. Money
maths (splits, currency conversion, budgets, recurring projections, import
parsing) lives in pure modules with unit tests. Money is always integer minor
units.

**Supabase back end.**
- **Row Level Security on every table.** Policies are split per verb
  (select/insert/update/delete), never a blanket `FOR ALL`.
- **SECURITY DEFINER RPCs** for anything that crosses users (group ledgers,
  balances, invites, settlements). Each one pins `search_path` and has
  `EXECUTE` revoked from roles that shouldn't call it.
- **Server-authoritative columns** (`created_by`, ownership, invite tokens and
  expiry) are forced by BEFORE triggers, never trusted from the client.
- **Encryption at rest.** Amounts, descriptions, notes, comments, balances,
  budgets, goals and payment details are encrypted with pgcrypto. The key is
  kept in Supabase Vault. API roles can't write those columns directly: reads
  go through decrypting RPCs and writes through encrypting ones. This protects
  a leaked dump or backup. It is *not* end-to-end encryption, because the
  running project can still decrypt.
- **Rate limits** on every mutation that fans out to push or email
  (invites, joins, nudges, notifications).
- **Edge Functions:**
  - `generate-report` and `group-report` build PDF and Excel statements with
    the caller's own JWT, so RLS still applies.
  - `send-invite` sends invite emails.
  - `delete-account` deletes the caller's account.
  - `notify-user` handles push and email fan-out.
  - `send-reminders` is called by cron.

  The two that database triggers or cron call authenticate with a shared
  secret held in Vault.
- **pg_cron jobs** book recurring rules, send payment reminders and the
  weekly digest, and purge expired invites and old rate-limit rows.

**Realtime and offline.**
- Screens subscribe to `postgres_changes` through one `useLiveRefetch`
  primitive. It debounces the refetch and catches up after a reconnect and
  when the tab becomes visible.
- The custom Workbox service worker precaches the app shell. It serves an
  allowlist of read-only RPCs network-first, cached per user, so the app
  opens offline with your last data.
- A new deploy reloads the app on its own once you're not typing or inside
  a dialog.

---

## Security highlights

- Per-user data isolation through RLS, verified by rolled-back DB tests.
- Encryption at rest with a key in Vault, and no direct writes to encrypted
  columns, so the database can't be used as a decryption oracle.
- No secrets in the repo. Client config is injected at build time. Server
  secrets (encryption keys, cron secret, VAPID keys, project URL) live in
  Supabase Vault or function secrets.
- Invite emails are built server-side from the token, and all HTML in emails
  and reports is escaped. Push endpoints are restricted to known browser push
  services.
- HTTP security headers are set in `vercel.json`: HSTS, `nosniff`,
  `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`, and a
  Content-Security-Policy that is enforced: scripts, styles, fonts and
  workers only from our own origin (plus `blob:` workers and WebAssembly for
  the OCR engine), connections only to Supabase and the exchange-rate API,
  and images from our origin, Supabase Storage and Google profile pictures.
- Receipt OCR runs on the device, and its engine is served from our own
  origin, not a CDN.
- `package-lock.json` is committed, and CI's `npm audit --omit=dev
  --audit-level=high` fails the build on any high or critical advisory in a
  production dependency.

---

## Testing

| Layer | How | What |
| --- | --- | --- |
| Unit | `npm test` (Node's built-in `node:test`, no framework) | Every pure module: split maths, currency and FX, dates, budgets, recurring, import parsing, backup validation and crypto, offline cache rules, edge-function shared helpers |
| Time zones | `npm test` runs the unit suite in UTC **and** `Europe/Brussels` | Catches local-vs-UTC date bugs that only show up east of UTC |
| Database | `supabase/tests/db_tests.sql` | RLS isolation, definer functions, triggers, rate limits and encryption guards. Each test creates its own throwaway users in a subtransaction and rolls back, so it's safe on a live project. It must end with `ALL DATABASE TESTS PASSED` |
| Lint | `npm run lint` (ESLint 9 flat config) | React, hooks, a11y, unused imports, and the `shared/` → `features/` import ban |
| CI | `.github/workflows/test.yml` | `test` job: `npm ci` → `npm test` (both time zones) → lint → build → `npm audit --omit=dev --audit-level=high` (blocking). `functions` job: `deno lint` over `supabase/functions` |
| Manual | [`docs/TESTING.md`](docs/TESTING.md) | End-to-end checklist for flows that need a browser and two accounts |

---

## Local setup

Requirements: Node 22 and a Supabase project (the free tier is enough).

```bash
npm ci
cp .env.example .env.local   # fill in your TEST project's URL + anon key
npm run dev
```

Environment variables (build-time, public by design):

| Variable | Purpose |
| --- | --- |
| `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` | Supabase project URL and anon (publishable) key |
| `VITE_SUPABASE_URL_DEV` / `VITE_SUPABASE_ANON_KEY_DEV` | The same for the DEV Vercel environment. The client uses whichever pair is set |

The anon key is safe in the browser because RLS protects the data. Never put
the service-role key in a `VITE_` variable.

Scripts: `npm run dev` · `npm test` · `npm run lint` (strict: warnings fail
too) · `npm run build` · `npm run preview`.

### Back end

1. **Apply the migrations one at a time, in order.** Run each file in
   `supabase/migrations/` (for example with the Supabase MCP `apply_migration`
   under its `NNNN_name`, or in the SQL editor), then check that it's recorded
   before moving to the next.
   **Don't use `supabase db push`:** the hosted projects' migration history
   uses timestamp versions, so a push would try to re-apply everything.
2. **Create the Vault secrets** the migrations read: `app_enc_key`,
   `payment_enc_key`, `project_url`, `reminder_cron_secret`, and the VAPID
   keys used for web push.
3. **Deploy the Edge Functions right after the migrations,** because the
   functions and the schema change together. Use the `verify_jwt` settings in
   `supabase/config.toml`: on for the user-called functions (`generate-report`,
   `send-invite`, `group-report`, `delete-account`, `privacy-request`), off for
   `notify-user`, `send-reminders`, `purge-inactive`, `privacy-emails` and
   `operator-digest`,
   which are called by cron or database webhooks and check the `x-cron-secret`
   header instead.
   Function secrets (set per project):

   | Secret | Read by | Purpose |
   | --- | --- | --- |
   | `RESEND_API_KEY` | `_shared/sendEmail.ts` | Resend API key. Without it, email is dormant |
   | `INVITE_FROM` | `_shared/sendEmail.ts` | Sender for `send-invite` and `notify-user` emails. The default is Resend's test sender, which only delivers to the Resend account owner |
   | `NOTICE_FROM` | `_shared/sendEmail.ts` | Sender for `privacy-emails` and `purge-inactive` notices (default `privacy@budgeer.com`) |
   | `PRIVACY_INBOX` | `_shared/sendEmail.ts` | Where `privacy-request` forwards requests (default `privacy@budgeer.com`) |
   | `APP_ORIGIN` | `_shared/http.ts`, `_shared/sendEmail.ts` | The site's origin: links in emails, and an allowed CORS origin |
   | `CORS_ORIGINS` | `_shared/http.ts` | Extra allowed CORS origins, comma-separated |
   | `OPERATOR_FROM` | `_shared/sendEmail.ts` | Sender for the operator's sign-up digest (default `Budgeer <no-reply@budgeer.com>`) |

   `SUPABASE_URL`, `SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` are
   also read, but Supabase provides them to every function.

   **Operator sign-up digest (PROD only):** a daily email to the operator
   with yesterday's sign-up count and the account total, no personal data
   (`operator-digest`, migration 0079). It's off until the recipient exists
   in Vault; create it on PROD only, so TEST stays silent:
   `select vault.create_secret('<operator address>', 'operator_signup_email');`
4. **Configure Auth:** enable Email, Google and passkeys. Turn on **Allow
   manual linking** (Settings → Security's "Connect Google" needs it) and add
   `<origin>/settings/security` to the redirect URLs. Leaked-password
   protection stays off by choice.
5. **Run `supabase/tests/db_tests.sql`** against the project and confirm it
   ends with `ALL DATABASE TESTS PASSED`.

There are two projects: TEST (dev.budgeer.com) and PROD (budgeer.com). Every
schema change and function deploy goes to TEST first, is verified there, and
then goes to PROD.

### Deploy

Vercel builds the Vite app (`npm run build` → `dist/`) and serves it with the
SPA rewrite and the headers in `vercel.json`. The `develop` branch
deploys to dev.budgeer.com and `main` deploys to budgeer.com. Installed PWAs
pick up the new build on their own.

`vercel.json` headers apply in order, and when two matching rules set the same
header the later one wins. The first rule puts the security headers on every
path; the rules after it only set `Cache-Control` (hashed `/assets/` are
immutable for a year; `index.html`, SPA routes, the manifest, `sw.js` and
`theme-boot.js` are revalidated on every load) or, on `dev.budgeer.com` only,
`X-Robots-Tag: noindex, nofollow`. `public/robots.txt` and
`public/sitemap.xml` are for the production site.

Vercel deploys a commit without waiting for CI. To hold a production release
until CI is green, add the GitHub `test` check under the Vercel project's
Settings → Deployment Checks.
