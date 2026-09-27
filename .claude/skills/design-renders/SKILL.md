---
name: design-renders
description: Produce screenshot renders of proposed app screens before anything is built — prototypes inside a scratch copy of the app (its real theme and components, mocked back end, fake data), shot at phone and desktop sizes, checked, and sent to the owner as options with a recommendation, then updated as decisions come in. Use when the owner asks for designs, mockups, renders, "how would it look", or when a feature's look or flow isn't decided. Designs only: never changes the real repo. For logos and marketing images use brand-designs.
---

# Design renders

Owners decide from pictures. Answer a design question with real screenshots
built from the app's own theme and components, so they look exactly like the
product. Nothing here touches the real repo or any real environment.

## Start here

Read `.claude/project.md` for:
- the browser and tooling paths, and how to serve a prototype
- any existing render harness
- screen sizes and modes to cover
- the owner's preferences

Read `CLAUDE.md` or the design-system docs for the component kit and tokens.

## Rules

- **Designs only.** Prototypes live in a scratch copy outside the repo; no
  commits.
- **Fake data only:** believable, never real people's data. Keep the numbers
  consistent across every screen of a flow; totals must add up.
- **Options:**
  - Offer 2–3 distinct concepts (A/B/C) for a new screen, each in a realistic
    state.
  - Then show the full flow for the recommended one: entry point, first open,
    each step, confirmation, empty state, error or edge states, dark mode.
  - Recommend one and say why in 2–3 sentences.
- **Plain, short copy.** Tap targets ≥ 44px, readable contrast.

## Build the prototype

1. **Reuse a previous harness** if the profile lists one. Otherwise:
   1. Copy the repo without dependencies and link the real dependency folder.
   2. Add the prototype as a feature folder with a route, picking the
      variant with a query parameter (`?proto=A`).
   3. Use the real components, theme, icons and app shell, so navigation looks
      real.
2. **Serve it with a mocked back end:** fake env values plus request
   interception in the browser automation, answered from fixtures. Pick a free
   port, and stop the server when done.

## Shoot

- **Phone:** 390×844 at 2× (viewport and full page), plus sideways-phone and
  desktop shots when layout or navigation matters.
- **Dark mode:** a shot of the main screen.
- **Other languages:** a shot of each when the app ships them.
- **File names that sort:** `A-main.png`, `B-main.png`,
  `flow-1-entry.png`…, `empty.png`, `A-dark.png`. Add an `overview.png` with
  the flow side by side.

**Keep rounds lean,** since every image you look at is expensive:
- In the first round, shoot the main screen of each concept and the key flow
  steps.
- Add dark mode, sideways, desktop and full-page shots only for the concept
  the owner picks, or where layout is the question.
- On revisions, re-shoot only the screens that changed.

## Check before sending

- Open every PNG. Look for:
  - clipped or overflowing text (translations run longer)
  - overlap, and sheets or bars covering content, including sticky or
    floating bars over the list mid-scroll (shoot one mid-scroll frame,
    not just the top)
  - sideways scroll
  - numbers that don't add up
- Fix and re-shoot. Never send a render you haven't looked at.

## Hand over and iterate

- **Send** the overview first, then the concepts, then the flow, with a
  one-line caption per batch.
- **Report:** the recommendation, behaviour notes (what each action really
  changes), and ≤ 4 open questions, each in plain words with options and a
  recommended answer.
- **When decisions come in,** update the renders and re-send only what
  changed. Nothing is built until the owner asks.
- **Afterwards, run `improve-skills`.**
