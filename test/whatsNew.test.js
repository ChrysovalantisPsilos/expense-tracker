// "What's new": which release shows (whatsNewMath.js) and the release notes
// themselves (releases.js).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  pickRelease, createSeenTracker, ringVariant, releaseDay, releaseDate,
} from '../src/features/whatsnew/whatsNewMath.js'
import { RELEASES } from '../src/features/whatsnew/releases.js'
import { isSignedInRoute } from '../src/app/routes.js'
import { RETIRED_STORAGE_KEYS } from '../src/shared/lib/keys.js'
import { readFileSync, readdirSync } from 'node:fs'

const page = (title) => ({ title, body: 'b', chips: ['x'] })
const R3 = { id: '2026-11-01', date: '2026-11-01', pages: [page('c')] }
const R2 = { id: '2026-10-01', date: '2026-10-01', pages: [page('b')] }
const R1 = { id: '2026-09-26', date: '2026-09-26', pages: [page('a')] }
const ALL = [R3, R2, R1]
const OLD_USER = '2025-03-02T10:00:00+00:00'

test('first visit of a brand-new account: nothing shown, newest marked seen silently', () => {
  // Not onboarded yet (the setup wizard is running or about to).
  assert.deepEqual(pickRelease(ALL, { seenId: null, onboardedAt: null }), { show: null, markSeen: R3.id })
  // Onboarded on or after the newest release's day.
  assert.deepEqual(pickRelease(ALL, { seenId: null, onboardedAt: '2026-11-01T08:00:00Z' }), { show: null, markSeen: R3.id })
  assert.deepEqual(pickRelease(ALL, { seenId: null, onboardedAt: '2026-12-24T08:00:00Z' }), { show: null, markSeen: R3.id })
})

test('nothing recorded on the profile, account from before the release: the newest shows', () => {
  assert.deepEqual(pickRelease(ALL, { seenId: null, onboardedAt: OLD_USER }), { show: R3, markSeen: R3.id })
  assert.deepEqual(pickRelease(ALL, { seenId: null, onboardedAt: '2026-10-31T23:00:00Z' }).show, R3)
})

test('an unseen release shows, and is then the one remembered', () => {
  assert.deepEqual(pickRelease(ALL, { seenId: R2.id, onboardedAt: OLD_USER }), { show: R3, markSeen: R3.id })
})

test('already seen: nothing, at most once per release per account', () => {
  assert.deepEqual(pickRelease(ALL, { seenId: R3.id, onboardedAt: OLD_USER }), { show: null, markSeen: null })
  // Another visit after marking it seen gives the same answer.
  const { markSeen } = pickRelease(ALL, { seenId: R2.id, onboardedAt: OLD_USER })
  assert.equal(pickRelease(ALL, { seenId: markSeen, onboardedAt: OLD_USER }).show, null)
})

test('several missed: only the newest shows, and all count as seen', () => {
  assert.deepEqual(pickRelease(ALL, { seenId: R1.id, onboardedAt: OLD_USER }), { show: R3, markSeen: R3.id })
  // An id no longer in the list: everything is unseen, still only the newest.
  assert.deepEqual(pickRelease(ALL, { seenId: '2020-01-01', onboardedAt: OLD_USER }), { show: R3, markSeen: R3.id })
})

test('a release without pages never shows; the newest unseen one with pages does', () => {
  const empty = { id: '2026-12-01', date: '2026-12-01', pages: [] }
  assert.deepEqual(pickRelease([empty, R3], { seenId: R3.id, onboardedAt: OLD_USER }), { show: null, markSeen: empty.id })
  assert.deepEqual(pickRelease([empty, R3, R2], { seenId: R2.id, onboardedAt: OLD_USER }), { show: R3, markSeen: empty.id })
  assert.deepEqual(pickRelease([], { seenId: null, onboardedAt: OLD_USER }), { show: null, markSeen: null })
})

test('profile value unknown (no such column): nothing shows, nothing is marked', () => {
  assert.deepEqual(pickRelease(ALL, { seenId: undefined, onboardedAt: OLD_USER }), { show: null, markSeen: null })
})

