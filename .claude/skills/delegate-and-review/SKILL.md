---
name: delegate-and-review
description: Run larger work as a lead — split it, hand self-contained briefs to helper agents (in parallel, each in its own worktree when they change code), relay new decisions to them mid-flight, then personally verify every result (screenshots, tests, lint, build, diff, database checks) before merging, pushing and reporting. Use when a request is big or has independent parts (a feature build, a release, test runs, deploys, design renders), or when the user asks to delegate, use workers, or run things in parallel. Project-agnostic.
---

# Delegate and review

You are the lead. Helpers do the heavy lifting; you own the decisions, the
quality and the final word to the user. A helper's report is a claim, not a
fact, until you've checked it.

## 1. Split the work

Keep for yourself:
- decisions and questions for the user (helpers can't ask the user)
- small edits and quick checks, where writing a brief costs more than doing
  the work
- anything outward-facing or hard to undo:
  - production releases and deploys
  - pushes to shared or protected branches
  - deleting data
  - messages to people

Hand to a helper:
- large builds (a feature, a migration with tests, a translation pass)
- long mechanical runs: test suites in chunks, deploying several functions,
  screenshot sweeps
- exploration that would flood your context with file dumps
- independent parts of one request, one helper per part

Don't delegate half-decided work. Settle the open questions with the user
first, then brief.

## 2. Write a brief that stands alone

A helper has none of your conversation. Every brief includes:
- **Goal:** what done looks like, in one or two sentences.
- **Context and decisions:** every choice the user has made, stated as final,
  in plain terms. Include the numbers, names and wording they approved, and
  point to prior artefacts (design renders, earlier branches).
- **Rules to follow:** the project's own guides first (`.claude/project.md`,
  CLAUDE.md, repo skills, docs), plus the owner's standing rules from the
  profile (commit identity, commit hygiene, fake data only, never print
  secrets). Tell the helper which skill to follow.
- **Boundaries:**
  - where to work (its own worktree or branch) and where not (the main
    checkout, protected branches)
  - which environments it may touch (e.g. TEST only, never PROD)
  - what it must not do: push to main, deploy to production, delete data
- **Tools and paths it will need:** project IDs, harness locations, preinstalled
  binaries, known gotchas ("never run `playwright install`").
- **Deliverable:** the branch name, file locations, and where any output
  (screenshots, logs) goes. Scratch files go outside the repo.
- **Report format:** short, with what was done, the exact check results
  (counts), the file list, anything it couldn't do and why, and follow-ups.

Prefer precise instructions over hopes. "Run the whole suite; it must end
with ALL TESTS PASSED (N)" beats "make sure tests pass".

## Keep usage down

Helpers are the biggest cost: each starts from zero and reads files, images and
results on its own.
- **Delegate only when it pays:** large builds, long runs, or parallel parts.
  A small fix, one deploy or one query is cheaper done directly.
- **Pick the model by the job.** Mechanical work (running test chunks,
  deploying functions, screenshot sweeps, simple lookups) goes to a smaller,
  cheaper model. Keep the strongest model for building, design judgement and
  reviews.
- **Point helpers at files.** Name the exact files, paths and commands in the
  brief so they don't explore.
- **Ask for short reports:** counts and file lists, not pasted output.
- **Don't duplicate:** don't re-run a helper's whole job to verify it.
  Spot-check what matters (the tests, the diff, the key screenshots) and run
  full checks once, on the merged result.

## 3. Launch

- Run independent helpers in parallel, in one message. Run dependent steps
  in order.
- Give a helper that changes code its own worktree and branch, so helpers
  never collide with each other or with you.
- Run helpers in the background and keep working. Don't poll or sleep; you're
  notified when each finishes.
- Never start two helpers on the same thing, and don't redo a running
  helper's work yourself.
- Tell the user in a line or two what's running and what they'll get.

## 4. While they run

- When the user adds or changes a decision, send it to the affected helper
  right away (SendMessage). Say what it replaces.
- A finished helper can be resumed with a follow-up message and keeps its
  context. Use that for revisions instead of starting fresh.
- **Helpers stop when your session restarts** and can't be resumed. After a
  restart, check each helper's worktree, commit its work in progress to its
  own branch (never the integration branch) so it isn't lost, then restart
  from that branch. A separate cloud session, if available, suits long
  builds: it survives your session, but it doesn't report back, so schedule
  a check-in.
- Answer the user's other questions in the meantime. Never report a helper's
  result before it arrives.

## 5. Review everything before it counts

Treat each report as unverified. At minimum:
- **Visual work:** open every screenshot yourself. Look for clipped or
  overflowing text (translations run longer), overlap, sideways scroll,
  numbers that don't add up, and anything that differs from what the user
  approved.
- **Code:**
  - fetch the branch and read the diff adversarially
  - check it against the project's quality bar and the brief's decisions
  - re-run the tests, lint and build yourself on the merged result
- **Database and back end:**
  - re-check what the helper claims was applied (list migrations or
    functions)
  - run the security or DB test suite, or confirm its pass count
  - confirm nothing touched environments it shouldn't have
- **Hygiene:** grep commits for forbidden mentions and trailers. Check the
  commit identity, and that no secrets, real personal data or scratch files
  were committed.
- **Scope:** the helper did what was asked, not more.

When something is wrong, fix a small issue yourself; send anything bigger back
to the same helper with specifics. Don't pass along work you haven't checked.

## 6. Merge, ship, report

- Merge into the integration branch, resolving conflicts by keeping both
  sides' intent. Re-run the checks after the merge, then push.
- Production steps need the user's explicit go for this release; earlier
  approval doesn't carry over. With it, follow the project's release guide.
- Report to the user in plain words:
  - what changed, and where to see it
  - screenshots for anything visual
  - the check results, with counts
  - what's still pending or needs their decision
  - anything that didn't go to plan, stated plainly

Don't narrate the internal choreography. Keep it to results.

## 7. Improve

Run `improve-skills`. Brief gaps you found (something a helper needed but
wasn't told) and checks that caught real problems go into this skill. Project
facts go into `.claude/project.md`.
