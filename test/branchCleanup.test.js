import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { branchesToDelete, MIN_AGE_MS } from '../scripts/branch-cleanup.mjs'

const now = Date.parse('2026-09-28T12:00:00Z')
const old = now - 2 * MIN_AGE_MS
const b = (name, extra = {}) => ({ name, sha: `sha-${name}`, merged: true, committedAt: old, ...extra })

test('deletes branches whose work is already in develop', () => {
  assert.deepEqual(branchesToDelete([b('plan-ideas'), b('i18n')], { developSha: 'dev', now }), ['i18n', 'plan-ideas'])
})

test('never deletes main, develop, HEAD or a keep/ branch', () => {
  const list = [b('main'), b('develop'), b('HEAD'), b('keep/experiment')]
  assert.deepEqual(branchesToDelete(list, { developSha: 'dev', now }), [])
})

test('keeps a branch with work develop does not have', () => {
  assert.deepEqual(branchesToDelete([b('wip', { merged: false })], { developSha: 'dev', now }), [])
})

test('keeps a branch just made from develop (same tip) and anything younger than a day', () => {
  const list = [
    b('fresh', { sha: 'dev' }),
    b('recent', { committedAt: now - MIN_AGE_MS + 1 }),
    b('no-date', { committedAt: NaN }),
  ]
  assert.deepEqual(branchesToDelete(list, { developSha: 'dev', now }), [])
  assert.deepEqual(branchesToDelete([b('day-old', { committedAt: now - MIN_AGE_MS })], { developSha: 'dev', now }), ['day-old'])
})

test('the workflow runs the script with write access, daily and by hand (not on every push)', () => {
  const wf = readFileSync(new URL('../.github/workflows/branch-cleanup.yml', import.meta.url), 'utf8')
  assert.match(wf, /contents: write/)
  assert.doesNotMatch(wf, /^\s+push:/m)
  assert.match(wf, /schedule:/)
  assert.match(wf, /workflow_dispatch:/)
  assert.match(wf, /node scripts\/branch-cleanup\.mjs/)
  assert.match(wf, /fetch-depth: 0/)
})