// A profile-backed tracker: `rows` is the server's whats_new_seen per user;
// `offline` makes every write fail. The device's localStorage is a Map.
function fixture({ stored, offline = false } = {}) {
  const rows = new Map()
  const saves = []
  const device = new Map(stored === undefined ? [] : [[RETIRED_STORAGE_KEYS.whatsNewSeen, stored]])
  const storage = {
    getItem: (k) => (device.has(k) ? device.get(k) : null),
    removeItem: (k) => device.delete(k),
  }
  const tracker = createSeenTracker({
    save: async (uid, id) => {
      saves.push([uid, id])
      if (offline) throw new Error('offline')
      rows.set(uid, id)
    },
    getStorage: () => storage,
  })
  return { rows, saves, device, tracker }
}
// One app start: read the profile, decide, mark (as WhatsNewPrompt does).
async function visit(f, uid, onboardedAt = OLD_USER) {
  const seenId = await f.tracker.load(uid, f.rows.has(uid) ? f.rows.get(uid) : null)
  const pick = pickRelease(ALL, { seenId, onboardedAt })
  if (pick.markSeen) await f.tracker.mark(uid, pick.markSeen)
  return pick.show
}

test('seen is per account: marked on the profile, so another device doesn\'t show it again', async () => {
  const phone = fixture()
  phone.rows.set('u1', R2.id)
  assert.equal(await visit(phone, 'u1'), R3)
  assert.equal(phone.rows.get('u1'), R3.id)
  // A second device of the same account reads the same profile.
  const laptop = fixture()
  laptop.rows.set('u1', phone.rows.get('u1'))
  assert.equal(await visit(laptop, 'u1'), null)
  assert.deepEqual(laptop.saves, [])
})

test('first visit of a new account marks the newest on the profile silently; several missed show only the newest', async () => {
  const f = fixture()
  assert.equal(await visit(f, 'new', null), null)
  assert.equal(f.rows.get('new'), R3.id)
  f.rows.set('old', R1.id)
  assert.equal(await visit(f, 'old'), R3)
  assert.equal(f.rows.get('old'), R3.id)
  assert.equal(await visit(f, 'old'), null)
})

test('a failed write (offline) keeps it hidden for the rest of the session, and is made again next load', async () => {
  const f = fixture({ offline: true })
  f.rows.set('u1', R2.id)
  assert.equal(await visit(f, 'u1'), R3)
  assert.equal(f.rows.get('u1'), R2.id, 'nothing reached the server')
  assert.equal(await visit(f, 'u1'), null, 'shown twice in one session')
  // Another account on the same tab starts from its own profile.
  f.rows.set('u2', R2.id)
  assert.equal(await visit(f, 'u2'), R3)
  // Next load: a new session (a new tracker) decides again and writes again.
  const next = fixture()
  next.rows.set('u1', R2.id)
  assert.equal(await visit(next, 'u1'), R3)
  assert.equal(next.rows.get('u1'), R3.id)
})

test('the old per-device value moves to an empty profile once, then its key is deleted', async () => {
  const f = fixture({ stored: R3.id })
  assert.equal(await visit(f, 'u1'), null, 'already seen on this device')
  assert.deepEqual(f.saves, [['u1', R3.id]])
  assert.equal(f.rows.get('u1'), R3.id)
  assert.equal(f.device.size, 0)
  // An older value still moves, and the newer release shows.
  const g = fixture({ stored: R2.id })
  assert.equal(await visit(g, 'u1'), R3)
  assert.deepEqual(g.saves, [['u1', R2.id], ['u1', R3.id]])
  assert.equal(g.device.size, 0)
})

test('the old value: kept when the move fails, dropped when the profile has one or it is malformed', async () => {
  const f = fixture({ stored: R3.id, offline: true })
  assert.equal(await visit(f, 'u1'), null)
  assert.equal(f.device.get(RETIRED_STORAGE_KEYS.whatsNewSeen), R3.id, 'kept for the next load')
  await visit(f, 'u1')
  assert.equal(f.saves.length, 1, 'moved at most once per session')

  const g = fixture({ stored: R1.id })
  g.rows.set('u1', R2.id)
  assert.equal(await visit(g, 'u1'), R3, 'the profile wins over the device')
  assert.deepEqual(g.saves, [['u1', R3.id]])
  assert.equal(g.device.size, 0)

  const h = fixture({ stored: 'junk' })
  assert.equal(await visit(h, 'u1'), R3)
  assert.deepEqual(h.saves, [['u1', R3.id]])
  assert.equal(h.device.size, 0)
})

