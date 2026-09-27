---
name: ship-feature
description: Take a Budgeer feature or fix from request to dev.budgeer.com — design renders first when the look is undecided, then the by-feature code, pure maths with unit tests, English + Greek strings, a migration with its db_tests assertion applied to TEST, backup/privacy/landscape follow-ups, the full checks, and a commit pushed to develop. Use for any new feature, feature change or bug fix in this repo. Not for PROD releases (that is a separate "push to PROD" step).
---

# Ship a feature to dev

Budgeer ships in two steps: **develop → dev.budgeer.com** (this skill), then a
separate PROD release when the owner says so. This skill ends with the change
live on dev and the owner told what to look at. CLAUDE.md's seven-point quality
bar is the acceptance test for every step below.

## 0. Before writing code

- **Design undecided? Show renders first.** When the look or flow isn't settled
  (a new screen, a new layout, "come up with designs"), follow the
  `design-renders` skill: prototypes in a scratch copy with fake data,
  options A/B/C with a recommendation, and every screenshot checked before
  sending. Build for real only once the owner has picked.
- **Ambiguous product decisions go to the owner** as a short multiple-choice
  question with a recommendation. Examples: what a number means, what "apply"
  changes, where an entry point lives. Don't guess on money semantics.
- **Find the feature's home** from CLAUDE.md's architecture map. New behaviour
  goes in `src/features/<feature>/`, or in `src/shared/` if two or more
  features need it. `shared/` never imports from `features/`.
- **Look for an existing helper before writing logic.** Candidates:
  - `currency.js`, `dates.js`, `moneyParse.js`, `paginate.js`, `txnRollup.js`,
    `spread.js`, `ruleFx.js`, `categoryName.js`
  - the kit in `src/shared/ui/kit/`
  - `_shared/` for edge-function parity

## 1. Build it

- **Layers:**
  - A component (`*.jsx`) never calls Supabase. Data access goes in the
    feature's data module (`*.js`) or `shared/lib/db.js`.
  - Pure maths goes in its own `*Math.js` module. It returns data or i18n
    keys, never translated text.
- **Live data:** use `useLiveRefetch` (realtime first, with a debounced
  refetch and catch-up on reconnect). No polling.
- **Money:** amounts are integer minor units. Zero-decimal currencies
  (JPY/KRW/VND/CLP) have no fraction. Other currencies use the captured
  `exchange_rate`, or today's rate where the feature already does, e.g.
  recurring totals via `ruleFx`.
- **Dates:** YYYY-MM-DD strings in the local calendar through `dates.js`,
  never `toISOString()` for a date.
- **Browser storage:** every key goes in `STORAGE_KEYS` (`shared/lib/keys.js`)
  AND in the Privacy Notice's "Storage on your device" list.
  `test/storageKeys.test.js` checks both.
- **UI:**
  - Use the kit components and theme tokens; no raw colours.
  - Tap targets are ≥ 44px.
  - Support dark mode, and check phones held sideways (landscape ≤ 500px
    tall, see `shortLandscape.js`).
  - Don't use `dangerouslySetInnerHTML`.

## 2. Strings: English AND Greek, together

- Every word a person reads comes from a key. `react/jsx-no-literals` enforces
  this for JSX. Props (`aria-label`, `title`, `placeholder`) and toasts need a
  manual check.
- Add each key to `src/locales/en/<ns>.js` and `src/locales/el/<ns>.js` in the
  same change. `test/i18n.test.js` fails on missing keys, placeholders, tags or
  plural forms. See `docs/I18N.md`.
- Greek follows `docs/i18n-glossary-el.md`, the owner's rules:
  - informal «σου», never «σας»
  - «Μοιράσου», never «Μοίρασε»; avoid «μοιρασιά»
  - sentence case («Προσπάθησε ξανά»)
  - short, natural phrasing
  - a budget cap is «όριο»; a group owner is «Διαχειριστής»
- Greek runs 20–30% longer. Screenshot the changed screens in Greek at 390px
  and fix clipped buttons, tabs and chips.

## 3. Database changes (skip if none)

- **Migration:** add a new `supabase/migrations/NNNN_<name>.sql` with the next
  free number. Migrations are append-only; never edit an applied one.
- **Header comment:** start the file with a comment saying what the migration
  does and why, like the existing ones.
