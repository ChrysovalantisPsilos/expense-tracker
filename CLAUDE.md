# Budgeer — AI Guide

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
| Cross-feature utilities | `src/shared/lib/` (data: `db.js`, `supabase.js`, `realtime.js`, `fx.js`, `profile.js`, `push.js`; pure: `currency.js`, `dates.js`, `moneyParse.js`, `paginate.js`, `offlineReads.js`, `txnRollup.js`, `spread.js`) |
| Cross-feature UI | `src/shared/ui/` (design-system kit in `src/shared/ui/kit/`) |
| Auth context | `src/shared/auth/` |
| Features | `src/features/{auth,backup,budgets,categories,dashboard,groups,import,insights,landing,notifications,onboarding,privacy,recurring,settings,transactions}/` |
| DB schema & policies | `supabase/migrations/NNNN_*.sql` (append-only, ordered) |
| Server logic | `supabase/functions/*` (+ shared code in `functions/_shared/`) |
| DB config (JWT verify per function) | `supabase/config.toml` |
| Service worker (precache, offline reads, push) | `src/sw.js` |
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
- See `docs/TESTING.md` for the full manual plan.

When you change the schema or a policy, add the matching rolled-back assertion
to `db_tests.sql` in the same change — that is how principle #4 stays true for
the back end.
