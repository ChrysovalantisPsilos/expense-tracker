// A phone held sideways: wide enough for Chakra's `md` (tablet/desktop)
// layout, but only ~375–430px tall. Width can't tell it from a tablet, so the
// test is the viewport's height and orientation. Desktop windows, tablets and
// portrait phones never match.
//
// SHORT_LANDSCAPE_QUERY feeds useShortLandscape (shared/ui) for layout that
// changes structure (the app shell's rail and header, Home's stacks, the
// add-expense page's columns); SHORT_LANDSCAPE is the same query as a style
// key for plain restyling:
//
//   <Heading sx={{ [SHORT_LANDSCAPE]: { fontSize: 'xl' } }} />
export const SHORT_LANDSCAPE_MAX_HEIGHT = 500

export const SHORT_LANDSCAPE_QUERY = `(orientation: landscape) and (max-height: ${SHORT_LANDSCAPE_MAX_HEIGHT}px)`

export const SHORT_LANDSCAPE = `@media ${SHORT_LANDSCAPE_QUERY}`

// Styles that apply only sideways: `sx={landscapeOnly({ … })}`.
export function landscapeOnly(style) {
  return { [SHORT_LANDSCAPE]: style }
}

// The sideways shell's measurements (px). The rail sits on the left, before
// the notch's inset; the page is one centred column under a slim header.
export const RAIL_W = 64
export const HEADER_H = 52
export const CONTENT_MAX_W = 720
export const GUTTER = 16
export const STACK_GAP = 12

// The screen's safe areas (the notch, the home indicator), as CSS.
const SAFE_INSET = {
  left: 'env(safe-area-inset-left, 0px)',
  right: 'env(safe-area-inset-right, 0px)',
  bottom: 'env(safe-area-inset-bottom, 0px)',
}

// The rail widens by the left inset and pads it, so the notch's band is the
// rail's own (page-coloured) background rather than a blank strip.
export const RAIL_BOX = {
  w: `calc(${RAIL_W}px + ${SAFE_INSET.left})`,
  pl: SAFE_INSET.left,
  pb: `calc(12px + ${SAFE_INSET.bottom})`,
}

// The page column: capped and centred, clear of the right inset and the home
// indicator.
export const COLUMN_BOX = {
  maxW: `calc(${CONTENT_MAX_W + 2 * GUTTER}px + ${SAFE_INSET.right})`,
  pl: `${GUTTER}px`,
  pr: `calc(${GUTTER}px + ${SAFE_INSET.right})`,
  pb: `calc(24px + ${SAFE_INSET.bottom})`,
}

// A list row needs this much width to keep its edit/delete buttons inline
// beside a readable title; narrower, they fold into its ⋯ menu.
export const ROW_INLINE_ACTIONS_MIN = 320

// A media query can't read the safe areas, so the test allows for a notch's
// on both sides (an iPhone's are 44–47px each held sideways).
export const NOTCH_ALLOWANCE = 2 * 44

// The narrowest screen whose two stacks (Home: the column less the gap
// between them, halved) are each that wide, even beside a notch.
export function stackActionsInlineFrom() {
  return 2 * ROW_INLINE_ACTIONS_MIN + STACK_GAP + 2 * GUTTER + RAIL_W + NOTCH_ALLOWANCE
}

// Style key for a row inside a stack on a screen too narrow for that (an
// iPhone SE or mini held sideways): <Box sx={{ [NARROW_STACK]: { … } }} />.
export const NARROW_STACK = `@media ${SHORT_LANDSCAPE_QUERY} and (max-width: ${stackActionsInlineFrom() - 1}px)`

// A text that stays on one line, cut with an ellipsis.
export const ONE_LINE = { whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }
