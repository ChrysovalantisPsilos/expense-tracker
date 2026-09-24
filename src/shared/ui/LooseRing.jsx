import { keyframes } from '@emotion/react'
import { Box } from '@chakra-ui/react'
import { MARK, MARK_ARCS, circumference } from './markGeometry.js'

// The error screens' and empty states' illustration: the Budgeer mark
// (public/budgeer-mark.svg, a lowercase "b" whose bowl is a budget ring,
// amber then coral) with its ring come loose. Per variant (see
// errorScreens.js):
//   notFound — the ring rolls away and settles; the stem tilts. Then it rocks.
//   crash    — the ring cracks into pieces, then reassembles. Loops.
//   update   — the ring refills to 100% and pops; two sparkles twinkle.
//   offline  — the mark dims and pulses slowly.
//   start    — nothing logged yet: an empty ring with just its first amber
//              sliver filling in, and a sparkle (the first-entry empty state).
//   split    — nothing shared yet: the ring fills in three equal slices, one
//              after another, like a bill split between friends; a sparkle.
// Reduced motion: no animation, and each variant shows its telling moment
// (rolled away, cracked apart, full, dimmed, started, split). Decorative: aria-hidden.

const C = {
  coral: 'var(--chakra-colors-brand-500)',
  amber: 'var(--chakra-colors-amber-400)',
  orange: 'var(--chakra-colors-chart-3)', // between coral and amber
  ground: 'var(--chakra-colors-border-default)',
  track: 'var(--chakra-colors-border-default)',
}

// Geometry (viewBox 200 × 170): the mark itself (markGeometry.js) scaled up,
// ring centred at x 100 and resting on the ground line at y 152. Same
// proportions as the logo, so the stem ends hidden inside the ring's band.
const OUTER = 34 // the ring's outer radius here
const S = OUTER / (MARK.ring.r + MARK.ring.width / 2)
const RING = { cx: 100, cy: 152 - OUTER, r: MARK.ring.r * S, width: MARK.ring.width * S }
const CIRC = circumference(RING.r)
const [AMBER, CORAL] = [MARK_ARCS.amber, MARK_ARCS.coral]
  .map((arc) => arc.map((f) => f * CIRC)) // spans along the circumference, from 12 o'clock
const STEM = {
  x: RING.cx + (MARK.stem.x - MARK.ring.cx) * S,
  y: RING.cy + (MARK.stem.y - MARK.ring.cy) * S,
  w: MARK.stem.w * S,
  h: MARK.stem.h * S,
}
const STEM_BASE = `${STEM.x + STEM.w / 2}px ${STEM.y + STEM.h}px`
const RING_CENTER = `${RING.cx}px ${RING.cy}px`

// An arc of the ring from `from` to `to` (circumference units), as a dashed
// circle rotated so 0 sits at 12 o'clock.
function Arc({ from, to, color }) {
  const len = to - from
  return (
    <circle cx={RING.cx} cy={RING.cy} r={RING.r} fill="none" strokeWidth={RING.width}
      transform={`rotate(-90 ${RING.cx} ${RING.cy})`}
      strokeDasharray={`${len} ${CIRC - len}`} strokeDashoffset={-from}
      style={{ stroke: color }} />
  )
}

// ---- notFound: roll away ---------------------------------------------------
// Rolling (not sliding): the turn matches the distance over the outer radius.
const ROLL = 60
const turn = (dx) => (dx / (RING.r + RING.width / 2)) * (180 / Math.PI)
const rolled = (dx) => `translateX(${dx}px) rotate(${turn(dx).toFixed(1)}deg)`
const ROLLED = rolled(ROLL)
const TILTED = 'rotate(-6deg)'
const rollAway = keyframes`
  0%, 12% { transform: none }
  55% { transform: ${rolled(ROLL + 8)} }
  72% { transform: ${rolled(ROLL - 5)} }
  86% { transform: ${rolled(ROLL + 2)} }
  100% { transform: ${ROLLED} }
`
const rock = keyframes`
  0%, 100% { transform: ${ROLLED} }
  50% { transform: ${rolled(ROLL - 3)} }
`
const tilt = keyframes`
  0%, 35% { transform: none }
  58% { transform: rotate(-10deg) }
  74% { transform: rotate(-4deg) }
  100% { transform: ${TILTED} }
`
const dust = keyframes`
  0%, 14% { opacity: 0; transform: none }
  24% { opacity: 1 }
  50%, 100% { opacity: 0; transform: translate(-16px, -4px) }
`

