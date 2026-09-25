import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  SHORT_LANDSCAPE, SHORT_LANDSCAPE_MAX_HEIGHT, SHORT_LANDSCAPE_QUERY, landscapeOnly, ONE_LINE,
  RAIL_W, HEADER_H, CONTENT_MAX_W, GUTTER, STACK_GAP, RAIL_BOX, COLUMN_BOX,
  ROW_INLINE_ACTIONS_MIN, NOTCH_ALLOWANCE, stackActionsInlineFrom, NARROW_STACK,
} from '../src/shared/lib/shortLandscape.js'

// Evaluates the query the way a browser would, for the only two features it
// may use (anything else fails the parse, so a width test can't sneak in).
function matches(query, { width, height }, { allowWidth = false } = {}) {
  const features = query.split(' and ').map((f) => f.trim())
  return features.every((f) => {
    if (f === '(orientation: landscape)') return width > height
    const max = /^\(max-height: (\d+)px\)$/.exec(f)
    if (max) return height <= Number(max[1])
    const maxW = /^\(max-width: (\d+)px\)$/.exec(f)
    if (maxW && allowWidth) return width <= Number(maxW[1])
    throw new Error(`unexpected media feature ${f}`)
  })
}

test('the style key is the hook’s query as an @media rule', () => {
  assert.equal(SHORT_LANDSCAPE, `@media ${SHORT_LANDSCAPE_QUERY}`)
  assert.match(SHORT_LANDSCAPE_QUERY, /orientation: landscape/)
  assert.match(SHORT_LANDSCAPE_QUERY, new RegExp(`max-height: ${SHORT_LANDSCAPE_MAX_HEIGHT}px`))
})

test('phones held sideways match', () => {
  for (const vp of [
    { width: 844, height: 390 }, // iPhone 14
    { width: 932, height: 430 }, // iPhone 15 Pro Max
    { width: 667, height: 375 }, // iPhone SE
    { width: 915, height: 412 }, // Pixel / Galaxy
    { width: 740, height: 360 },
  ]) assert.equal(matches(SHORT_LANDSCAPE_QUERY, vp), true, `${vp.width}×${vp.height}`)
})

test('desktops, tablets and portrait phones keep their layout', () => {
  for (const vp of [
    { width: 1280, height: 800 },
    { width: 1440, height: 900 },
    { width: 1024, height: 768 }, // iPad landscape
    { width: 1180, height: 820 },
    { width: 768, height: 1024 }, // iPad portrait
    { width: 390, height: 844 }, // phone portrait
    { width: 375, height: 667 },
    { width: 430, height: 430 }, // square: not landscape
  ]) assert.equal(matches(SHORT_LANDSCAPE_QUERY, vp), false, `${vp.width}×${vp.height}`)
})

test('landscapeOnly keys a style to the query; ONE_LINE cuts with an ellipsis', () => {
  assert.deepEqual(landscapeOnly({ p: 4 }), { [SHORT_LANDSCAPE]: { p: 4 } })
  assert.deepEqual(ONE_LINE, { whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' })
})

test('the shell: a 64px rail and a ~52px header over a centred 720px column', () => {
  assert.equal(RAIL_W, 64)
  assert.equal(HEADER_H, 52)
  assert.equal(CONTENT_MAX_W, 720)
  // The rail grows by the notch's inset and pads it (no blank band), and
  // clears the home indicator.
  assert.equal(RAIL_BOX.w, 'calc(64px + env(safe-area-inset-left, 0px))')
  assert.equal(RAIL_BOX.pl, 'env(safe-area-inset-left, 0px)')
  assert.match(RAIL_BOX.pb, /env\(safe-area-inset-bottom, 0px\)/)
  // The column: gutters inside the cap, the right inset and home indicator cleared.
  assert.equal(COLUMN_BOX.maxW, `calc(${CONTENT_MAX_W + 2 * GUTTER}px + env(safe-area-inset-right, 0px))`)
  assert.equal(COLUMN_BOX.pl, `${GUTTER}px`)
  assert.match(COLUMN_BOX.pr, /env\(safe-area-inset-right, 0px\)/)
  assert.match(COLUMN_BOX.pb, /env\(safe-area-inset-bottom, 0px\)/)
})

// One of Home's two stacks on a screen `w` wide, beside `insets` of notch.
const stack = (w, insets = 0) => (Math.min(w - RAIL_W - insets - 2 * GUTTER, CONTENT_MAX_W) - STACK_GAP) / 2

test('rows in a stack fold their actions only where the stack may be too narrow', () => {
  const from = stackActionsInlineFrom()
  // The first width that fits even beside a notch on both sides.
  assert.equal(stack(from, NOTCH_ALLOWANCE), ROW_INLINE_ACTIONS_MIN)
  assert.ok(stack(from - 1, NOTCH_ALLOWANCE) < ROW_INLINE_ACTIONS_MIN)
  assert.ok(NOTCH_ALLOWANCE >= 2 * 44)
  const narrow = SHORT_LANDSCAPE_QUERY + ` and (max-width: ${from - 1}px)`
  assert.equal(NARROW_STACK, `@media ${narrow}`)
  // An iPhone SE, and a notched mini (812 less its insets), fold.
  for (const [vp, insets] of [[{ width: 667, height: 375 }, 0], [{ width: 812, height: 375 }, 88]]) {
    assert.equal(matches(narrow, vp, { allowWidth: true }), true, `${vp.width}`)
    assert.ok(stack(vp.width, insets) < ROW_INLINE_ACTIONS_MIN)
  }
  // The larger phones keep their buttons, notch or not (iPhone 14: 47px a side).
  for (const vp of [{ width: 844, height: 390 }, { width: 932, height: 430 }, { width: 915, height: 412 }]) {
    assert.equal(matches(narrow, vp, { allowWidth: true }), false, `${vp.width}`)
    assert.ok(stack(vp.width, 2 * 47) >= ROW_INLINE_ACTIONS_MIN, `${vp.width}`)
  }
  // Never outside sideways: a narrow portrait phone or a desktop window.
  assert.equal(matches(narrow, { width: 390, height: 844 }, { allowWidth: true }), false)
  assert.equal(matches(narrow, { width: 700, height: 800 }, { allowWidth: true }), false)
})
