---
name: release-to-prod
description: Release what's on develop to budgeer.com (PROD) — What's new entry in EN + EL, pending migrations applied to the PROD Supabase project in order, the full db_tests suite on PROD, edge-function deploys with their import closure, fast-forward main, and a check that the live build is serving. Use only when the owner explicitly asks to push/release to PROD ("push to prod", "release", "go"). Not for pushes to develop.
---

# Release to PROD

PROD is budgeer.com: branch `main` and Supabase project `tuxfpylowcxazinqtrzx`.
TEST/dev is dev.budgeer.com: branch `develop` and project
`ctvdljzybbujuywppixo`. A release promotes develop as it stands. Dev and PROD
must behave identically for existing and new accounts.

**Only with the owner's explicit go.** A push to `main` needs a clear "push to
PROD" / "go" from the owner in this conversation. Earlier approval doesn't
carry over to a new release. If in doubt, ask once.

## 1. See what's going out

```bash
git fetch origin main develop
git log --oneline --no-merges origin/main..origin/develop
git diff --stat origin/main origin/develop -- supabase/migrations supabase/functions
```

- **Migrations:** every new `supabase/migrations/NNNN_*.sql` in that diff.
- **Edge functions:** every function whose own files changed, plus every
  function that imports a changed `supabase/functions/_shared/*.ts`.
  Work out the import closure per function; don't guess.
- **Read each migration before applying it.** Anything dev-only must be inert
  on PROD. For example, 0090's demo account creates no account or data on
  PROD.

## 2. What's new entry (every release)

- Add a new entry at the TOP of `src/features/whatsnew/releases.js`. Its `id`
  and `date` are the release day, as `YYYY-MM-DD`.
  - Ids must be unique, and `profiles_whats_new_seen_check` only accepts a
    plain date.
  - If today's id is already taken by an earlier release, use the next day.
    Reusing an id hides the new story from everyone who saw the earlier one.
- **Pages:** 1–5, one change each, with 1–2 chips each; `action: { to }` only
  for in-app pages.
- **Words:** in BOTH `src/locales/en/whatsnew.js` and
  `src/locales/el/whatsnew.js`, under `releases.<id>.<page>`. The Greek
  follows `docs/i18n-glossary-el.md`.
- **Tests:** `test/whatsNew.test.js` pins the newest release ("this release")
  by id. Update that test for the new entry, and keep the previous release's
  test by looking it up by id.
- **Screenshots:** check every page in Greek at 390px. Chips are one line, so
  long Greek words overflow; shorten them.
- **Before committing:** run `npm test`, `npm run lint` and `npm run build`.
  Then commit (see "Identity" below) and push to develop first.

## 3. Database: PROD migrations, in order

- **Check what's already applied:** `list_migrations` on
  `tuxfpylowcxazinqtrzx`, compared with the files from step 1.
- **Apply each pending migration** with `apply_migration`. Use the file's
  exact contents, the file name as the migration name, and ascending numbers,
  one per call. Never edit a migration to make it fit.
- **If one fails,** stop and tell the owner. Don't improvise a fix on PROD.

## 4. Database: the full test suite on PROD

`supabase/tests/db_tests.sql` is rolled back (every test raises `ROLLBACK_OK`
inside its own block), so it's safe on live data. It must pass `expected_tests`
of `expected_tests` with 0 fails.

- **Split it into chunks** (~10) at the `-- ---` test headers, keeping the
  prelude with each chunk.
- **Capture the results:** turn each `raise notice` into an insert into a temp
  `_log` table, and end each chunk with a select of passes, fails and FAIL
  lines.
- **Where the chunks go:** write them to the scratchpad, never into the repo.
- **Running them:** run each chunk's exact contents with `execute_sql`. This is
  a good job for a helper; tell it to run nothing else on the project.
- **Any failure blocks the release.** Report the FAIL lines verbatim.

## 5. Edge functions

- **Deploy targets:** deploy each affected function from step 1 to PROD with
  `deploy_edge_function`, and to TEST if TEST doesn't have it yet.
  - For a `_shared` change, deploy both, since TEST's fallback paths run it
    too.
  - `get_edge_function` shows what TEST is running.
- **File layout:**
  1. Check the current layout first with `get_edge_function`.
  2. Upload `index.ts` plus `../_shared/<file>.ts` with entrypoint `index.ts`,
     so the stored layout is `source/index.ts` plus `_shared/*`.
  3. Upload function-local files by bare name.
- **Contents:** include every file in the function's relative-import closure,
  with exact contents.
- **JWT verification:** keep `verify_jwt` as in `supabase/config.toml`. The
  user-called functions (`generate-report`, `group-report`, `send-invite`,
  `delete-account`, `privacy-request`) keep it `true`. The cron/webhook ones
  keep it `false`.
- **Smoke test** each deployed function:
  - `OPTIONS` → 200 with the CORS header
  - `POST` without a JWT → 401
  - the new version is ACTIVE
- **Secrets:** never print them. They live in Supabase Vault and GitHub
  secrets only.

## 6. Promote the code

Only when steps 2–5 are all clean:

```bash
git fetch origin main develop
git merge-base --is-ancestor origin/main origin/develop && echo FF-OK   # must be a fast-forward
git log origin/main..origin/develop --format=%B | grep -iE "claude|co-authored|assistant"   # only CLAUDE.md file-name hits are OK
git push origin origin/develop:main
```

- **Not a fast-forward?** Stop. It means `main` has a hotfix that develop
  lacks. Merge `main` into develop first, re-run the checks, then promote.
- **Identity:** every commit is by
  `Chrysovalantis Psilos <chrysovalantis.psilos@outlook.com>` (set the
  GIT_AUTHOR_* and GIT_COMMITTER_* env vars). No AI mentions, and no
  Co-Authored-By or session trailers.

## 7. Check it's live

- **Deploy status:** Vercel builds `main` for production. Wait for the
  deployment to reach READY (Vercel MCP `list_deployments`, target
  production).
- **Bundle check:** confirm budgeer.com serves the new bundle. The
  `assets/index-*.js` name in the HTML changes; wait for the change rather
  than sleeping blindly. The new What's new id should appear in the new
  bundle.
- **Open apps reload themselves** within a minute of a deploy
  (`AutoUpdate.jsx`). That's expected.

## 8. Report

Report in a few plain lines:
- what went out: the What's new pages
- the migrations applied
- the db_tests count on PROD
- the functions deployed, with version numbers
- `main` at `<sha>` and live
- anything left for the owner, e.g. approving wording, or removing a fallback
  in a later release
