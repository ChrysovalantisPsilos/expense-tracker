// The signed-in app's legal check (legalGateMath.js): consent fails closed,
// the server's answer wins, the device's memory counts only offline, and a
// Google sign-up's tick is recorded only for the versions it named.
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  CONSENT_MARKER_TTL_MS, GATE_VIEW, consentMarker, gateView, localAcceptanceFor, localAcceptanceMatches,
  markerMatches,
} from '../src/features/privacy/legalGateMath.js'
import {
  readLocalAcceptance, rememberConsentMarker, takeConsentMarker, writeLocalAcceptance,
} from '../src/features/privacy/legalConsentStore.js'
import { LEGAL_VERSIONS } from '../src/features/privacy/legal.js'
import { STORAGE_KEYS } from '../src/shared/lib/keys.js'

const V = LEGAL_VERSIONS
const OLD = { privacy: '2025-01-01', terms: '2025-01-01' }
const NOW = 1_800_000_000_000
const UID = 'u-1'
const status = (needs, accepted = needs ? OLD : V) => ({
  privacy_version: V.privacy, terms_version: V.terms,
  privacy_accepted: accepted?.privacy ?? null, terms_accepted: accepted?.terms ?? null,
  needs_acceptance: needs,
})
const view = (over) => gateView({ status: null, failed: false, marker: null, local: null, uid: UID, now: NOW, ...over })

function fakeStorage() {
  const m = new Map()
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
    map: m,
  }
}
const deny = () => { throw new Error('denied') }
const throwing = { getItem: deny, setItem: deny, removeItem: deny }

test('no answer yet blocks the app (the loader)', () => {
  assert.equal(view({}), GATE_VIEW.loading)
  // Even with a remembered acceptance: it counts only once the server has failed.
  assert.equal(view({ local: { uid: UID, ...V } }), GATE_VIEW.loading)
})

test('not accepted → only the prompt', () => {
  assert.equal(view({ status: status(true) }), GATE_VIEW.gate)
  assert.equal(view({ status: status(true, null) }), GATE_VIEW.gate)
})

test('accepted → the app', () => {
  assert.equal(view({ status: status(false) }), GATE_VIEW.app)
})

test('the server answer wins over the device memory', () => {
  assert.equal(view({ status: status(true), local: { uid: UID, ...V } }), GATE_VIEW.gate)
})

test('server unreachable, nothing remembered → the error screen', () => {
  assert.equal(view({ failed: true }), GATE_VIEW.error)
})

test('server unreachable, this account accepted the current versions here → the app', () => {
  assert.equal(view({ failed: true, local: { uid: UID, ...V } }), GATE_VIEW.app)
})

test('server unreachable, a stale or someone else’s acceptance → the error screen', () => {
  assert.equal(view({ failed: true, local: { uid: UID, ...OLD } }), GATE_VIEW.error)
  assert.equal(view({ failed: true, local: { uid: UID, privacy: V.privacy, terms: OLD.terms } }), GATE_VIEW.error)
  assert.equal(view({ failed: true, local: { uid: 'u-2', ...V } }), GATE_VIEW.error)
  assert.equal(view({ failed: true, local: { uid: UID, ...V }, uid: null }), GATE_VIEW.error)
  assert.equal(view({ failed: true, local: 'garbage' }), GATE_VIEW.error)
})

test('a matching Google sign-up marker → accept automatically', () => {
  const marker = consentMarker(NOW - 60_000)
  assert.equal(view({ status: status(true, null), marker }), GATE_VIEW.autoAccept)
  // Nothing to do once accepted.
  assert.equal(view({ status: status(false), marker }), GATE_VIEW.app)
})

test('a marker for older versions, an expired or future one → the prompt', () => {
  assert.equal(view({ status: status(true, null), marker: { ...OLD, at: NOW } }), GATE_VIEW.gate)
  assert.equal(view({ status: status(true, null), marker: consentMarker(NOW - CONSENT_MARKER_TTL_MS - 1) }), GATE_VIEW.gate)
  assert.equal(view({ status: status(true, null), marker: consentMarker(NOW + 60_000) }), GATE_VIEW.gate)
  assert.equal(view({ status: status(true, null), marker: { ...V } }), GATE_VIEW.gate)
})

test('the marker must also name the versions the server has in force', () => {
  const marker = consentMarker(NOW)
  const newerOnServer = { ...status(true, null), privacy_version: '2099-01-01' }
  assert.equal(markerMatches(marker, newerOnServer, NOW), false)
  assert.equal(view({ status: newerOnServer, marker }), GATE_VIEW.gate)
  assert.equal(markerMatches(marker, status(true, null), NOW), true)
})

test('what the device remembers: only a "not needed" answer, with the accepted versions', () => {
  assert.deepEqual(localAcceptanceFor(UID, status(false)), { uid: UID, ...V })
  assert.equal(localAcceptanceFor(UID, status(true)), null)
  assert.equal(localAcceptanceFor(null, status(false)), null)
  assert.equal(localAcceptanceFor(UID, null), null)
  assert.equal(localAcceptanceMatches(localAcceptanceFor(UID, status(false)), UID), true)
  // A version bump makes it stale by itself.
  assert.equal(localAcceptanceMatches({ uid: UID, ...V }, UID, { privacy: '2099-01-01', terms: V.terms }), false)
})

test('legalConsentStore: local acceptance round-trips, and null forgets it', () => {
  const s = fakeStorage()
  assert.equal(readLocalAcceptance(s), null)
  writeLocalAcceptance({ uid: UID, ...V }, s)
  assert.deepEqual(readLocalAcceptance(s), { uid: UID, ...V })
  assert.ok(s.map.has(STORAGE_KEYS.legalAccepted))
  writeLocalAcceptance(null, s)
  assert.equal(s.map.has(STORAGE_KEYS.legalAccepted), false)
  s.setItem(STORAGE_KEYS.legalAccepted, '{not json')
  assert.equal(readLocalAcceptance(s), null)
})

test('legalConsentStore: the Google marker is taken once; a log-in clears it', () => {
  const s = fakeStorage()
  rememberConsentMarker(true, s, NOW)
  assert.deepEqual(takeConsentMarker(s), consentMarker(NOW))
  assert.equal(takeConsentMarker(s), null)
  rememberConsentMarker(true, s, NOW)
  rememberConsentMarker(false, s, NOW)
  assert.equal(s.map.has(STORAGE_KEYS.legalConsentPending), false)
})

test('legalConsentStore never throws when storage is blocked or missing', () => {
  for (const s of [throwing, null]) {
    assert.equal(readLocalAcceptance(s), null)
    writeLocalAcceptance({ uid: UID, ...V }, s)
    rememberConsentMarker(true, s, NOW)
    assert.equal(takeConsentMarker(s), null)
  }
})
