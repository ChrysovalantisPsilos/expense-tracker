---
name: ship-feature
description: Take a feature, change or bug fix from request to the project's dev/staging environment — settle open decisions, build in the project's structure with tested pure logic, every language the app ships, database changes with security tests applied to the test environment, the usual follow-ups (backups, privacy, docs), full checks, and a clean commit pushed to the development branch. Use for any feature or fix in a project with a dev→prod flow. Not for production releases (see release-to-prod).
---

# Ship a feature to dev

Most projects ship in two steps: the **development branch → the dev/staging
site** (this skill), then a separate production release when the owner says
so. This skill ends with the change live on dev and the owner told what to
look at.

## Start here: the project profile

Read the project's guides before anything else:
- **`.claude/project.md`, the project profile:** environments, branches,
  commands, commit identity, languages, database and deploy details, owner
  preferences.
- **`CLAUDE.md`,** or `AGENTS.md` or a README "Contributing" section: the code
  rules, architecture map and quality bar. Treat that bar as the acceptance
  test for every step.
- **The docs** those two point to (testing, i18n, privacy).

If there's no profile, gather the same facts from the repo (package scripts,
CI config, branch names, migration folders), ask the owner what you can't
find, and create `.claude/project.md` via improve-skills at the end.

## 0. Before writing code

- **Undecided look or flow?** Follow the `design-renders` skill first, and
  build for real only after the owner picks.
- **Ambiguous product decisions** go to the owner as one short
  multiple-choice question at a time, with a recommendation. This covers what
  a number means, what an action really changes, and where an entry point
  lives. Never guess money, privacy or data-loss semantics.
- **Big, or in independent parts?** Use `delegate-and-review` and brief
  helpers with every decision made.
- **Find the feature's home** in the architecture map, and follow the
  project's layering (UI vs data access vs pure logic, dependency direction).
- **Reuse before writing:** search for an existing helper, component or
  shared module. Duplicated logic is a defect.

## 1. Build it

- **Layers:**
  - UI doesn't talk to the database or API directly; data access sits in its
    data module.
  - Pure logic sits in its own module with unit tests. It returns data (or
    translation keys), never display text.
- **The project's live-data pattern:** subscriptions or refetch hooks. Don't
  add ad-hoc polling unless that's the pattern.
- **Money, dates and time zones:** follow the project's conventions (e.g.
  integer minor units, local-calendar date strings). Test across time zones
  when dates are involved.
- **Browser storage:** new keys go in the project's key registry, and in any
  privacy list that must name them.
- **UI:**
  - Use the design-system components and tokens; no raw colours.
  - Tap targets are ≥ 44px, with readable contrast.
  - Support dark mode and every layout the app supports (phone, sideways
    phone, desktop).
  - Never inject raw HTML.

## 2. Strings in every language the app ships

- **No literal user-facing text in the UI:** keys only, and the lint rule
  enforces it where one exists. Check props, toasts and errors by hand.
- **All languages together:** add every key to every language in the same
  change, and let the parity tests guard it.
- **House style:** follow the project's glossary and tone rules in the
  profile.
- **Screenshot the changed screens in the longest language** at phone width,
  and fix clipped buttons, tabs and chips.

## 3. Database or back-end changes (skip if none)

- **Migration:** a new migration with the next free number. Migrations are
  append-only; never edit an applied one. Start it with a header comment
  saying what it does and why.
- **Security bar** (adapt to the stack):
  - Row-level security or an authorisation check on every user table, split
    per verb.
  - Ownership and server-owned columns are forced server-side (triggers or
    handlers), never trusted from the client.
  - Privileged functions pin their search path or scope, and aren't callable
    by anonymous or public roles unless intended.
  - Sensitive data is encrypted like its neighbours.
  - Anything that sends email or push is rate-limited.
- **Existing records get the feature too:** backfill in the migration.
- **Security tests in the same change:** cover the attack paths (another
  user's rows, a client writing a server-owned field, anonymous access) as
  well as the happy path. Update any expected-count guard.
- **Apply to the TEST environment only,** using the exact file contents, then
  run the WHOLE database test suite there. It must pass completely.
- **Server functions:** if one changed, or shared code it imports did, deploy
  it to TEST with its full import closure and unchanged auth settings. Note it
  for the release.

## 4. Follow-ups a feature usually needs

- **Backup and export:** new user data round-trips through backup/restore,
  with a test. On restore, server-owned values are hints to re-derive, never
  to trust.
- **Privacy:** new personal data goes in the privacy docs and notice. The data
  export includes it, and account deletion removes it. Don't bump legal
  versions for non-material edits.
- **Docs:** the architecture map, testing guide and feature inventory.
- **Special accounts:** demo or seed accounts; extend their seed and reset if
  the feature stores data.

## 5. Checks before committing

- Run the project's tests, lint and build (commands in the profile) and fix
  everything. Warnings count if the project says so.
- **Every behaviour has a test:** pure logic in unit tests,
  security-relevant data behaviour in the DB tests.
- **No dead code:** no unused exports, orphan files or leftover prototype
  routes.
- **Use the feature running:** every language, light and dark, every layout.
- **Re-read your own diff adversarially** before committing.

## 6. Commit and push to the development branch

- **Commits:** use the commit identity and message style from the profile.
- **Honour the profile's rules** on AI mentions, trailers and real data, and
  grep the commits before pushing.
- **No secrets or real personal data,** ever. Fixtures are fake.
- **Push:** fetch and merge the development branch (merge, don't rebase
  shared branches), re-run the checks, then push.
- **Never push to the production branch here.** That's `release-to-prod`,
  with the owner's explicit go.

## 7. Report, then improve

- **Report to the owner in plain words:**
  - what changed and where to see it, with screenshots for anything visual
  - the check results, with counts
  - what the production release will need (migrations in order, functions to
    deploy, release notes)
- **Run `improve-skills`:** record what this task taught. Generic lessons go
  into the skills, project facts into `.claude/project.md`.
