---
name: brand-designs
description: Design logos and promotional images for a product — logo concepts as SVG, a finished logo pack (marks, lockups, one-colour and on-colour variants, app icons, favicons, a brand sheet and usage notes), and marketing images (app-store screenshots, social posts and stories, Open Graph/link previews, hero banners) built from the real app's screens. Use when the owner asks for a logo, icon, brand kit, promotional or marketing images, store screenshots, social media images or link-preview images. Not for in-app screen designs (use design-renders).
---

# Brand and promotional designs

The owner picks from pictures. Every concept is shown as a rendered image on
light and dark backgrounds, at real sizes, before anything is finalised.
Nothing ships into the product until the owner approves it.

## Start here

- **Read `.claude/project.md`:** the brand facts (colours, fonts, the current
  logo and what it means, tone), tooling paths, and any earlier logo pack or
  promo harness.
- **Look at what exists** in the repo: the favicon, app icons, manifest, OG
  image, landing page and theme tokens. New work must fit the brand or
  deliberately replace it.
- **Ask one short question** if the brief is open (evolve the current logo, or
  start fresh? where will the images be used?), with a recommendation.

## Tools

- **Vector work:** hand-written SVG. Keep geometry simple (circles, arcs,
  rounded rects), grid-aligned, one `viewBox`, no embedded bitmaps.
- **Text:** convert wordmarks to outlines in final SVGs, so no font is needed.
  Use the brand font from the project's installed font files (or
  `@fontsource`), never a CDN.
- **Rendering:** an HTML sheet shot with headless Chromium through Playwright,
  at 2× for concept sheets and at the exact pixel size for deliverables.
  Convert to PNG and ICO from the same source. Use the scratch folder, never
  the repo, until approved.

## A. Logo concepts

1. **Offer 6–9 distinct ideas**, each with a one-line meaning (what the shape
   says about the product). Include one refinement of the current logo if
   there is one.
2. **One concept sheet** shows each idea:
   - as the mark alone at 192, 48 and 16 px (favicon legibility)
   - with the wordmark
   - on light and dark backgrounds
   - inside a round mask and an iOS-style rounded square
3. **Check each one:** it's recognisable at 16 px, there are no hairlines
   thinner than ~1.5 px at 48 px, it works in one colour, and it isn't a
   lookalike of a well-known brand.
4. **Recommend 1–2** and ask the owner to pick. Iterate on the picked one;
   don't restart.

## B. Logo pack (after approval)

Deliver a folder and a zip:
- **`svg/`, the masters:**
  - the mark: full colour, one-colour ink, one-colour white, and on the brand
    colour
  - horizontal and stacked lockups for light and dark backgrounds, all-white
    and all-ink
  - the app icon
- **`png/`:** each at 512 and 2048 px, with transparent backgrounds where
  it makes sense.
- **`app-icon/`:** 180, 192, 512, 1024 and 2048, with no transparency, safe
  under round and rounded-square masks.
- **`favicon/`:** 16 and 32 px PNG, plus a multi-size `.ico`.
- **`brand-sheet.png`:** the variants, colours with hex codes, clear space and
  minimum sizes.
- **`README.txt`:**
  - what the mark means
  - the colours
  - the font and its tracking
  - clear space
  - minimum sizes
  - a one-line use for each file

If the owner wants it in the product, replacing the favicon, manifest icons,
in-app logo component or OG image is a normal change through `ship-feature`.

## C. Promotional images

Build from the real app so it's honest and on-brand. The screens come from the
`design-renders` harness pattern: the real UI, a mocked back end, and
believable fake data, never real users' data.

Common sets:

| Image | Size |
| --- | --- |
| App-store / listing screenshots | 1290×2796 or 1242×2688 (iOS), 1080×1920 (Android/PWA): 4–6 frames, each one benefit, with a short headline above the phone |
| Social post (square) | 1080×1080 |
| Social story / reel cover | 1080×1920 |
| Link preview / Open Graph | 1200×630 (keep key content inside the central ~1000×500; under ~300 KB) |
| Hero / landing banner | 1920×1080 |

- **Layout:** compose in HTML, with the brand background, the headline in the
  brand font, the app screenshot in a device frame and the logo. One message
  per image. The headline is readable at thumbnail size (≥ 64 px on a
  1080-wide canvas).
- **Copy:**
  - short, benefit-led and true
  - no claims the app can't back up, no competitor names
  - no prices or promises the owner hasn't approved
- **Languages:** one set per language the product ships, since text length
  differs, so check each.
- **OG images:** in the repo, the preview URL must be absolute https with the
  right `og:image:width` and `og:image:height`. Crawlers cache previews, so a
  changed image may need a new file name.

## Check before sending

- Open every image at 100% and as a small thumbnail. Look for:
  - text cut off by store or social safe areas
  - low contrast
  - blurry upscaled screenshots
  - fake data that looks real (real names, IBANs, card numbers)
  - inconsistent numbers across frames
- **Logos:** also check the 16 px favicon and the one-colour versions.

## Hand over

- Send the concept sheet or overview first, then the individual images.
- Recommend one, and ask ≤ 3 plain questions with a recommended answer each.
- After approval, deliver the pack as a zip plus the key PNGs.
- **Run `improve-skills`:** brand facts learned go into
  `.claude/project.md`, and generic lessons into this skill.
