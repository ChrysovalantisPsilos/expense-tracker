---
name: improve-skills
description: Capture what a finished task taught and fold it back into the skills — generic, reusable lessons go into the generic skills (choose-skill, ship-feature, release-to-prod, design-renders, brand-designs, delegate-and-review, and this one); project-specific facts go into that project's .claude/project.md profile. Run at the end of every task done with one of those skills, when the owner corrects how something should be done, or when asked to "improve the skills" or "learn from this project".
---

# Improve the skills

The skills say **how** to work anywhere; each project's `.claude/project.md`
says **what's true** in that project. After every task, move what you learned
to the right one, so the next task, in this project or another, starts
smarter.

## 1. Collect the lessons

Look back over the task and list what's worth keeping:
- **Corrections from the owner:** "don't do X", "always Y", a wording or
  design rule, a preference about replies.
- **Mistakes you made and their fix:** a wrong assumption, a missed
  follow-up, a check that would have caught it.
- **Things that worked better than the skill said:** a faster way, a better
  order, a useful check.
- **Facts you had to discover:** an ID, a path, a command, a gotcha, where
  something lives.
- **Gaps:** a step the skill lacked, or a situation it didn't cover.

Keep only what's verified in this task. Drop guesses and one-off trivia.

## 2. Sort each lesson

Ask: would this help in a different project?
- **Yes, a generic lesson:** e.g. "check release-notes ids against earlier
  releases the same day", "longer translations overflow chips; check the
  longest language", "a helper's report is unverified until you check it".
  It goes in the skill whose step it improves. Phrase it without project
  names, IDs or paths.
- **No, a project fact:** e.g. a project ID, branch name, commit identity,
  glossary rule, harness path, the owner's taste. It goes in
  `.claude/project.md`, in the matching section. Create the file if it's
  missing, starting from the section headings the skills read: product and
  people, environments, commands, git, languages, database, server functions,
  release notes, screenshots and renders, brand, follow-ups.
- **A rule about the codebase itself** (architecture, quality bar) belongs in
  the project's `CLAUDE.md`, if the owner keeps one. Edit it only when the
  lesson is clearly a code rule.

## 3. Edit, don't pile up

- **Edit the step the lesson belongs to,** rewriting it if needed. Don't
  append a "lessons" list at the end.
- **Merge duplicates.** If two projects disagree, write the rule as a
  condition: "if the project…, then…".
- **Keep each skill short.** Remove anything the new wording replaces. A
  skill that grows every time stops being read.
- **Keep the description in the frontmatter accurate:** it decides when the
  skill is used. Update it if the skill's scope changed.
- **New skill?** Create one only when a repeated workflow isn't covered. Give
  it a name, a description saying when to use it, and a final step calling
  `improve-skills`.

## 4. Where the files live

- **Source of truth:** the project repo's `.claude/skills/<name>/SKILL.md`.
  If the skills are installed elsewhere (a personal `~/.claude/skills/`, or
  organisation skills uploaded in the app), those are copies. Edit the repo
  source, then tell the owner which skills changed, so they can re-upload
  them.
- **Never write secrets, passwords, tokens or personal data** into a skill or
  profile. Write where the value lives, not the value.
- **Commit** skill and profile edits separately from feature code, using the
  project's commit rules (identity, message style, no forbidden mentions),
  with a subject like "Skills: …".

## 5. Report

End with one or two lines: which skills and profile sections changed, and
why. If nothing was worth keeping, say so and change nothing.
