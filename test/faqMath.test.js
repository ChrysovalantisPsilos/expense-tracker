import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  normalizeText, filterFaq, countItems, anchorFromHash, openIndexes, applyOpenIndexes, questionLink,
} from '../src/features/help/faqMath.js'
import { FAQ_SECTIONS } from '../src/features/help/faqContent.js'

const SECTIONS = [
  { id: 'money', title: 'Currencies', items: [
    { id: 'fx', q: 'Can I pay in dollars?', a: ['Yes, at the ECB rate.'] },
    { id: 'main', q: 'Main currency?', a: ['Settings → Account.'] },
  ] },
  { id: 'help', title: 'Troubleshooting', items: [
    { id: 'push', q: 'I don’t get notifications.', a: ['Check the café settings.'] },
  ] },
]

test('normalizeText lowercases, strips accents and flattens quotes', () => {
  assert.equal(normalizeText('  Café  DON’T\n'), "cafe don't")
  assert.equal(normalizeText(null), '')
})

test('an empty or blank query returns every section unchanged', () => {
  assert.equal(filterFaq(SECTIONS, ''), SECTIONS)
  assert.equal(filterFaq(SECTIONS, '   '), SECTIONS)
})

test('every query word must match the question, answer or section title', () => {
  assert.deepEqual(filterFaq(SECTIONS, 'ecb dollars').flatMap((s) => s.items.map((i) => i.id)), ['fx'])
  // "currencies" is the section title, so both of its questions match
  assert.equal(countItems(filterFaq(SECTIONS, 'currencies')), 2)
  assert.deepEqual(filterFaq(SECTIONS, 'ecb notifications'), [])
})

test('search ignores case, accents and apostrophe style', () => {
  assert.deepEqual(filterFaq(SECTIONS, "DON'T").map((s) => s.id), ['help'])
  assert.deepEqual(filterFaq(SECTIONS, 'CAFE').map((s) => s.id), ['help'])
})

test('sections with no matches are dropped, and the input is not mutated', () => {
  const out = filterFaq(SECTIONS, 'dollars')
  assert.deepEqual(out.map((s) => s.id), ['money'])
  assert.equal(SECTIONS[0].items.length, 2)
})

test('anchorFromHash accepts only known, well-formed ids', () => {
  assert.equal(anchorFromHash('#fx', SECTIONS), 'fx')
  assert.equal(anchorFromHash('push', SECTIONS), 'push')
  assert.equal(anchorFromHash('', SECTIONS), null)
  assert.equal(anchorFromHash('#nope', SECTIONS), null)
  assert.equal(anchorFromHash('#FX', SECTIONS), null)
  assert.equal(anchorFromHash('#%E0%A4%A', SECTIONS), null) // malformed escape
  assert.equal(anchorFromHash('#fx"><script>', SECTIONS), null)
  assert.equal(anchorFromHash(undefined, SECTIONS), null)
})

test('openIndexes maps open ids to accordion positions', () => {
  const items = SECTIONS[0].items
  assert.deepEqual(openIndexes(items, new Set()), [])
  assert.deepEqual(openIndexes(items, new Set(['main', 'push'])), [1])
})

test('applyOpenIndexes updates one section and leaves the others alone', () => {
  const items = SECTIONS[0].items
  const before = new Set(['fx', 'push'])
  const after = applyOpenIndexes(before, items, [1])
  assert.deepEqual([...after].sort(), ['main', 'push'])
  assert.deepEqual([...before].sort(), ['fx', 'push']) // not mutated
})

test('questionLink builds a shareable deep link', () => {
  assert.equal(questionLink('https://budgeer.com', '/help', 'fx'), 'https://budgeer.com/help#fx')
})

test('the FAQ content is well formed: unique anchor ids, non-empty questions and answers', () => {
  const ids = FAQ_SECTIONS.flatMap((s) => s.items.map((i) => i.id))
  assert.equal(new Set(ids).size, ids.length, 'question ids are unique')
  assert.equal(new Set(FAQ_SECTIONS.map((s) => s.id)).size, FAQ_SECTIONS.length, 'section ids are unique')
  for (const id of ids) assert.equal(anchorFromHash(`#${id}`, FAQ_SECTIONS), id, id)
  for (const s of FAQ_SECTIONS) {
    assert.ok(s.title && s.items.length > 0, s.id)
    for (const i of s.items) {
      assert.ok(i.q.trim().length > 0, i.id)
      assert.ok(Array.isArray(i.a) && i.a.length > 0 && i.a.every((p) => p.trim().length > 0), i.id)
    }
  }
  assert.ok(ids.length >= 30 && ids.length <= 40, `${ids.length} questions`)
})
