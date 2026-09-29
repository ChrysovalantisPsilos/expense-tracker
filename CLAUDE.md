# Budgeer — AI Guide

Workflow facts (environments, commands, commit rules, release steps, brand)
live in `.claude/project.md`; the process skills are in `.claude/skills/`
(start with `choose-skill` to pick the right one).

Budgeer is a financial **PWA**: personal expense/income tracker + friend
bill-splitter. React + Vite + Chakra UI on the client; Supabase (Postgres +
RLS + SECURITY DEFINER functions + Edge Functions + Auth + Realtime) on the
back end. Money is stored as **integer minor units**; multi-currency uses a
captured `exchange_rate` and zero-decimal currencies (JPY/KRW/VND/CLP) carry
no fractional part.

## Standing quality bar (do not regress)

Every change must keep all seven true. Treat them as acceptance criteria, not
aspirations — if a change would break one, fix the cause, don't paper over it.

1. **Maintainable structure.** By-feature layout (below). New behavior lands in
   the feature it belongs to, or in `shared/` if two+ features need it.
2. **Separation of concerns.** UI never talks to Supabase directly — data
   access lives in a feature's `*.js` data module (or `shared/lib`). Pure math
   lives in its own tested module (`splitMath`, `importMath`, `recurringMath`,
   `currency`, …), never inline in a component. `shared/` must **never** import
   from `features/` (wrong dependency direction).
3. **No code duplication.** Before copying logic, look for an existing helper.
   Client↔edge-function parity (CORS/auth/money/email) is factored into
   `supabase/functions/_shared/`. JS↔SQL "preview vs authoritative" pairs
   (e.g. split math) are the one intentional exception — keep them in lockstep.
4. **Every feature is tested.** Pure logic → a `test/*.test.js` unit test
   (`node --test`). Security-relevant DB behavior (RLS, definer functions,
   triggers) → a rolled-back assertion in `supabase/tests/db_tests.sql`. Adding
   a feature without a test is incomplete work — write the test.
5. **Cyber-security proof.** No secrets in tracked files (keys are injected at
   runtime / stored in Supabase Vault). Escape all HTML in emails/reports.
   Every SECURITY DEFINER function pins `search_path` and revokes EXECUTE from
   `anon`/`authenticated` unless deliberately callable. No `dangerouslySetInnerHTML`.
6. **No unsafe RLS.** RLS on every user table. Write policies are split per-verb
   (select/insert/update/delete), not a blanket `FOR ALL`. Server-authoritative
   columns (`created_by`, ownership) are forced by a BEFORE trigger, never
   trusted from the client. Mutations that fan out (push/email) are rate-limited.
7. **No dead code.** No unused imports, unreferenced exports, or orphan files.

## Architecture map

