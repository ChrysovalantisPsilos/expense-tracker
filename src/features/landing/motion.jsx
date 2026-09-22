import { useRef } from 'react'
import { chakra, shouldForwardProp } from '@chakra-ui/react'
import { isValidMotionProp, motion, useInView, useReducedMotion } from 'framer-motion'

// Chakra box that also accepts framer-motion props (initial/animate/transition…).
export const MotionBox = chakra(motion.div, {
  shouldForwardProp: (prop) => isValidMotionProp(prop) || shouldForwardProp(prop),
})

// Shared playback gate for the landing mockups: they animate only while
// scrolled into view, and never when the visitor prefers reduced motion (then
// callers render their final state statically).
export function usePlayback({ once = false, amount = 0.35 } = {}) {
  const ref = useRef(null)
  const inView = useInView(ref, { once, amount })
  const reduce = Boolean(useReducedMotion())
  return { ref, reduce, inView, playing: inView && !reduce }
}
