import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  COMPARED_APPS, COMPARISON_CAVEAT, COMPARISON_CHECKED, COMPARISON_INTRO, COMPARISON_POINTS,
  COMPARISON_TITLE, comparisonFaqAnswer, sourceLabel,
} from '../src/features/landing/comparison.js'
import { FAQ_SECTIONS } from '../src/features/help/faqContent.js'

const facts = COMPARED_APPS.flatMap((app) => app.facts.map((f) => ({ app: app.name, ...f })))

test('every competitor fact cites an https source and the shared checked date', () => {
  assert.ok(facts.length > 0)
  for (const f of facts) {
    const url = new URL(f.url)
    assert.equal(url.protocol, 'https:', `${f.app}: ${f.url}`)
    assert.equal(f.checked, COMPARISON_CHECKED.iso, `${f.app}: ${f.text}`)
    assert.ok(f.text.trim().length > 0)
  }
})

test('the checked date is a real calendar day matching its label', () => {
  const { iso, label } = COMPARISON_CHECKED
  assert.match(iso, /^\d{4}-\d{2}-\d{2}$/)
  const d = new Date(`${iso}T12:00:00Z`)
  assert.equal(d.toISOString().slice(0, 10), iso)
  const month = d.toLocaleString('en-GB', { month: 'long', timeZone: 'UTC' })
  assert.equal(label, `${month} ${d.getUTCFullYear()}`)
})

test('every compared app has facts, and no fact is listed twice', () => {
  for (const app of COMPARED_APPS) assert.ok(app.facts.length > 0, app.name)
  assert.equal(new Set(facts.map((f) => f.text)).size, facts.length)
})

test('the copy stays factual: no superlatives or put-downs', () => {
  const copy = [COMPARISON_INTRO, COMPARISON_CAVEAT.body, ...COMPARISON_POINTS.map((p) => p.body),
    ...COMPARISON_POINTS.map((p) => p.title), ...facts.map((f) => f.text)].join(' ')
  assert.doesNotMatch(copy, /\b(best|better than|beats?|cheapest|worst|only app|#1)\b/i)
})

test('sourceLabel shows the host without www', () => {
  assert.equal(sourceLabel('https://www.ynab.com/pricing'), 'ynab.com')
  assert.equal(sourceLabel('https://kb.splitwise.com/pro/what-is-splitwise-pro'), 'kb.splitwise.com')
})

test('the FAQ answer is built from the same points as the landing section', () => {
  const answer = comparisonFaqAnswer()
  assert.equal(answer[0], COMPARISON_INTRO)
  for (const p of COMPARISON_POINTS) assert.ok(answer.includes(`${p.title}. ${p.body}`), p.id)
  assert.ok(answer.some((a) => a.includes(COMPARISON_CAVEAT.body)))
  assert.ok(answer.at(-1).includes(COMPARISON_CHECKED.label))
  const item = FAQ_SECTIONS.find((s) => s.id === 'getting-started').items
    .find((i) => i.id === 'compared-to-others')
  assert.equal(item.q, COMPARISON_TITLE)
  assert.deepEqual(item.a, answer)
})
