// Loading states: when loaders appear (loaderTiming.js), the loading ring's
// markup and stylesheet (ringLoader.js, also painted by index.html before any
// JavaScript), its geometry against the real logo file, and the colour-mode
// boot script (public/theme-boot.js).
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import {
  LOADER_DELAY_MS, HANDOVER_MS, RING_CYCLE_MS, revealDelay, ringPhase, createLoaderClock,
} from '../src/shared/ui/loaderTiming.js'
import {
  markTree, screenTree, toHtml, bootLoaderHtml, RING_LOADER_CSS, LOADING_LABEL,
} from '../src/shared/ui/ringLoader.js'
import { MARK, MARK_ARCS, circumference } from '../src/shared/ui/markGeometry.js'
import { colors, DARK } from '../src/shared/ui/palette.js'
import { STORAGE_KEYS } from '../src/shared/lib/keys.js'

// ---- reveal delay -----------------------------------------------------------

test('revealDelay: a fresh loader waits; one taking over shows at once', () => {
  assert.equal(revealDelay({ now: 1000 }), LOADER_DELAY_MS)
  assert.equal(revealDelay({ now: 1000, bootPending: true }), 0)
  assert.equal(revealDelay({ now: 1000, onScreen: 1 }), 0)
  assert.equal(revealDelay({ now: 1000, lastSeen: 1000 - HANDOVER_MS }), 0)
  assert.equal(revealDelay({ now: 1000, lastSeen: 1000 - HANDOVER_MS - 1 }), LOADER_DELAY_MS)
})

test('ringPhase: a negative offset into the two-cycle period, 0 without a start', () => {
  assert.equal(ringPhase(500, null), 0)
  assert.equal(ringPhase(500, 800), 0) // start in the future: no offset
  assert.equal(ringPhase(1000, 1000), 0)
  assert.equal(ringPhase(1250, 1000), -250)
  assert.equal(ringPhase(1000 + 2 * RING_CYCLE_MS + 40, 1000), -40)
  assert.equal(ringPhase(1000.4, 1000), 0)
})

function fakeClock() {
  let t = 0
  const clock = createLoaderClock(() => t)
  return { clock, at: (ms) => { t = ms } }
}

test('loader clock: the first loader after index.html’s screen shows at once, in step', () => {
  const { clock, at } = fakeClock()
  at(900)
  clock.adoptBoot(120) // the boot ring started at 120 ms
  at(1400) // React renders much later: still a take-over
  assert.equal(clock.revealDelay(), 0)
  assert.equal(clock.ringPhase(true), -((1400 - 120) % (2 * RING_CYCLE_MS)))
  clock.shown()
  at(1600)
  clock.hidden()
  // A second full-screen loader right after (a lazy route): still continuous.
  at(1650)
  assert.equal(clock.revealDelay(), 0)
  assert.equal(clock.ringPhase(true), -((1650 - 120) % (2 * RING_CYCLE_MS)))
})

test('loader clock: without a boot start time the ring starts at adoption', () => {
  const { clock, at } = fakeClock()
  at(300)
  clock.adoptBoot(null) // reduced motion: no running animation
  at(500)
  assert.equal(clock.ringPhase(true), -200)
})

test('loader clock: a loader on its own waits, then starts its ring afresh', () => {
  const { clock, at } = fakeClock()
  at(5000)
  assert.equal(clock.revealDelay(), LOADER_DELAY_MS)
  at(5300)
  assert.equal(clock.ringPhase(false), 0)
  clock.shown()
  // While it's up, another loader (a skeleton) shows at once.
  at(5400)
  assert.equal(clock.revealDelay(), 0)
  clock.hidden()
  at(5400 + HANDOVER_MS + 1)
  assert.equal(clock.revealDelay(), LOADER_DELAY_MS)
})

test('loader clock: counts loaders on screen, never below zero', () => {
  const { clock, at } = fakeClock()
  at(0)
  clock.shown()
  clock.shown()
  at(1000)
  clock.hidden()
  at(5000)
  assert.equal(clock.revealDelay(), 0) // one still up
  clock.hidden()
  clock.hidden() // an extra hide (StrictMode double effects) is harmless
  at(9000)
  assert.equal(clock.revealDelay(), LOADER_DELAY_MS)
})

// ---- mark geometry ------------------------------------------------------------

