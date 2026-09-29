// Pure helpers for the UI kit (no React, no I/O) — unit-tested in
// test/kitMath.test.js. Components take already-formatted strings; these only
// map tones to theme tokens and turn numbers into bar sizes.

// Text colour per tone. Every kit figure, amount and icon colours through here.
const TEXT_TONE = {
  default: 'text.primary',
  muted: 'text.muted',
  accent: 'accent.fg',
  positive: 'status.positive',
  negative: 'status.negative',
  warning: 'status.warning',
}

// Bar fill per tone (progress bars). `brand` is the normal fill.
const FILL_TONE = {
  brand: 'brand.500',
  negative: 'red.400',
  warning: 'status.warning',
  positive: 'status.positive',
}

// Background of a subtle IconTile per tone: sand, except a pale red tile
// for danger ('negative', e.g. Delete account).
const TILE_TONE = { negative: 'status.negativeSubtle' }

export const textColor = (tone) => TEXT_TONE[tone] ?? TEXT_TONE.default
export const fillColor = (tone) => FILL_TONE[tone] ?? FILL_TONE.brand
export const tileColor = (tone) => TILE_TONE[tone] ?? 'bg.subtle'

// Series swatches for share breakdowns, coral/amber first; "Other" is always
// the muted sand so the tail never competes with real categories.
const SHARE_SWATCHES = ['brand.500', 'amber.400', 'brand.300', 'amber.600', 'chart.5', 'chart.6', 'chart.3']
const OTHER_SWATCH = 'text.muted'
export function shareSwatch(index, label) {
  if (label === 'Other') return OTHER_SWATCH
  return SHARE_SWATCHES[index % SHARE_SWATCHES.length]
}

// A progress bar's fill as a CSS width, clamped to 0..100% (an over-budget
// bar is simply full).
export function barWidth(percent) {
  const p = Number.isFinite(percent) ? percent : 0
  return `${Math.min(100, Math.max(0, p))}%`
}

// Heights (CSS %) for a column chart: each value relative to the largest,
// scaled to `headroom`% so the tallest column leaves room above it. Zero or
// negative values (and an all-zero series) give 0%.
export function trendHeights(values, headroom = 85) {
  const peak = Math.max(0, ...values)
  return values.map((v) => (peak > 0 && v > 0 ? `${(v / peak) * headroom}%` : '0%'))
}

// The tone of a signed amount: positive above zero, negative below, muted
// (settled) at zero.
export const signTone = (minor) => (minor > 0 ? 'positive' : minor < 0 ? 'negative' : 'muted')

// A signed balance for display: `format` turns a non-negative minor amount
// into a string (e.g. m => formatMoney(m, 'EUR')). Positive → "+€1.00"
// (positive tone), negative → "−€1.00" (true minus sign, negative tone), zero
// → "€0.00" (muted: settled). With a currency, see currency.formatSigned.
export function signedAmount(minor, format) {
  const sign = minor > 0 ? '+' : minor < 0 ? '−' : ''
  return { text: `${sign}${format(Math.abs(minor))}`, tone: signTone(minor) }
}

// framer-motion props that take a value from `from` to `to`. Without a
// playback gate (static app rendering) or when the visitor prefers reduced
// motion, the element renders straight at `to` with no animation.
// playback: { reduce, inView } from usePlayback, or undefined.
export function playProps(playback, from, to, transition) {
  if (!playback || playback.reduce) return { initial: false, animate: to }
  return { initial: from, animate: playback.inView ? to : from, transition }
}

// The phase after `phase` in a looping animation of `count` phases (the last
// wraps to 0). See usePhases in motion.jsx.
export function nextPhase(phase, count) {
  return count > 0 ? (phase + 1) % count : 0
}
