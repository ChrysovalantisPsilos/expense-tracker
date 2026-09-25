import { useMediaQuery } from '@chakra-ui/react'
import { SHORT_LANDSCAPE_QUERY } from '../lib/shortLandscape.js'

// True on a short landscape screen (a phone held sideways; shortLandscape.js),
// following rotation live. Read on the first render (ssr: false), so the
// right layout paints first, with no flash of the other one.
export function useShortLandscape() {
  const [matches] = useMediaQuery(SHORT_LANDSCAPE_QUERY, { ssr: false })
  return matches
}
