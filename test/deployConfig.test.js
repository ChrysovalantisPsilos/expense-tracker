import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { FX_API } from '../src/shared/lib/currency.js'

// vercel.json, public/robots.txt and public/sitemap.xml: the hosting config
// the review asked for, pinned so a later edit can't quietly drop it.
const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8')
const vercel = JSON.parse(read('vercel.json'))
const rule = (source, has) => vercel.headers.find((r) => r.source === source && JSON.stringify(r.has) === JSON.stringify(has))
const header = (r, key) => r?.headers.find((h) => h.key === key)?.value

test('vercel.json: every security header stays on every path, first in the list', () => {
  const all = vercel.headers[0]
  assert.equal(all.source, '/(.*)')
  assert.equal(all.has, undefined)
  for (const key of ['Strict-Transport-Security', 'X-Content-Type-Options', 'X-Frame-Options',
    'Referrer-Policy', 'Permissions-Policy']) assert.ok(header(all, key), key)
  // Enforced, not report-only.
  assert.equal(header(all, 'Content-Security-Policy-Report-Only'), undefined)
  const csp = header(all, 'Content-Security-Policy')
  assert.match(csp, /default-src 'self'/)
  assert.match(csp, /frame-ancestors 'none'/)
  assert.doesNotMatch(csp, /script-src[^;]*'unsafe-(inline|eval)'/)
  // The browser fetches exchange rates itself, so the FX API must stay allowed.
  assert.match(csp, new RegExp(`connect-src[^;]* ${new URL(FX_API).origin.replaceAll('.', '\\.')}[ ;]`))
})

test('vercel.json: only the dev host is noindex', () => {
  const dev = rule('/(.*)', [{ type: 'host', value: 'dev.budgeer.com' }])
  assert.equal(header(dev, 'X-Robots-Tag'), 'noindex, nofollow')
  const others = vercel.headers.filter((r) => r !== dev)
  assert.ok(others.every((r) => !header(r, 'X-Robots-Tag')))
})

test('vercel.json: cache rules (hashed assets immutable; shell, worker and manifest revalidated)', () => {
  assert.equal(header(rule('/assets/(.*)'), 'Cache-Control'), 'public, max-age=31536000, immutable')
  assert.equal(header(rule('/(sw\\.js|theme-boot\\.js)'), 'Cache-Control'), 'no-cache, max-age=0, must-revalidate')
  assert.match(header(rule('/(index\\.html|manifest\\.webmanifest)'), 'Cache-Control'), /max-age=0, must-revalidate/)
  // SPA routes (rewritten to index.html) use the rewrite's own source.
  const spa = vercel.rewrites.find((r) => r.destination === '/index.html').source
  assert.match(header(rule(spa), 'Cache-Control'), /max-age=0, must-revalidate/)
  // No two Cache-Control rules share a source.
  const sources = vercel.headers.filter((r) => header(r, 'Cache-Control')).map((r) => r.source)
  assert.equal(new Set(sources).size, sources.length)
})

test('robots.txt allows crawling and points at the sitemap', () => {
  const robots = read('public/robots.txt')
  assert.match(robots, /^User-agent: \*$/m)
  assert.doesNotMatch(robots, /^Disallow: \/\s*$/m)
  assert.match(robots, /^Sitemap: https:\/\/www\.budgeer\.com\/sitemap\.xml$/m)
})

test('sitemap.xml lists the public pages', () => {
  const locs = [...read('public/sitemap.xml').matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1])
  assert.deepEqual(locs, ['/', '/help', '/privacy', '/terms'].map((p) => `https://www.budgeer.com${p}`))
})
