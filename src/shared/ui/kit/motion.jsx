import { forwardRef, useEffect, useRef, useState } from 'react'
import { chakra, shouldForwardProp } from '@chakra-ui/react'
import { isValidMotionProp, motion, useInView, useReducedMotion } from 'framer-motion'
import { nextPhase, playProps } from './kitMath.js'

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

// AnimatePresence item props for a mock's content swapping in: a short rise
// and fade. Pass `playback` to get plain static props under reduced motion.
const POP = {
  initial: { opacity: 0, y: 10 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0 },
  transition: { duration: 0.35, ease: 'easeOut' },
}
export const popIn = (playback) => (playback.reduce ? { initial: false } : POP)

const HIDDEN = { opacity: 0, x: -8 }
const SHOWN = { opacity: 1, x: 0 }

// Fades + slides its children in (after `delay` seconds) once played; static
// without `playback`. Block-level: wrap whole Text elements, not inline runs.
// Forwards `ref` (e.g. to be its own usePlayback target).
export const Reveal = forwardRef(function Reveal({ playback, delay = 0, children, ...props }, ref) {
  return (
    <MotionBox ref={ref} {...playProps(playback, HIDDEN, SHOWN, { duration: 0.45, delay, ease: 'easeOut' })} {...props}>
      {children}
    </MotionBox>
  )
})

// A looping step-through for animated mocks: returns the phase to show,
// advancing after holds[phase] ms and wrapping to 0 after the last. It runs
// only while `playback` is playing (in view, motion allowed) and pauses where
// it is otherwise; under reduced motion it shows the last phase, the final
// state. `holds` must be a stable (module-level) array.
export function usePhases(playback, holds) {
  const [phase, setPhase] = useState(0)
  const { playing, reduce } = playback
  useEffect(() => {
    if (!playing) return undefined
    const t = setTimeout(() => setPhase((p) => nextPhase(p, holds.length)), holds[phase])
    return () => clearTimeout(t)
  }, [playing, phase, holds])
  return reduce ? holds.length - 1 : phase
}
