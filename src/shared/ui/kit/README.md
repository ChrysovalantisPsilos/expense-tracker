# UI kit

The landing-page look as real components, used by both the landing mocks and
the app, so they can't drift apart. Everything here is **presentational and
prop-driven**: pass already-formatted strings (`formatMoney(...)` from
`shared/lib/currency.js`) and plain numbers. No data access, no feature imports.

Import each file directly, e.g. `import Panel from '../../shared/ui/kit/Panel.jsx'`.
See every component live at **`/kit`** (dev server only).

**Tones.** Wherever a prop is called `tone` / `amountTone` it takes `'default'
| 'muted' | 'accent' | 'positive' | 'negative' | 'warning'` (theme tokens via
`textColor()` in `kitMath.js`). Progress fills take `'brand' | 'warning' |
'negative' | 'positive'`.

**Animation (optional).** Pieces that animate take `playback` (+ `delay` in
seconds). Omit it and they render their final state statically — the normal
case in the app. For motion: `const playback = usePlayback({ once: true })`,
put `ref={playback.ref}` on the container (Panel forwards it), and pass
`playback={playback}` down. Reduced-motion users always get the static state.

## Panel
The white rounded-2xl card with the soft lifted shadow. Every screen block.
`title`, `eyebrow`, `icon` (Lucide), `iconTone` (the icon tile's `tone`;
`'negative'` = pale red danger tile), `subtitle`, `action` (node) → header
(it's CardHeader: h2 title). `elevation` `'lifted'` (default) | `'soft'` |
`'none'` (a card nested inside another surface). `p` replaces the default
padding. `label` turns the whole card into one decorative `role="img"` (landing
only). Other Box props pass through; forwards `ref`.

## Tile
The sand (`bg.subtle`) inner tile inside a Panel. Children + Box props
(default `px=3 py=2.5`).

## IconTile
Square rounded tile with a Lucide icon at half its size. `icon`, `size` (px,
default 32), `variant` `'subtle'` (sand, accent icon) | `'solid'` (brand fill,
white icon — a group's hero tile), `tone` (icon colour on subtle, e.g.
`'positive'` for income; `'negative'` also tints the tile pale red for
danger — `tileColor()`), `radius` (default `'lg'`; use `'xl'` from 40px).
`CategoryBadge` is IconTile with a category's icon.

## Figure
A headline number: small muted `label` above a bold Poppins `value`
("Total / €357.00"). `size` `'sm' | 'md'` (default) `| 'lg' | 'xl'`, `tone`,
`align` `'left' | 'right'`. `layout="inline"` = label left, value right on one
row (a card's total line). Optional `playback`/`delay` reveal the value.

## SectionLabel
Muted uppercase label opening a block inside a Panel ("BALANCES",
"LAST 6 MONTHS"). `aside` = bold text on the right ("Sep: €1,635.00"). Box
props (e.g. `mb`) pass through.

## BalanceGrid / BalanceTile (`Balances.jsx`)
`BalanceGrid` = 2-column grid (`columns` to change). `BalanceTile` = sand tile
with muted `label` over a bold `value` in `tone`, and an optional small muted
`note` under it ("incl. €40.00 upcoming"). `size="md"` shows the value as a
Poppins Figure (Home's Income / Net tiles); default `'sm'`. For signed money use
`signedAmount(minor, format)` from `kitMath.js` → `{ text, tone }`
("+€162.75" positive, "−€2.85" negative, "€0.00" muted).

## HighlightPill
The pale-brand callout: `<HighlightPill amount="€89.25">Sofia owes you</HighlightPill>`.
`amount` optional (extra bold, accent by default; `amountTone` recolours it —
pass `balanceHighlight().tone` so "You owe Alex €89.25" is red). Use once per
card, for the line that matters most.

## ItemRow
Generic list row: icon tile · title over a muted meta line · bold amount right.
Expense, transaction, recurring and payment rows.
`icon` (Lucide → 32px IconTile) or `media` (any node: CategoryBadge,
UserAvatar), `title`, `meta` (string, or a node for date · category · tags),
`amount`, `amountTone`, `amountMeta` (muted line under the amount, e.g.
"≈ €3.74"), `trailing` (any node between the amount and the actions — a
Switch, a comment button; give it a fixed width so amounts line up),
`actions` (RowActions items `[{ label, icon, onClick, danger? }]`) +
`actionSlots`, `dimmed` (fades the content, not the controls — a paused rule),
`onClick` (the row becomes a button; `trailing` and `actions` always stay
outside it, so buttons never nest), `py` (default 2). Passing `actions`
(even `[]`) gives the amount a fixed-width column so figures line up — do it
for every row of a list or none.

## ProgressRow
Budget/goal row: icon, `title`, `meta` ("€312.40 of €400.00"), percent on the
right or an "Over budget" pill, and a bar underneath. `percent` (number; bar
clamps at 100%), `tone` (fill; `budgetTone()` output fits; defaults to
`'negative'` when over), `over` (default `percent > 100`), `overLabel`,
`valueLabel` (replaces "78%"), `icon`/`media`, `actions`/`actionSlots`,
`tooltip` (native hover tooltip — the row's HTML `title`, since `title` is the
heading; e.g. "Housing: €850.00 (48%)"), `playback`/`delay`. `to` (in-app path)
makes the row a drill-down link with a chevron — one tab stop over the whole
row, `actions` still their own buttons — and `linkLabel` is its accessible
name ("Show Groceries expenses for this month").

## StackedBar / ShareLegend (`ShareBar.jsx`)
One bar split into segments (2px gaps) + its legend (dot, muted name, bold %,
2 columns). Both take the same `items: [{ label, share, color? }]` with integer
`share`s summing to 100 (use `categoryBars` or `distributeByWeights`). Colours
default by position (coral/amber first, "Other" always muted). StackedBar:
`h`, `playback`. ShareLegend: `columns`, Box props (`mt={3}`); an item's
optional `to` + `linkLabel` make that entry a drill-down link (32px tap
target, chevron), as for ProgressRow.

## TrendBars
Rounded columns scaled to the peak, pale brand with the `current` one (default
last) in full brand. `bars: [{ label, value }]` (value any unit), `h` (default
110px), `playback`. Put the headline in a SectionLabel `aside` above it.

## ConversionRow
Sand tile for a foreign-currency amount: `label`, `rate` (shown "@ 1.17",
top-right), then `from` → `to` with `to` in accent. `playback`/`delay` reveal
`to`.

## TransferRow
Settle-up payment on a sand tile: avatar name → avatar name, `amount` right
(`amountTone`, default accent). `from` / `to`: `{ name, src?, highlight? }`
(`highlight` = current user). `action`: optional node (e.g. "Mark paid").

## Unfold
Chakra `Collapse` for a block with a shadow (a Panel that folds open, e.g.
Transactions' add form). Collapse clips its content, cutting the Panel's
shadow; Unfold unclips once fully open and clips again as it starts closing.
`in` opens it; other Collapse props (`animateOpacity`) pass through. A plain
Collapse is still right for shadowless content (e.g. a filters row).

## Also reused (in `shared/ui/`)
`CardHeader` (Panel's header; use directly only outside a Panel; takes
`iconTone` too), `RowActions`, `RowAmount` (ItemRow uses both),
`CategoryBadge`, `UserAvatar`, `Eyebrow`, `PageHeader`, `SegmentedControl`.
`NavList` / `NavRow`: the iOS-style grouped list (Settings, More) — NavList is
a lifted Panel with hairline-split rows; `label` puts a SectionLabel above it.

## Helpers
`kitMath.js` (pure, tested in `test/kitMath.test.js`): `textColor`,
`fillColor`, `tileColor`, `shareSwatch`, `barWidth`, `trendHeights`, `signedAmount`,
`playProps`. `motion.jsx`: `usePlayback`, `MotionBox`, `Reveal` (fade/slide a
block in with `playback`/`delay`).
