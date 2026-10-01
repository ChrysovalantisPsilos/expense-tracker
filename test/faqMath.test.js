import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, statSync } from 'node:fs'
import {
  normalizeText, filterFaq, countItems, anchorFromHash, openIndexes, applyOpenIndexes, questionLink,
  clipSources,
} from '../src/features/help/faqMath.js'
import { FAQ_SECTIONS, faqSections } from '../src/features/help/faqContent.js'

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
  assert.equal(questionLink('https://www.budgeer.com', '/help', 'fx'), 'https://www.budgeer.com/help#fx')
})

test('search also finds a question by its steps and its clip description', () => {
  const sections = [{ id: 's', title: 'Setup', items: [
    { id: 'ios', q: 'On an iPhone?', a: ['Use Safari:'], steps: ['Tap Share.', 'Tap Add to Home Screen.'] },
    { id: 'clip', q: 'Settle?', a: ['Tap Settle up.'], media: { type: 'clip', name: 'x', alt: 'Recording a Revolut payment' } },
  ] }]
  assert.deepEqual(filterFaq(sections, 'home screen').flatMap((s) => s.items.map((i) => i.id)), ['ios'])
  assert.deepEqual(filterFaq(sections, 'revolut').flatMap((s) => s.items.map((i) => i.id)), ['clip'])
})

test('clipSources points at the WebM and its poster frame under /help', () => {
  assert.deepEqual(clipSources('settle-up'), {
    video: '/faq-media/settle-up.webm', mp4: '/faq-media/settle-up.mp4', poster: '/faq-media/settle-up.jpg',
  })
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
  assert.ok(ids.length >= 30 && ids.length <= 50, `${ids.length} questions`)
})

const INSTALL_PLATFORMS = ['iphone', 'android', 'samsung', 'desktop']

test('FAQ media is well formed: known install platforms, and every clip is on disk, small and described', () => {
  const items = FAQ_SECTIONS.flatMap((s) => s.items)
  for (const i of items) {
    if (i.steps) assert.ok(i.steps.length > 0 && i.steps.every((p) => p.trim().length > 0), i.id)
    if (!i.media) continue
    if (i.media.type === 'install') {
      assert.ok(INSTALL_PLATFORMS.includes(i.media.platform), `${i.id}: ${i.media.platform}`)
      continue
    }
    assert.equal(i.media.type, 'clip', i.id)
    assert.ok(i.media.alt?.trim().length > 20, `${i.id}: clip needs a description`)
    for (const file of Object.values(clipSources(i.media.name))) {
      const path = new URL(`../public${file}`, import.meta.url)
      assert.ok(existsSync(path), `${i.id}: ${file} is missing`)
      // Clips aren't precached; keep each one light for phones on data.
      assert.ok(statSync(path).size < 300 * 1024, `${i.id}: ${file} is over 300 KB`)
    }
  }
  const platforms = items.filter((i) => i.media?.type === 'install').map((i) => i.media.platform)
  assert.deepEqual([...platforms].sort(), [...INSTALL_PLATFORMS].sort(), 'one install guide per platform')
})

test('faqSections: every section for no query, the matching ones in words for a query', () => {
  assert.equal(faqSections(), FAQ_SECTIONS)
  const found = faqSections('passkey')
  assert.ok(found.length > 0 && found.every((s) => s.items.length > 0))
  assert.ok(found.flatMap((s) => s.items).some((i) => i.id === 'passkeys'))
  // As JSON (the native app's core): the words are there, not getters.
  const json = JSON.parse(JSON.stringify(faqSections()))
  assert.equal(json[0].title, FAQ_SECTIONS[0].title)
  assert.equal(json[0].items[0].q, FAQ_SECTIONS[0].items[0].q)
  assert.deepEqual(json[0].items[0].a, FAQ_SECTIONS[0].items[0].a)
})
