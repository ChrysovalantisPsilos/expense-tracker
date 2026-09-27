---
name: release-to-prod
description: Release what's on the development branch to production — release notes, pending database migrations applied to production in order, the full database test suite on production, server-function deploys with their import closure, promotion of the production branch, and a check that the live build is serving. Use only when the owner explicitly asks to release or push to production. Not for pushes to the development branch.
---

# Release to production

A release promotes the development branch as it stands. Dev and production
must behave the same for existing and new users.

**Only with the owner's explicit go for THIS release.** An earlier approval
doesn't carry over. If in doubt, ask once. Pushing to the production branch
without it is never acceptable.

## Start here: the project profile

Read `.claude/project.md` for:
- the environments table: branches, sites, database and hosting projects
- the commands, and the commit identity and hygiene rules
- the release-notes rules
- the migration, test-suite and server-function specifics

Read `CLAUDE.md` for the quality bar. If a fact is missing, find it in the repo
or ask, and record it at the end via `improve-skills`.

## 1. See what's going out

```bash
git fetch origin <prod-branch> <dev-branch>
git log --oneline --no-merges origin/<prod-branch>..origin/<dev-branch>
git diff --stat origin/<prod-branch> origin/<dev-branch> -- <migrations dir> <functions dir>
```

- **Migrations:** every new migration file.
- **Server functions:** every function whose own files changed, plus every
  function that imports changed shared code. Work out the import closure;
  don't guess.
- **Read each migration before applying it.** Anything dev-only must be inert
  in production.

## 2. Release notes

- Write the project's release-notes entry (in every shipped language, if
  there are several), following the profile's rules on ids, dates and format.
- Update any test that pins the newest entry.
- Check the notes visually in the longest language.
- Run the checks, commit, and push to the development branch first.

## 3. Database: production migrations, in order

- **Compare** the migrations applied in production with the files from step 1.
- **Apply each pending one** using its exact file contents, in ascending
  order, one per call. Never edit a migration to make it fit.
- **If one fails,** stop and tell the owner. Don't improvise fixes in
  production.

## 4. Database: the full test suite in production

- Run it only if it's rolled back and safe on live data; the profile says
  whether it is. It must pass completely.
- **If it's too big for one call,** split it at test boundaries and capture
  the results in a temp log. Keep the chunks outside the repo.
- **This suits a helper** (`delegate-and-review`). Tell it to run nothing else
  on the production project.
- **Any failure blocks the release.** Report the failing lines verbatim.

## 5. Server functions

- **Deploy** each affected function to production, and to the test
  environment if it's behind.
- **What to upload:** the full import closure, with exact contents, in the
  file layout the platform expects. Check the current deployed layout first.
- **Auth settings:** keep them as the repo's config says.
- **Smoke test each one:** the preflight response, the unauthenticated
  response, and that the new version is active.
- **Secrets:** never print them.

## 6. Promote the code

Only when steps 2–5 are all clean:

```bash
git fetch origin <prod-branch> <dev-branch>
git merge-base --is-ancestor origin/<prod-branch> origin/<dev-branch> && echo FF-OK
# the profile's commit-hygiene grep on origin/<prod-branch>..origin/<dev-branch>
git push origin origin/<dev-branch>:<prod-branch>
```

- **Not a fast-forward?** The production branch has something the development
  branch lacks. Merge it into development, re-run the checks, then promote.

## 7. Check it's live

- **Hosting:** wait for the production deployment to reach ready on the
  hosting platform.
- **Bundle:** confirm the site serves the new bundle (the asset hash changes)
  and that it contains the new release-notes id. Wait on the change; don't
  sleep blindly.

## 8. Report, then improve

- **Report in a few plain lines:**
  - what went out
  - the migrations applied
  - the production test count
  - the functions deployed, with versions
  - the branch sha and that it's live
  - anything left for the owner
- **Run `improve-skills`.**