| Concern | Where |
| --- | --- |
| App shell, routing, providers | `src/app/`, `src/main.jsx` (zero data access) |
| Cross-feature utilities | `src/shared/lib/` (data: `db.js`, `supabase.js`, `realtime.js`, `fx.js`, `profile.js`, `push.js`, `transactions.js` (transaction reads/writes, `useOldestTransactionDate`), `categories.js` (all category reads/writes, `useSavingsIds`), `accounts.js` (net-worth accounts); pure: `currency.js` (incl. `formatSigned`, `keptRate`/`effectiveRate`), `dates.js`, `periods.js` (month/year/all-time periods), `categoryLinks.js` (category page URLs), `moneyParse.js`, `paginate.js`, `offlineReads.js`, `txnRollup.js`, `spread.js`, `ruleFx.js`, `salaryShift.js`, `environment.js`, `localeParse.js`, `queryCache.js`, `shortLandscape.js`, `themePref.js`, `categoryName.js` (display name, `entryName`, `NO_CATEGORY`, `presetCategoryId`); browser: `clipboard.js`) |
| Cross-feature UI | `src/shared/ui/` (design-system kit in `src/shared/ui/kit/`; `ShellHeader.jsx` = the sideways header's slots that `PageHeader`/`PageForm` fill; `SettingsSubPage.jsx` = the shell of every Settings sub-page; `ConfirmDialog.jsx` = every confirm modal (`DeleteTransactionDialog.jsx` builds on it); `CurrencySelect.jsx` = every currency dropdown) |
| Sideways phones (landscape ≤ 500px tall) | `shortLandscape.js` (query, shell measurements, `landscapeOnly`, `NARROW_STACK`) + `useShortLandscape`; the rail and header live in `AppShell.jsx`; Home's stacks in `dashboardMath.homeStacks`, Savings' in `savingsMath.savingsStacks`; `shared/ui/narrowStacks.js` folds a stack's rows on the narrowest screens |
| Add a group expense from Add ("Who's it for?") | `TransactionPage.jsx` swaps in `GroupExpenseForm`'s `quick` layout; `groups/WhoForChips.jsx` (chips), `groups/myGroups.js` (the viewer's groups + recently used, `STORAGE_KEYS.recentGroups`), pure rules in `groups/quickAddMath.js` (`test/quickAdd.test.js`) |
| Plan mode (sandbox over recurring payments/income, `/plan`) | `src/features/plan/`: `Plan.jsx` + `PlanParts`/`PlanEditors` (inline editors: a row, "What if I add…", a change, the overlap picker; one open at a time)/`PlanSheets` (the Apply sheet)/`PlanBanners`, data in `plan.js` (one encrypted plan per account, apply/undo RPCs from 0095, salary edit kept by 0096), pure maths in `planMath.js` (`test/planMath.test.js`; also the derived Salary row from salary entries, plan-only `salary` edits, and the payments view when there is no recurring income), the ideas' service catalogue and essentials in `planCatalog.js` (same test file); DB tests 93–97 |
| Meal vouchers (a card topped up per working day, `/vouchers`, Settings → Meal vouchers) | `src/features/vouchers/`: `Vouchers.jsx` (the card, next top-up with Fix days, history), `VoucherCard.jsx` (Home), `VoucherSetup.jsx`, data in `vouchers.js` (one encrypted setup per account, 0097), pure maths in `voucherMath.js` (BE/GR public holidays, working days, top-ups, balance; `test/voucherMath.test.js`); expenses carry `paid_with_vouchers` (the `expense-from-vouchers` effect in `_shared/savings.ts`: spending, not against the net); "Paid from" on Add is `shared/ui/SavingsSwitches.PaidFromChoice`; DB tests 98–100 |
| Translations (i18n) | engine + `useT`/`t`/`<Trans>` in `src/shared/lib/i18n/`, dictionaries per namespace in `src/locales/{en,el}/`, conventions in `docs/I18N.md`, Greek terms in `docs/i18n-glossary-el.md`, parity test `test/i18n.test.js` |
| Auth context | `src/shared/auth/` |
| Features | `src/features/{auth,backup,budgets,categories,dashboard,groups,help,import,insights,landing,notifications,onboarding,plan,privacy,recurring,savings,settings,transactions,whatsnew}/` |
| DB schema & policies | `supabase/migrations/NNNN_*.sql` (append-only, ordered) |
| Server logic | `supabase/functions/*` (+ shared code in `functions/_shared/`) |
| DB config (JWT verify per function) | `supabase/config.toml` |
| Service worker (precache, offline reads, push) | `src/sw.js` |
| Public status page (Cloudflare Worker + D1, own deploy) | `status/` (pure logic in `status/src/{state,fxCalendar,uptime,validate,html,time,access}.js`, tests `test/status*.test.js`, deploy `.github/workflows/status-deploy.yml`) |
| Lint / CI | `eslint.config.js`, `.github/workflows/test.yml` |

Each feature folder holds its components (`*.jsx`), its data module (`*.js`
wrapping Supabase calls), and its pure math module where applicable.

## Data & realtime conventions

- Read/write owned tables through `shared/lib/db.js` and the feature data hooks;
  don't scatter `supabase.from(...)` across components.
- Live updates use the `useLiveRefetch` pattern (subscribe to `postgres_changes`,
  debounced refetch, catch-up on reconnect + tab-visible). Realtime is primary;
  any polling is only a backstop.
- Two Supabase projects: **TEST/DEV** `ctvdljzybbujuywppixo` (dev.budgeer.com)
  and **PROD** `tuxfpylowcxazinqtrzx` (budgeer.com). Schema changes and function
  deploys must be applied to **both**. Delivery is env-agnostic via Vault
  (`project_url`, `x-cron-secret`).

## Verification (run before declaring done)

- **Unit tests:** `npm test` (node --test over `test/*.test.js`).
- **Lint:** `npm run lint`.
- **DB security tests:** run `supabase/tests/db_tests.sql` against the TEST
  project (rolled-back; safe on live data). It must end with
  `ALL DATABASE TESTS PASSED`.
- **Manual:** `npm run dev`, exercise the changed feature; for schema changes,
  apply the migration to TEST first and verify, then PROD.
- **Release notes:** every production release adds a new entry at the top of `src/features/whatsnew/releases.js` (dated the release day; ids are unique `YYYY-MM-DD`).
- See `docs/TESTING.md` for the full manual plan.

When you change the schema or a policy, add the matching rolled-back assertion
to `db_tests.sql` in the same change — that is how principle #4 stays true for
the back end.
