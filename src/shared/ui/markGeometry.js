// The Budgeer mark (public/budgeer-mark.svg): a lowercase "b" whose bowl is a
// budget ring. A coral stem, then the ring: an amber arc, a small gap, and a
// coral arc round to the top again. Pure data, in the mark's own 48 × 48
// viewBox: the loading ring (ringLoader.js) draws exactly this, and the error
// screens' LooseRing scales it up.

export const MARK = {
  size: 48,
  stem: { x: 9.25, y: 3.6, w: 7.5, h: 29.4 },
  ring: { cx: 24, cy: 29.6, r: 11, width: 7.5 },
}

// The ring's arcs as fractions of its circumference, clockwise from 12 o'clock.
export const MARK_ARCS = {
  amber: [0, 0.275],
  coral: [0.304, 1],
}

export const circumference = (r) => 2 * Math.PI * r