test('storage unreadable, or a profile without the column: nothing breaks, the device key is left alone', async () => {
  const throwing = createSeenTracker({ save: async () => {}, getStorage: () => { throw new Error('SecurityError') } })
  assert.equal(await throwing.load('u1', R2.id), R2.id)
  const f = fixture({ stored: R3.id })
  assert.equal(await f.tracker.load('u1', undefined), undefined)
  assert.equal(f.device.size, 1)
  assert.deepEqual(f.saves, [])
})

test('ring picture and dates', () => {
  assert.equal(ringVariant({ variant: 'split' }), 'split')
  assert.equal(ringVariant({ variant: 'crash' }), 'update')
  assert.equal(ringVariant({}), 'update')
  assert.equal(releaseDay('2026-09-26'), '26 Sep')
  assert.equal(releaseDay('2027-01-05'), '5 Jan')
  assert.equal(releaseDate('2026-09-26'), '26 September 2026')
})

test('releases.js: unique ids, newest first, valid dates, 1–5 pages each', () => {
  assert.ok(RELEASES.length > 0)
  const ids = RELEASES.map((r) => r.id)
  assert.equal(new Set(ids).size, ids.length, 'duplicate release id')
  for (const r of RELEASES) {
    assert.match(r.date, /^\d{4}-\d{2}-\d{2}$/, r.id)
    const d = new Date(`${r.date}T00:00:00Z`)
    assert.ok(!Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === r.date, `${r.id}: bad date ${r.date}`)
    assert.equal(r.id, r.date, `${r.id}: the id is the release day`)
    assert.ok(r.pages.length >= 1 && r.pages.length <= 5, `${r.id}: ${r.pages.length} pages`)
  }
  for (let i = 1; i < RELEASES.length; i++) {
    assert.ok(RELEASES[i - 1].date > RELEASES[i].date, `${RELEASES[i - 1].id} should come after ${RELEASES[i].id}`)
  }
})

test('releases.js: every page is complete, and every action opens a real page', () => {
  for (const r of RELEASES) {
    const titles = r.pages.map((p) => p.title)
    assert.equal(new Set(titles).size, titles.length, `${r.id}: duplicate page title`)
    for (const p of r.pages) {
      assert.ok(p.title?.trim() && p.body?.trim(), `${r.id}: a page lacks a title or body`)
      assert.ok(Array.isArray(p.chips) && p.chips.length >= 1 && p.chips.length <= 2, `${p.title}: 1–2 chips`)
      assert.equal(new Set(p.chips).size, p.chips.length, `${p.title}: duplicate chip`)
      if (p.variant !== undefined) assert.equal(ringVariant(p), p.variant, `${p.title}: unknown ring variant ${p.variant}`)
      if (p.action) {
        assert.ok(p.action.label?.trim(), `${p.title}: action without a label`)
        assert.ok(isSignedInRoute(p.action.to), `${p.title}: ${p.action.to} isn't an app route`)
      }
    }
  }
})

test('this release: five pages, the salary page opens Monthly spending', () => {
  const r = RELEASES.find((x) => x.id === '2026-09-25')
  assert.equal(r.pages.length, 5)
  assert.deepEqual(r.pages[2].action, { label: 'Open settings', to: '/settings/spending' })
})

// The dev and live sites behave the same: one releases.js drives both (a
// release merged to develop shows on dev, and on live once promoted).
test('no environment checks in the feature, or where App mounts it', () => {
  const dir = new URL('../src/features/whatsnew/', import.meta.url)
  const files = readdirSync(dir).filter((f) => /\.(js|jsx)$/.test(f))
  assert.ok(files.length >= 5, `found only ${files.join(', ')}`)
  const sources = files.map((f) => [f, readFileSync(new URL(f, dir), 'utf8')])
  const app = readFileSync(new URL('../src/app/App.jsx', import.meta.url), 'utf8')
  const mount = app.split('\n').filter((l) => /WhatsNew/.test(l)).join('\n')
  assert.match(mount, /<WhatsNewPrompt\b/)
  for (const [f, src] of [...sources, ['App.jsx (What’s new lines)', mount]]) {
    assert.doesNotMatch(src, /environment(\.js)?['"]/, `${f} imports environment.js`)
    assert.doesNotMatch(src, /import\.meta\.env/, `${f} reads import.meta.env`)
    assert.doesNotMatch(src, /\b(location\.host(name)?|CURRENT_ENV|isDev|isProd)\b/, `${f} checks the site`)
  }
})
