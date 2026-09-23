import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  textColor, fillColor, tileColor, shareSwatch, barWidth, trendHeights, signedAmount, playProps,
  nextPhase,
} from '../src/shared/ui/kit/kitMath.js'

test('textColor / fillColor: known tones map to theme tokens, unknown fall back', () => {
  assert.equal(textColor('positive'), 'status.positive')
  assert.equal(textColor('accent'), 'accent.fg')
  assert.equal(textColor(undefined), 'text.primary')
  assert.equal(textColor('nope'), 'text.primary')
  assert.equal(fillColor('negative'), 'red.400')
  assert.equal(fillColor('warning'), 'status.warning')
  assert.equal(fillColor(undefined), 'brand.500')
})

test('tileColor: sand for every tone except a pale red danger tile', () => {
  assert.equal(tileColor('negative'), 'status.negativeSubtle')
  assert.equal(tileColor('accent'), 'bg.subtle')
  assert.equal(tileColor('positive'), 'bg.subtle')
  assert.equal(tileColor(undefined), 'bg.subtle')
})

test('shareSwatch: coral/amber by position, wraps, and Other is always muted', () => {
  assert.deepEqual([0, 1, 2, 3].map((i) => shareSwatch(i, 'x')), ['brand.500', 'amber.400', 'brand.300', 'amber.600'])
  assert.equal(shareSwatch(7, 'x'), 'brand.500')
  assert.equal(shareSwatch(0, 'Other'), 'text.muted')
  assert.equal(shareSwatch(4, 'Other'), 'text.muted')
})

test('barWidth: clamps to 0..100 and tolerates bad input', () => {
  assert.equal(barWidth(78), '78%')
  assert.equal(barWidth(125), '100%')
  assert.equal(barWidth(-5), '0%')
  assert.equal(barWidth(NaN), '0%')
  assert.equal(barWidth(undefined), '0%')
})

test('trendHeights: relative to the peak with headroom; zeros and empty series', () => {
  assert.deepEqual(trendHeights([50, 100, 25]), ['42.5%', '85%', '21.25%'])
  assert.deepEqual(trendHeights([1, 2], 100), ['50%', '100%'])
  assert.deepEqual(trendHeights([0, 0]), ['0%', '0%'])
  assert.deepEqual(trendHeights([-10, 20]), ['0%', '85%'])
  assert.deepEqual(trendHeights([]), [])
})

test('signedAmount: +/− (true minus) with tone; zero is muted and unsigned', () => {
  const fmt = (m) => `€${(m / 100).toFixed(2)}`
  assert.deepEqual(signedAmount(16275, fmt), { text: '+€162.75', tone: 'positive' })
  assert.deepEqual(signedAmount(-285, fmt), { text: '−€2.85', tone: 'negative' })
  assert.deepEqual(signedAmount(0, fmt), { text: '€0.00', tone: 'muted' })
})

test('playProps: static without playback or under reduced motion; gated by inView', () => {
  const from = { width: 0 }; const to = { width: '50%' }; const tr = { duration: 1 }
  assert.deepEqual(playProps(undefined, from, to, tr), { initial: false, animate: to })
  assert.deepEqual(playProps({ reduce: true, inView: false }, from, to, tr), { initial: false, animate: to })
  assert.deepEqual(playProps({ reduce: false, inView: false }, from, to, tr), { initial: from, animate: from, transition: tr })
  assert.deepEqual(playProps({ reduce: false, inView: true }, from, to, tr), { initial: from, animate: to, transition: tr })
})

test('nextPhase: steps through and wraps to the start', () => {
  assert.equal(nextPhase(0, 3), 1)
  assert.equal(nextPhase(1, 3), 2)
  assert.equal(nextPhase(2, 3), 0)
  assert.equal(nextPhase(0, 1), 0)
  assert.equal(nextPhase(4, 0), 0)
})
