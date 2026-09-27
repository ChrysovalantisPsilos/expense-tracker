---
name: design-renders
description: Produce screenshot renders of proposed Budgeer screens before anything is built — prototypes inside a scratch copy of the app (real theme and kit, mocked Supabase, fake data), shot with Playwright at phone and desktop sizes, checked, and sent to the owner as options with a recommendation. Use when the owner asks for designs, mockups, renders, "how would it look", or when a feature's look or flow isn't decided yet. Designs only: never changes the real repo.
---

# Design renders

The owner decides from pictures, so a design question is answered with real
screenshots, not descriptions. Renders are built from the app's own theme and
kit so they look exactly like Budgeer. Nothing here touches the real repo or
either Supabase project.

## Rules

- **Designs only.** No edits, commits or pushes in `/home/user/expense-tracker`.
  Prototypes live in a scratch copy under the session scratchpad.
- **Fake data only:** believable names, shops and amounts. Never real CSV
  rows, names, IBANs or card numbers. Keep the numbers consistent across every
  screen of a flow; totals must add up.
- **Options:**
  - Offer 2–3 distinct concepts (A/B/C) for a new screen, each shown in a
    realistic state (with data, with a few edits made).
  - Then show the full flow for the recommended one.
  - Recommend one and say why in 2–3 sentences.
- **Plain, short copy,** in English unless Greek is the point. Tap targets are
  ≥ 44px and contrast has to be readable.

## Set up a prototype app

1. Copy an existing harness folder from the scratchpad if one exists, e.g.
   `group-add-design/` or `plan-design/`. They hold:
   - `app/`: a copy of the repo, with `node_modules` symlinked to the real
     one
   - `harness.mjs`: Playwright plus a mocked Supabase REST/auth, with the
     fixtures in `mockdata.mjs`
   - `shoot.mjs`: a JSON job list
   - `vite.shots.mjs`: serves a checkout with the repo's own Vite config
2. Otherwise: `cp -r` the repo without `node_modules`, and symlink
   `node_modules` to the real one.
3. Add the prototype as a feature folder (e.g. `app/src/features/plan/`) with
   a route. Pick the variant with a query parameter (`?proto=A`). Use the real
   kit (`src/shared/ui/kit/`), the theme tokens, the lucide icons and the app
   shell, so navigation, header and bottom bar are real.
4. Serve it:
   ```bash
   VITE_SUPABASE_URL=https://fake.supabase.co VITE_SUPABASE_ANON_KEY=fake \
     npx vite --config <harness>/vite.shots.mjs --port <free port>
   ```
   Pick a port nobody is using, and stop the server when done.

## Shoot

- **Browser:** Chromium is preinstalled at
  `/opt/pw-browsers/chromium-1194/chrome-linux/chrome`, with Playwright from
  `/opt/node22/lib/node_modules/`. Never run `playwright install`.
- **Phone:** 390×844, device scale factor 2, taken as a viewport shot plus a
  full-page shot where the screen scrolls.
- **Desktop:** 1280×800, whenever navigation or the sidebar matters.
- **Dark mode and sideways phones:** add a dark-mode shot of the main screen,
  and a sideways-phone shot (landscape ≤ 500px tall) when layout is in
  question.
- **File names sort in order:** `A-main.png`, `B-main.png`,
  `flow-1-entry.png` … `flow-N-….png`, `empty.png`, `A-dark.png`.
- **Overview sheet:** build `overview.png` with the flow side by side.

## Check before sending

- Read every PNG yourself. Look for:
  - clipped or truncated text, and one-line chips that overflow (Greek runs
    20–30% longer)
  - overlapping elements, and sheets or bars covering content
  - sideways page scroll
  - numbers that don't add up across screens
- Fix and re-shoot. Don't send a render you haven't looked at.

## Hand over

- Send the overview first, then the concepts, then the flow. Use
  `SendUserFile` (display render), with a one-line caption per batch.
- Report:
  - the recommendation
  - behaviour notes (what each action really changes)
  - ≤ 4 open questions, each explained in plain words, with options and a
    recommended answer
- **Record decisions as they come in:** when the owner answers, update the
  renders to match and re-send only what changed. Nothing gets built until the
  owner asks for it.
