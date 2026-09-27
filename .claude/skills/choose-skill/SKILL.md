---
name: choose-skill
description: Start of any non-trivial request in a project — read the project's requirements and the request, then pick the right skill or chain of skills (design-renders, brand-designs, ship-feature, release-to-prod, delegate-and-review, improve-skills, or any other installed skill), set up the project profile if it's missing, and state the plan in one line before starting. Use when a new task arrives and it isn't obvious which workflow applies, when a request spans several workflows, or when starting work in a project for the first time.
---

# Choose the right skill

Pick the workflow before doing the work. A wrong start is the most expensive
mistake: building before the design is agreed, releasing without the owner's
go, or doing alone what should be split.

## 1. Read the project

- **`.claude/project.md`, the project profile.** If it's missing, note it:
  the chosen skill gathers the facts, and `improve-skills` creates the profile
  at the end. Also note whether the project has environments, a release flow,
  languages and a brand.
- **`CLAUDE.md`, or `AGENTS.md` or the README:** the rules and the
  architecture.
- **The installed skills:** the project's `.claude/skills/`, plus the
  personal and organisation skills listed in the session. A project skill
  beats a generic one with the same purpose.

## 2. Classify the request

| The request is… | Use |
| --- | --- |
| A question, explanation or investigation, with no change wanted | No skill. Answer directly, and look things up first. |
| A small, clear fix or edit (one place, obvious result) | No workflow skill. Do it, run the project's checks and commit per the profile. Use `ship-feature` if it touches the database, security or several features. |
| A feature, change or bug fix whose behaviour and look are decided | `ship-feature` |
| New or changed screens where the look or flow isn't decided ("design", "how would it look", "mockups", "come up with options") | `design-renders`, then `ship-feature` once the owner picks |
| Product rules unclear (what a number means, what an action really changes) | Ask the owner first, one multiple-choice question at a time with a recommendation, then continue with the matching row |
| Logo, icon, brand kit, store screenshots, social or promo images, link-preview images | `brand-designs` |
| "Release", "push to prod/production", "go live", with the owner's explicit go for this release | `release-to-prod`. Without a clear go, ask once. |
| Big or multi-part work: several independent pieces, long test runs, many deploys, a large build | `delegate-and-review` wrapped around the matching skill(s) |
| A correction of how you work, "improve the skills", or the end of any skill-led task | `improve-skills` |
| A document, spreadsheet, slide deck, PDF, chart or other artefact | The matching installed skill (e.g. docx, xlsx, pptx, pdf, dataviz), not a workflow skill |

## 3. Chain when it spans several

Common chains:
- **New feature, look undecided:** `design-renders` → decisions →
  `ship-feature` → `improve-skills`.
- **Large feature:** `delegate-and-review` (brief the helpers with
  `ship-feature` as their process) → review → merge → `improve-skills`.
- **Build and release:** `ship-feature` → owner's go → `release-to-prod` →
  `improve-skills`. Never skip the go.
- **Launch or marketing moment:** `brand-designs` (images) plus
  `release-to-prod` (notes), with `ship-feature` if the in-app logo or link
  preview changes.

## 4. Guardrails that override the table

- **Anything touching production, deleting data or messaging people** needs
  the owner's explicit approval for that action.
- **Designs stay designs** until the owner asks to build.
- **When two skills could fit,** pick the narrower one, and say which and why
  in one line.
- **Mind the cost:** use the lightest route that does the job well. Don't
  wrap small work in `delegate-and-review`. When the owner sends several
  small requests, suggest doing them as one batch.
- **Recurring work with no fitting skill:** do it directly, then suggest a new
  skill via `improve-skills`.

## 5. Say the plan, then start

Tell the owner in one line which skill or chain you're using, e.g. "Using
design-renders first, since the look isn't decided; I'll build with
ship-feature once you pick." Then load the chosen skill and follow it. Don't
wait for a reply unless a decision is needed.

## 6. Improve the routing

When a request was routed wrong (you picked a skill and had to switch), or
fitted no row, record it via `improve-skills`: generic routing rules go in the
table above, and project-specific ones in `.claude/project.md`.
