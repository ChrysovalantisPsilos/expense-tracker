// The loading ring: the Budgeer mark drawing its ring on a sand track, amber
// then coral, then fading and starting again, while the stem breathes and
// the wordmark gently pulses. Reduced motion: the full mark, still.
//
// One source for both places it's drawn:
// - index.html, before any JavaScript: the Vite build (vite.config.js) puts
//   RING_LOADER_CSS in the page's <head> and bootLoaderHtml() in #root.
// - the app (RingLoader.jsx), which renders the same element trees with the
//   same classes, styled by that same stylesheet — so when React takes over
//   the screen, nothing moves.
// Pure: data and strings only.

import { MARK, MARK_ARCS, circumference } from './markGeometry.js'
import { colors, DARK, FONTS } from './palette.js'
import { RING_CYCLE_MS } from './loaderTiming.js'

const { stem, ring } = MARK
const round = (n) => Math.round(n * 100) / 100
const CIRC = round(circumference(ring.r))

// stroke-dasharray / -dashoffset drawing one arc of the ring.
function arcDash([from, to]) {
  const len = round((to - from) * CIRC)
  return { array: `${len} ${round(CIRC - len)}`, offset: round(-from * CIRC) }
}
const AMBER = arcDash(MARK_ARCS.amber)
const CORAL = arcDash(MARK_ARCS.coral)
const EMPTY = `0 ${CIRC}`

// Element trees: [tag, attributes, children]. Attribute names are the DOM's;
// RingLoader.jsx maps them to React props.
const circle = (cls, extra) => ['circle', { class: cls, cx: ring.cx, cy: ring.cy, r: ring.r, ...extra }]

// The mark, `size` px square (or any CSS length). `mono`: drawn in the text
// colour, for a button or a coloured fill.
export function markTree(size, { mono = false } = {}) {
  return ['svg', {
    class: mono ? 'rl-mark rl-mono' : 'rl-mark', width: size, height: size, viewBox: `0 0 ${MARK.size} ${MARK.size}`, fill: 'none',
    'aria-hidden': 'true', focusable: 'false',
  }, [
    ['rect', { class: 'rl-stem', x: stem.x, y: stem.y, width: stem.w, height: stem.h, rx: stem.w / 2 }],
    circle('rl-track', { 'stroke-width': ring.width }),
    ['g', { transform: `rotate(-90 ${ring.cx} ${ring.cy})`, 'stroke-width': ring.width }, [
      // The full mark as attributes: what shows when the animation is off.
      circle('rl-amber', { 'stroke-dasharray': AMBER.array }),
      circle('rl-coral', { 'stroke-dasharray': CORAL.array, 'stroke-dashoffset': CORAL.offset }),
    ]],
  ]]
}

const SCREEN_MARK_SIZE = 84
export const LOADING_LABEL = 'Loading…'

// The full-screen loader: the mark over the wordmark, centred. `caption`
// adds a line under them (and is what screen readers hear).
export function screenTree({ caption } = {}) {
  return ['div', { class: 'rl-screen', role: 'status' }, [
    markTree(SCREEN_MARK_SIZE),
    ['span', { class: 'rl-word', 'aria-hidden': 'true' }, ['budgeer']],
    caption
      ? ['span', { class: 'rl-caption' }, [caption]]
      : ['span', { class: 'rl-sr' }, [LOADING_LABEL]],
  ]]
}

const escape = (v) => String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

export function toHtml(node) {
  if (typeof node === 'string') return escape(node)
  const [tag, attrs, children = []] = node
  const a = Object.entries(attrs).map(([k, v]) => ` ${k}="${escape(v)}"`).join('')
  return `<${tag}${a}>${children.map(toHtml).join('')}</${tag}>`
}

export const bootLoaderHtml = () => toHtml(screenTree())

// Colours: light, then dark — where the OS asks for it (before the app has
// picked a mode) or the app has set data-theme="dark" on <html>, as Chakra
// does. Mirrors the theme: coral brand.500, amber.400, track bg.subtle,
// ink text.primary, muted text.muted, canvas bg.canvas.
const vars = (v) => Object.entries(v).map(([k, c]) => `--rl-${k}:${c}`).join(';')
const LIGHT = vars({
  coral: colors.brand[500], amber: colors.amber[400], track: colors.sand[100],
  ink: colors.sand[900], muted: colors.sand[600], canvas: colors.sand[50],
})
const DARK_VARS = vars({ track: DARK.subtle, ink: DARK.text, muted: colors.sand[400], canvas: DARK.canvas })

const ms = (n) => `${n}ms`
const loop = (name, easing = 'ease-in-out') => `${name} ${ms(RING_CYCLE_MS)} ${easing} var(--rl-phase,0ms) infinite`

export const RING_LOADER_CSS = [
  `:root{${LIGHT}}`,
  `@media (prefers-color-scheme:dark){:root:not([data-theme=light]){${DARK_VARS}}}`,
  `:root[data-theme=dark]{${DARK_VARS}}`,
  'body{margin:0;background:var(--rl-canvas)}',
  '.rl-screen{box-sizing:border-box;min-height:100vh;min-height:100dvh;padding:16px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px}',
  '.rl-mark{display:block;flex-shrink:0;overflow:visible}',
  // Breathes from the stem's foot.
  `.rl-stem{fill:var(--rl-coral);transform-box:view-box;transform-origin:${stem.x + stem.w / 2}px ${stem.y + stem.h}px;animation:${loop('rl-breathe')}}`,
  '.rl-track{stroke:var(--rl-track)}',
  `.rl-amber{stroke:var(--rl-amber);animation:${loop('rl-amber')}}`,
  `.rl-coral{stroke:var(--rl-coral);animation:${loop('rl-coral')}}`,
  `.rl-word{font-family:${FONTS.heading};font-weight:700;font-size:22px;line-height:1.2;letter-spacing:-0.02em;color:var(--rl-ink);animation:${loop('rl-pulse')} alternate}`,
  `.rl-caption{font-family:${FONTS.body};font-size:15px;line-height:1.4;color:var(--rl-muted);text-align:center}`,
  // In a button or on a coloured fill: the mark in the text colour.
  '.rl-mono .rl-stem{fill:currentColor}',
  '.rl-mono .rl-coral{stroke:currentColor}',
  '.rl-mono .rl-amber{stroke:currentColor;stroke-opacity:0.6}',
  '.rl-mono .rl-track{stroke:currentColor;stroke-opacity:0.2}',
  '.rl-sr{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}',
  // Opaque while drawing and holding (to 80%), then a fade before the next draw.
  `@keyframes rl-amber{0%{stroke-dasharray:${EMPTY};opacity:1}30%,80%{stroke-dasharray:${AMBER.array};opacity:1}100%{stroke-dasharray:${AMBER.array};opacity:0}}`,
  `@keyframes rl-coral{0%,25%{stroke-dasharray:${EMPTY};opacity:1}65%,80%{stroke-dasharray:${CORAL.array};opacity:1}100%{stroke-dasharray:${CORAL.array};opacity:0}}`,
  '@keyframes rl-breathe{0%,100%{transform:scaleY(1)}50%{transform:scaleY(1.05)}}',
  '@keyframes rl-pulse{from{opacity:0.55}to{opacity:1}}',
  '@media (prefers-reduced-motion:reduce){.rl-stem,.rl-amber,.rl-coral,.rl-word{animation:none}}',
].join('\n')