// ---- crash: crack and reassemble -------------------------------------------
// Each piece drifts out from the centre along its own middle angle.
const PIECES = [
  { from: AMBER[0], to: AMBER[1], color: C.amber, spin: 10 },
  { from: CORAL[0], to: CIRC * 0.54, color: C.coral, spin: -8 },
  { from: CIRC * 0.54, to: CIRC * 0.775, color: C.coral, spin: 6 },
  { from: CIRC * 0.775, to: CIRC, color: C.coral, spin: -10 },
].map((p) => {
  const mid = (((p.from + p.to) / 2) / CIRC) * 2 * Math.PI
  const d = 10
  const apart = `translate(${(Math.sin(mid) * d).toFixed(1)}px, ${(-Math.cos(mid) * d).toFixed(1)}px) rotate(${p.spin}deg)`
  const crack = keyframes`
    0%, 22% { transform: none }
    32%, 62% { transform: ${apart} }
    80%, 100% { transform: none }
  `
  return { ...p, apart, crack }
})
const shake = keyframes`
  0%, 20%, 30%, 100% { transform: none }
  23% { transform: rotate(-3deg) }
  26% { transform: rotate(3deg) }
`

// ---- update: refill --------------------------------------------------------
const fillArc = (len) => keyframes`
  from { stroke-dasharray: 0 ${CIRC} }
  to { stroke-dasharray: ${len} ${CIRC - len} }
`
const fillAmber = fillArc(AMBER[1] - AMBER[0])
const fillCoral = fillArc(CORAL[1] - CORAL[0])
const pop = keyframes`
  0%, 100% { transform: none }
  45% { transform: scale(1.08) }
`
// Starts hidden (fill-mode backwards), so the sparkles appear once full.
const twinkle = keyframes`
  0%, 100% { opacity: 0; transform: scale(0.4) }
  50% { opacity: 1; transform: scale(1) }
`

// ---- split: three slices ---------------------------------------------------
// Equal thirds with a small gap between them, filling in turn: amber at the
// top right and coral last, against the stem, where the logo has them.
const SLICE_GAP = 7
const SLICE_START = CIRC * 0.94
const SLICES = [C.amber, C.orange, C.coral].map((color, i) => ({
  from: SLICE_START + (i * CIRC) / 3 + SLICE_GAP / 2,
  to: SLICE_START + ((i + 1) * CIRC) / 3 - SLICE_GAP / 2,
  color,
}))
const fillSlice = fillArc(SLICES[0].to - SLICES[0].from)

// ---- offline: dim and breathe ----------------------------------------------
const breathe = keyframes`
  0%, 100% { opacity: 0.28 }
  50% { opacity: 0.6 }
`

// Per-variant CSS: `motion` runs by default, `still` replaces it under
// prefers-reduced-motion.
const STYLES = {
  notFound: {
    motion: {
      '.lr-ring': { animation: `${rollAway} 2.6s cubic-bezier(.45,0,.3,1) .3s both, ${rock} 3.2s ease-in-out 3.2s infinite` },
      '.lr-stem': { animation: `${tilt} 2.6s ease-in-out .3s both` },
      '.lr-dust': { animation: `${dust} 2.6s ease-out .3s both` },
    },
    still: { '.lr-ring': { transform: ROLLED }, '.lr-stem': { transform: TILTED }, '.lr-dust': { opacity: 0 } },
  },
  crash: {
    motion: {
      ...Object.fromEntries(PIECES.map((p, i) => [`.lr-piece-${i}`, { animation: `${p.crack} 4.8s cubic-bezier(.5,0,.3,1) infinite` }])),
      '.lr-stem': { animation: `${shake} 4.8s ease-in-out infinite` },
    },
    still: Object.fromEntries(PIECES.map((p, i) => [`.lr-piece-${i}`, { transform: p.apart }])),
  },
  update: {
    motion: {
      '.lr-amber circle': { animation: `${fillAmber} .7s ease-in .3s both` },
      '.lr-coral circle': { animation: `${fillCoral} 1.3s cubic-bezier(.3,0,.2,1) 1s both` },
      '.lr-ring': { animation: `${pop} .5s ease-out 2.3s both` },
      '.lr-spark': { animation: `${twinkle} 2.4s ease-in-out 2.4s infinite backwards` },
      '.lr-spark-2': { animationDelay: '3.2s' },
    },
    still: {},
  },
  offline: {
    motion: { '.lr-mark': { animation: `${breathe} 3.6s ease-in-out infinite` } },
    still: { '.lr-mark': { opacity: 0.4 } },
  },
  start: {
    motion: {
      '.lr-amber circle': { animation: `${fillAmber} .9s ease-out .3s both` },
      '.lr-spark': { animation: `${twinkle} 2.4s ease-in-out 1.2s infinite backwards` },
    },
    still: {},
  },
  split: {
    motion: {
      ...Object.fromEntries(SLICES.map((_, i) => [`.lr-slice-${i} circle`, { animation: `${fillSlice} .5s ease-out ${(0.3 + i * 0.45).toFixed(2)}s both` }])),
      '.lr-spark': { animation: `${twinkle} 2.4s ease-in-out 1.8s infinite backwards` },
    },
    still: {},
  },
}