- **Security bar** (CLAUDE.md #5–#6):
  - RLS on every user table, with policies per verb
    (select/insert/update/delete); never `FOR ALL`.
  - Ownership and server-authoritative columns (`user_id`, `created_by`,
    derived keys) are forced by a BEFORE trigger. Never trust the client.
  - Every SECURITY DEFINER function: `set search_path = public, pg_temp`,
    plus `revoke execute … from public, anon, authenticated`, unless it's
    deliberately callable.
  - Money and personal text are encrypted like their neighbours (`*_enc` +
    `app_enc_key()`); read them through the decrypting `my_*` functions.
  - Anything that fans out (push or email) is rate-limited.
- **Existing accounts get the feature too:** backfill existing rows in the
  migration, so dev and PROD behave identically for old and new accounts.
- **db_tests:** add a rolled-back assertion block to
  `supabase/tests/db_tests.sql` in the same change.
  - Copy an existing block's shape: throwaway `pg_temp.zz_user(...)`, act as
    `authenticated`, check, `raise exception 'ROLLBACK_OK'`, then PASS/FAIL
    via `_t`.
  - Number it next in sequence and bump `expected_tests` in the summary.
  - Test the attack paths as well as the happy path: another user's rows, a
    client writing a server-owned column, anon access.
- **Apply to TEST** (`ctvdljzybbujuywppixo`) with `apply_migration`, using the
  file's exact contents. PROD waits for the release.
- **Run the whole db_tests suite on TEST.** It must end with
  `ALL DATABASE TESTS PASSED (N tests)`.
  - The file is too big for one `execute_sql` call, so split it into chunks
    at the `-- ---` test headers.
  - Turn `raise notice` into inserts into a temp log table, and read passes
    and fails back.
  - Write the chunks to the scratchpad, never into the repo.
- **Edge functions:** if you change one, or a `_shared/` file it imports,
  deploy it to TEST with every file in its import closure, and keep
  `verify_jwt` as in `supabase/config.toml`. Note it for the PROD release.

## 4. Follow-ups a feature usually needs

- **Backup and restore:** new user data must round-trip through
  `features/backup/` (`backup.js`, `backupMath.js`, with a test in
  `test/backupMath.test.js`). The owner expects backups to cover every
  feature. On restore, server-owned values are hints to re-derive, never to
  trust.
- **GDPR:** new personal data, a new processor or a new storage key goes in
  `docs/GDPR.md` and the Privacy Notice. Check that `export_my_data()` covers
  new tables, and that account deletion covers them.
  - Don't bump the legal document version for a non-material wording edit.
  - Never remove the signup consent checkbox.
- **Docs:** update CLAUDE.md's architecture map when a feature gains a new
  home or pure module, and `docs/TESTING.md`'s feature inventory and manual
  plan.
- **Demo account** (dev only, reset nightly by `demo_seed` in 0090): if the
  feature needs demo data or must be refused for a shared login, say so. Any
  change to the seed is a migration.

## 5. Checks before committing

Run these from the repo root and fix everything:

```bash
npm test          # node --test, run in UTC, Europe/Brussels and America/Los_Angeles
npm run lint      # --max-warnings=0: a warning fails
npm run build
```

- **Every behaviour is tested:** pure logic in a `test/*.test.js`,
  security-relevant DB behaviour in `db_tests.sql`. A feature without a test
  is unfinished.
- **No dead code:** no unused exports, orphan files or leftover prototype
  routes.
- **Check it running:** start `npm run dev` (or use the screenshot harness)
  and use the feature in English and Greek, light and dark, on a phone, a
  sideways phone and desktop.
- **Re-read your own diff adversarially** before committing.

## 6. Commit and push to develop

- **Identity:** commit as the owner, with the env vars
  `GIT_AUTHOR_NAME/GIT_COMMITTER_NAME="Chrysovalantis Psilos"` and
  `GIT_AUTHOR_EMAIL/GIT_COMMITTER_EMAIL=chrysovalantis.psilos@outlook.com`.
- **Message:** a short subject in plain words ("Import rules: 15 per page"),
  then a body explaining what changed and why.
- **Never mention AI** in commits, code or docs: no Claude, agent, assistant
  or AI, and no Co-Authored-By or session trailers. Before pushing, grep:

  ```bash
  git log origin/develop..HEAD --format=%B | grep -iE "claude|co-authored|assistant|\bagent\b"
  ```

  The only allowed hit is the file name `CLAUDE.md` in a merge's conflict
  list.
- **No real data:** never commit real CSVs, names, IBANs, card numbers or
  secrets. Fixtures use fake data. Keys live in GitHub secrets or Supabase
  Vault only.
- **Sync, then push:** `git fetch origin develop`, merge it (resolve by
  keeping both sides and renumbering tests if needed), re-run the checks, then
  `git push origin develop`. Vercel deploys dev.budgeer.com.
  - Each push to develop makes open dev apps reload within a minute
    (`AutoUpdate.jsx`). Batch small pushes when the owner is testing.
- **Never push to `main`.** That's the PROD release (the `release-to-prod`
  skill), and only with the owner's explicit go.

## 7. Report to the owner

- Keep it short and plain:
  - what changed, where to see it on dev.budgeer.com, and screenshots for
    anything visual
  - the test/lint/build results and the db_tests count on TEST
  - anything the PROD release will need: migrations in order, edge functions
    to deploy, a What's new entry in EN + EL
- Don't add a What's new entry for dev-only pushes. It's written at release
  time, and every PROD release gets one (ids are unique `YYYY-MM-DD`).
