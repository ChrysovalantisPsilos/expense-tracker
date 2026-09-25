import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  SHORT_LANDSCAPE, SHORT_LANDSCAPE_MAX_HEIGHT, SHORT_LANDSCAPE_QUERY,
} from '../src/shared/lib/shortLandscape.js'

// Evaluates the query the way a browser would, for the only two features it
// may use (anything else fails the parse, so a width test can't sneak in).
function matches(query, { width, height }) {
  const features = query.split(' and ').map((f) => f.trim())
  return features.every((f) => {
    if (f === '(orientation: landscape)') return width > height
    const max = /^\(max-height: (\d+)px\)$/.exec(f)
    if (max) return height <= Number(max[1])
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
