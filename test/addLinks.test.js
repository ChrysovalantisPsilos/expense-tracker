import { test } from 'node:test'
import assert from 'node:assert/strict'
import { addEntryLink, parseAddParams, recurringNewLink } from '../src/shared/lib/addLinks.js'

const q = (s) => new URLSearchParams(s)

test('addEntryLink: a plain expense is the bare Add page', () => {
  assert.equal(addEntryLink(), '/transactions/new')
  assert.equal(addEntryLink({ kind: 'expense' }), '/transactions/new')
  assert.equal(addEntryLink({ kind: null }), '/transactions/new')
})

test('addEntryLink: income, a category and Repeat on', () => {
  assert.equal(addEntryLink({ kind: 'income' }), '/transactions/new?kind=income')
  assert.equal(addEntryLink({ kind: 'income', category: 'c1' }), '/transactions/new?kind=income&category=c1')
  assert.equal(addEntryLink({ repeat: true }), '/transactions/new?repeat=1')
  assert.equal(addEntryLink({ kind: 'income', category: 's1', repeat: true }),
    '/transactions/new?kind=income&category=s1&repeat=1')
  assert.equal(addEntryLink({ kind: 'income', category: null, repeat: false }), '/transactions/new?kind=income')
})

test('parseAddParams: reads what addEntryLink writes; anything else is the default', () => {
  assert.deepEqual(parseAddParams(q('')), { kind: 'expense', category: null, repeat: false })
  assert.deepEqual(parseAddParams(q('kind=income&category=s1&repeat=1')), { kind: 'income', category: 's1', repeat: true })
  assert.deepEqual(parseAddParams(q('kind=bogus&repeat=yes')), { kind: 'expense', category: null, repeat: false })
  for (const link of [{}, { kind: 'income', repeat: true }, { category: 'c9' }]) {
    const back = parseAddParams(q(addEntryLink(link).split('?')[1] ?? ''))
    assert.deepEqual(back, { kind: link.kind ?? 'expense', category: link.category ?? null, repeat: !!link.repeat })
  }
})

test('recurringNewLink: an old /recurring/new link opens Add with Repeat on, keeping its kind', () => {
  assert.equal(recurringNewLink(q('')), '/transactions/new?repeat=1')
  assert.equal(recurringNewLink(q('kind=expense')), '/transactions/new?repeat=1')
  assert.equal(recurringNewLink(q('kind=income')), '/transactions/new?kind=income&repeat=1')
})
