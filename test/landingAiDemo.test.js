import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  DEMO_TODAY, FORM_FIELDS, TYPE_IT_EXAMPLES, TYPE_IT_TIMING,
  fieldsFor, loopMs, restFrameIndex, typeItFrames,
} from '../src/features/landing/aiDemo.js'
import en from '../src/locales/en/landing.js'
import el from '../src/locales/el/landing.js'

const lengthsIn = (dict) => TYPE_IT_EXAMPLES.map((ex) => dict.demo.ai.lines[ex.id].length)

test('Type it examples: an expense (with Paid from) then an income, each with its words in both languages', () => {
  assert.deepEqual(TYPE_IT_EXAMPLES.map((ex) => ex.kind), ['expense', 'income'])
  for (const ex of TYPE_IT_EXAMPLES) {
    assert.ok(Number.isInteger(ex.amountMinor) && ex.amountMinor > 0)
    assert.ok(ex.date <= DEMO_TODAY)
    for (const dict of [en, el]) {
      assert.ok(dict.demo.ai.lines[ex.id], `${ex.id} line`)
      assert.ok(dict.demo.ai.descriptions[ex.id], `${ex.id} description`)
      assert.ok(dict.demo.categories[ex.category], `${ex.id} category`)
    }
  }
  assert.deepEqual(fieldsFor(TYPE_IT_EXAMPLES[0]), FORM_FIELDS)
  assert.ok(!fieldsFor(TYPE_IT_EXAMPLES[1]).includes('paidFrom'), 'an income has no Paid from')
})

test('typeItFrames: types one character at a time, then Filling in, then the fields one by one', () => {
  const lengths = [5, 3]
  const frames = typeItFrames(lengths)
  TYPE_IT_EXAMPLES.forEach((ex, i) => {
    const own = frames.filter((f) => f.example === i)
    const typing = own.filter((f) => f.stage === 'typing')
    assert.deepEqual(typing.map((f) => f.typed), [...Array(lengths[i] + 1).keys()])
    const filling = own.filter((f) => f.stage === 'filling')
    assert.equal(filling.length, 1)
    assert.equal(filling[0].typed, lengths[i])
    const filled = own.filter((f) => f.stage === 'filled')
    assert.deepEqual(filled.map((f) => f.filled), fieldsFor(ex).map((_, n) => n + 1))
    // In order: typing, filling, filled.
    const order = own.map((f) => f.stage).filter((s, k, a) => s !== a[k - 1])
    assert.deepEqual(order, ['typing', 'filling', 'filled'])
    // The filled form is held longest.
    assert.equal(filled.at(-1).ms, TYPE_IT_TIMING.hold)
  })
  for (const f of frames) assert.ok(f.ms > 0)
})

test('typeItFrames: the loop lasts 10–15 s in both languages', () => {
  for (const dict of [en, el]) {
    const ms = loopMs(typeItFrames(lengthsIn(dict)))
    assert.ok(ms >= 10000 && ms <= 15000, `${ms} ms`)
  }
})

test('restFrameIndex: reduced motion rests on the first line with the whole form filled', () => {
  const frames = typeItFrames(lengthsIn(en))
  const rest = frames[restFrameIndex(frames)]
  assert.equal(rest.example, 0)
  assert.equal(rest.stage, 'filled')
  assert.equal(rest.typed, en.demo.ai.lines.coffee.length)
  assert.equal(rest.filled, fieldsFor(TYPE_IT_EXAMPLES[0]).length)
})
