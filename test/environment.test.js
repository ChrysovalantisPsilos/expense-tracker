import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  LIVE, TEST, detectEnvironment, otherEnvironment, otherSiteUrl, devTitle, faviconFor, markEnvironment,
} from '../src/shared/lib/environment.js'

const PROD_URL = 'https://tuxfpylowcxazinqtrzx.supabase.co'
const TEST_URL = 'https://ctvdljzybbujuywppixo.supabase.co'

test('the Supabase project decides the environment', () => {
  assert.equal(detectEnvironment({ supabaseUrl: PROD_URL }), LIVE)
  assert.equal(detectEnvironment({ supabaseUrl: `${PROD_URL}/` }), LIVE)
  assert.equal(detectEnvironment({ supabaseUrl: TEST_URL }), TEST)
  // Even on the live host, TEST data means the test site (and vice versa).
  assert.equal(detectEnvironment({ host: 'budgeer.com', supabaseUrl: TEST_URL }), TEST)
  assert.equal(detectEnvironment({ host: 'localhost:5173', supabaseUrl: PROD_URL }), LIVE)
})

test('the host decides when the project is unknown; anything else is test', () => {
  assert.equal(detectEnvironment({ host: 'budgeer.com' }), LIVE)
  assert.equal(detectEnvironment({ host: 'WWW.Budgeer.com' }), LIVE)
  assert.equal(detectEnvironment({ host: 'dev.budgeer.com' }), TEST)
  assert.equal(detectEnvironment({ host: 'localhost:5173' }), TEST)
  assert.equal(detectEnvironment({ host: 'budgeer-git-x.vercel.app' }), TEST)
  assert.equal(detectEnvironment({ host: 'evil-budgeer.com', supabaseUrl: 'https://x.supabase.co.evil' }), TEST)
  assert.equal(detectEnvironment(), TEST)
})

test('otherEnvironment flips', () => {
  assert.equal(otherEnvironment(LIVE), TEST)
  assert.equal(otherEnvironment(TEST), LIVE)
})

test('the other site keeps the current path and query', () => {
  assert.equal(otherSiteUrl(LIVE, { pathname: '/', search: '' }), 'https://dev.budgeer.com/')
  assert.equal(otherSiteUrl(TEST, { pathname: '/settings/data', search: '' }), 'https://www.budgeer.com/settings/data')
  assert.equal(otherSiteUrl(LIVE, { pathname: '/transactions', search: '?type=expense&from=2026-09-01' }),
    'https://dev.budgeer.com/transactions?type=expense&from=2026-09-01')
  assert.equal(otherSiteUrl(TEST, { pathname: '/transactions/new', search: '?kind=income' }),
    'https://www.budgeer.com/transactions/new?kind=income')
  assert.equal(otherSiteUrl(LIVE), 'https://dev.budgeer.com/')
})

test('id pages go to their list on the other site', () => {
  const id = '3f1c2a9e-8b7d-4c6e-9a1b-2c3d4e5f6a7b'
  assert.equal(otherSiteUrl(LIVE, { pathname: `/transactions/${id}`, search: '?x=1' }), 'https://dev.budgeer.com/transactions')
  assert.equal(otherSiteUrl(TEST, { pathname: `/groups/${id}` }), 'https://www.budgeer.com/groups')
  assert.equal(otherSiteUrl(TEST, { pathname: `/categories/${id}`, search: '?period=2026-09' }),
    'https://www.budgeer.com/settings/categories')
  assert.equal(otherSiteUrl(LIVE, { pathname: '/join/abc123' }), 'https://dev.budgeer.com/')
  // Section lists themselves are kept.
  assert.equal(otherSiteUrl(LIVE, { pathname: '/groups' }), 'https://dev.budgeer.com/groups')
})

test('query values that are ids are dropped, the rest kept', () => {
  const id = '3F1C2A9E-8B7D-4C6E-9A1B-2C3D4E5F6A7B'
  assert.equal(otherSiteUrl(LIVE, { pathname: '/transactions', search: `?type=expense&category=${id}&q=rent` }),
    'https://dev.budgeer.com/transactions?type=expense&q=rent')
  assert.equal(otherSiteUrl(LIVE, { pathname: '/transactions', search: `?category=${id}` }),
    'https://dev.budgeer.com/transactions')
  assert.equal(otherSiteUrl(LIVE, { pathname: '/transactions', search: '?category=none' }),
    'https://dev.budgeer.com/transactions?category=none')
})

test('test-site title prefix and favicon', () => {
  const title = 'Budgeer — Track your money. Split with friends.'
  assert.equal(devTitle(TEST, title), `DEV · ${title}`)
  assert.equal(devTitle(TEST, `DEV · ${title}`), `DEV · ${title}`)
  assert.equal(devTitle(LIVE, title), title)
  assert.equal(faviconFor(TEST), '/budgeer-mark-dev.svg')
  assert.equal(faviconFor(LIVE), '/budgeer-mark.svg')
})

test('markEnvironment applies the markers to a document', () => {
  const fakeDoc = () => {
    const attrs = { href: '/budgeer-mark.svg' }
    return {
      title: 'Budgeer',
      icon: attrs,
      querySelector: (sel) => (sel === 'link[rel="icon"]' ? { setAttribute: (k, v) => { attrs[k] = v } } : null),
    }
  }
  const t = fakeDoc()
  markEnvironment(t, TEST)
  assert.equal(t.title, 'DEV · Budgeer')
  assert.equal(t.icon.href, '/budgeer-mark-dev.svg')
  const l = fakeDoc()
  markEnvironment(l, LIVE)
  assert.equal(l.title, 'Budgeer')
  assert.equal(l.icon.href, '/budgeer-mark.svg')
})
