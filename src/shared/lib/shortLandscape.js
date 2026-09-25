// A phone held sideways: wide enough for Chakra's `md` (tablet/desktop)
// layout, but only ~375–430px tall. Width can't tell it from a tablet, so the
// test is the viewport's height and orientation. Desktop windows, tablets and
// portrait phones never match.
//
// SHORT_LANDSCAPE_QUERY feeds useShortLandscape (shared/ui) for layout that
// changes structure (the app shell's navigation rail, Home's two columns);
// SHORT_LANDSCAPE is the same query as a style key for plain restyling:
//
//   <Heading sx={{ [SHORT_LANDSCAPE]: { fontSize: 'xl' } }} />
export const SHORT_LANDSCAPE_MAX_HEIGHT = 500

export const SHORT_LANDSCAPE_QUERY = `(orientation: landscape) and (max-height: ${SHORT_LANDSCAPE_MAX_HEIGHT}px)`

export const SHORT_LANDSCAPE = `@media ${SHORT_LANDSCAPE_QUERY}`
