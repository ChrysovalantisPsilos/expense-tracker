import { useRef } from 'react'
import { chakra, shouldForwardProp } from '@chakra-ui/react'
import { isValidMotionProp, motion, useInView, useReducedMotion } from 'framer-motion'
import { playProps } from './kitMath.js'

// Chakra box that also accepts framer-motion props (initial/animate/transition…).
export const MotionBox = chakra(motion.div, {
  shouldForwardProp: (prop) => isValidMotionProp(prop) || shouldForwardProp(prop),
})

// Playback gate for animated kit pieces: attach `ref` to the container and
// pass the result as their `playback` prop. They animate only while scrolled
// into view and never when the visitor prefers reduced motion (then they
// render their final state). Omit `playback` entirely to render statically.
export function usePlayback({ once = false, amount = 0.35 } = {}) {
  const ref = useRef(null)
  const inView = useInView(ref, { once, amount })
  const reduce = Boolean(useReducedMotion())
  return { ref, reduce, inView, playing: inView && !reduce }
}

const HIDDEN = { opacity: 0, x: -8 }
const SHOWN = { opacity: 1, x: 0 }

// Fades + slides its children in (after `delay` seconds) once played; static
// without `playback`. Block-level: wrap whole Text elements, not inline runs.
export function Reveal({ playback, delay = 0, children, ...props }) {
  return (
    <MotionBox {...playProps(playback, HIDDEN, SHOWN, { duration: 0.45, delay, ease: 'easeOut' })} {...props}>
      {children}
    </MotionBox>
  )
}