const svg = readFileSync(new URL('../public/budgeer-mark.svg', import.meta.url), 'utf8')
const attrs = (tag) => [...svg.matchAll(new RegExp(`<${tag}\\b([^>]*)>`, 'g'))]
  .map((m) => Object.fromEntries([...m[1].matchAll(/([\w-]+)="([^"]*)"/g)].map((a) => [a[1], a[2]])))

test('markGeometry matches public/budgeer-mark.svg', () => {
  const [rect] = attrs('rect')
  assert.deepEqual([+rect.x, +rect.y, +rect.width, +rect.height, +rect.rx],
    [MARK.stem.x, MARK.stem.y, MARK.stem.w, MARK.stem.h, MARK.stem.w / 2])
  const [amber, coral] = attrs('circle')
  for (const c of [amber, coral]) {
    assert.deepEqual([+c.cx, +c.cy, +c.r], [MARK.ring.cx, MARK.ring.cy, MARK.ring.r])
  }
  assert.match(svg, new RegExp(`stroke-width="${MARK.ring.width}"`))
  const circ = circumference(MARK.ring.r)
  const [amberLen] = amber['stroke-dasharray'].split(' ').map(Number)
  const [coralLen] = coral['stroke-dasharray'].split(' ').map(Number)
  const coralFrom = -Number(coral['stroke-dashoffset'])
  const near = (a, b) => assert.ok(Math.abs(a - b) < 0.2, `${a} ≈ ${b}`)
  near(MARK_ARCS.amber[0] * circ, 0)
  near((MARK_ARCS.amber[1] - MARK_ARCS.amber[0]) * circ, amberLen)
  near(MARK_ARCS.coral[0] * circ, coralFrom)
  near((MARK_ARCS.coral[1] - MARK_ARCS.coral[0]) * circ, coralLen)
})

// ---- the ring's markup and stylesheet ----------------------------------------

test('markTree: a decorative svg of the whole mark, sized as asked', () => {
  const html = toHtml(markTree(40))
  assert.match(html, /^<svg class="rl-mark" width="40" height="40" viewBox="0 0 48 48"/)
  assert.match(html, /aria-hidden="true"/)
  assert.match(html, /focusable="false"/)
  for (const part of ['rl-stem', 'rl-track', 'rl-amber', 'rl-coral']) assert.match(html, new RegExp(`class="${part}"`))
  // The static attributes draw the full mark (what reduced motion shows).
  assert.match(html, /class="rl-amber"[^>]*stroke-dasharray="19\.01 50\.11"/)
  assert.match(html, /class="rl-coral"[^>]*stroke-dasharray="48\.11 21\.01" stroke-dashoffset="-21\.01"/)
  assert.match(toHtml(markTree('1em', { mono: true })), /^<svg class="rl-mark rl-mono" width="1em"/)
})

test('the full-screen loader: a status with a hidden label, or a visible caption', () => {
  const html = bootLoaderHtml()
  assert.match(html, /^<div class="rl-screen" role="status"><svg class="rl-mark" width="84"/)
  assert.match(html, /<span class="rl-word" aria-hidden="true">budgeer<\/span>/)
  assert.match(html, new RegExp(`<span class="rl-sr">${LOADING_LABEL}</span></div>$`))
  const captioned = toHtml(screenTree({ caption: 'Loading invite…' }))
  assert.match(captioned, /<span class="rl-caption">Loading invite…<\/span><\/div>$/)
  assert.doesNotMatch(captioned, /rl-sr/)
})

test('toHtml escapes text and attribute values', () => {
  assert.equal(toHtml(['span', { title: 'a "b" & <c>' }, ['<x> & y']]),
    '<span title="a &quot;b&quot; &amp; &lt;c&gt;">&lt;x&gt; &amp; y</span>')
})

test('RING_LOADER_CSS: theme colours in light and dark, and a still ring for reduced motion', () => {
  const css = RING_LOADER_CSS
  assert.match(css, new RegExp(`--rl-coral:${colors.brand[500]}`))
  assert.match(css, new RegExp(`--rl-amber:${colors.amber[400]}`))
  assert.match(css, new RegExp(`:root\\{[^}]*--rl-canvas:${colors.sand[50]}`))
  // Dark follows the OS until the app picks a mode, and the app's choice after.
  assert.match(css, new RegExp(`@media \\(prefers-color-scheme:dark\\)\\{:root:not\\(\\[data-theme=light\\]\\)\\{[^}]*--rl-canvas:${DARK.canvas}`))
  assert.match(css, new RegExp(`:root\\[data-theme=dark\\]\\{[^}]*--rl-track:${DARK.subtle}`))
  assert.match(css, /@media \(prefers-reduced-motion:reduce\)\{\.rl-stem,\.rl-amber,\.rl-coral,\.rl-word\{animation:none\}\}/)
  // Every animation takes the shared phase, so a take-over stays in step.
  const loops = css.match(/animation:rl-[\w-]+ [^;}]*/g)
  assert.equal(loops.length, 4)
  for (const a of loops) assert.match(a, new RegExp(`${RING_CYCLE_MS}ms .* var\\(--rl-phase,0ms\\) infinite`))
  // Stem breathes from its foot.
  assert.match(css, new RegExp(`transform-origin:${MARK.stem.x + MARK.stem.w / 2}px ${MARK.stem.y + MARK.stem.h}px`))
})

// ---- colour-mode boot script ------------------------------------------------

const bootScript = readFileSync(new URL('../public/theme-boot.js', import.meta.url), 'utf8')

function runBoot({ pref = null, osDark = false, storageThrows = false } = {}) {
  const html = { attrs: {}, style: {}, setAttribute(k, v) { this.attrs[k] = v } }
  const window = {
    localStorage: {
      getItem(key) {
        if (storageThrows) throw new Error('SecurityError')
        return key === STORAGE_KEYS.appearance ? pref : null
      },
    },
    matchMedia: (q) => ({ matches: q === '(prefers-color-scheme: dark)' && osDark }),
  }
  runInNewContext(bootScript, { window, document: { documentElement: html } })
  return { theme: html.attrs['data-theme'], scheme: html.style.colorScheme }
}

test('theme-boot.js: the saved choice wins, System follows the OS', () => {
  assert.match(bootScript, new RegExp(`'${STORAGE_KEYS.appearance}'`))
  assert.deepEqual(runBoot({ pref: 'dark' }), { theme: 'dark', scheme: 'dark' })
  assert.deepEqual(runBoot({ pref: 'light', osDark: true }), { theme: 'light', scheme: 'light' })
  assert.deepEqual(runBoot({ pref: 'system', osDark: true }), { theme: 'dark', scheme: 'dark' })
  assert.deepEqual(runBoot({ pref: null, osDark: false }), { theme: 'light', scheme: 'light' })
})

test('theme-boot.js: blocked storage leaves <html> alone (the CSS follows the OS)', () => {
  assert.deepEqual(runBoot({ storageThrows: true, osDark: true }), { theme: undefined, scheme: undefined })
})