function Sparkle({ x, y, s, className }) {
  // A four-point star.
  const d = `M${x} ${y - s} Q${x} ${y} ${x + s} ${y} Q${x} ${y} ${x} ${y + s} Q${x} ${y} ${x - s} ${y} Q${x} ${y} ${x} ${y - s}Z`
  return <path className={`lr-spark ${className ?? ''}`} d={d} style={{ fill: C.amber, transformOrigin: `${x}px ${y}px` }} />
}

export default function LooseRing({ variant = 'notFound', ...props }) {
  const { motion, still } = STYLES[variant]
  // The rolled-away ring ends right of centre: start the pair further left so
  // the settled scene is balanced.
  const shift = variant === 'notFound' ? -22 : 0
  return (
    <Box as="svg" viewBox="0 0 200 170" aria-hidden="true" focusable="false" display="block"
      sx={{
        '.lr-ring, .lr-piece': { transformOrigin: RING_CENTER },
        '.lr-stem': { transformOrigin: STEM_BASE },
        '@media (prefers-reduced-motion: no-preference)': motion,
        '@media (prefers-reduced-motion: reduce)': still,
      }}
      {...props}>
      <ellipse cx="100" cy="153" rx="84" ry="5" style={{ fill: C.ground }} />
      {/* One group, so dimming it (offline) fades stem and ring together
          without the stem showing through where they overlap. */}
      <g className="lr-mark" transform={`translate(${shift} 0)`}>
        <g className="lr-stem">
          <rect x={STEM.x} y={STEM.y} width={STEM.w} height={STEM.h} rx={STEM.w / 2} style={{ fill: C.coral }} />
        </g>
        {variant === 'notFound' && (
          <g className="lr-dust">
            <circle cx="94" cy="148" r="3.5" style={{ fill: C.ground }} />
            <circle cx="86" cy="143" r="2.5" style={{ fill: C.ground }} />
          </g>
        )}
        {variant === 'crash' ? (
          PIECES.map((p, i) => (
            <g key={p.from} className={`lr-piece lr-piece-${i}`}>
              <Arc from={p.from} to={p.to} color={p.color} />
            </g>
          ))
        ) : variant === 'split' ? (
          <g className="lr-ring">
            {SLICES.map((s, i) => (
              <g key={s.from} className={`lr-slice-${i}`}><Arc from={s.from} to={s.to} color={s.color} /></g>
            ))}
          </g>
        ) : (
          <g className="lr-ring">
            {(variant === 'update' || variant === 'start') && <Arc from={0} to={CIRC} color={C.track} />}
            <g className="lr-amber"><Arc from={AMBER[0]} to={AMBER[1]} color={C.amber} /></g>
            {variant !== 'start' && (
              <g className="lr-coral"><Arc from={CORAL[0]} to={CORAL[1]} color={C.coral} /></g>
            )}
          </g>
        )}
        {variant === 'update' && (
          <>
            <Sparkle x={148} y={80} s={9} />
            <Sparkle x={160} y={104} s={5.5} className="lr-spark-2" />
          </>
        )}
        {(variant === 'start' || variant === 'split') && <Sparkle x={146} y={86} s={8} />}
      </g>
    </Box>
  )
}
