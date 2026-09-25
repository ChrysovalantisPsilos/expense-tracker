// The two browser-storage entries behind the legal check (legalGateMath.js):
//  - legalAccepted (localStorage): "this account accepted versions X/Y", kept
//    after the server said so, used only when the server can't be reached;
//    AuthProvider drops it on sign-out (userDataCaches.js).
//  - legalConsentPending (sessionStorage): the versions ticked on the sign-up
//    screen just before going to Google, taken once back.
// Storage can be missing or throw (private mode, blocked site data): every
// access is guarded, and a failure reads as "nothing stored". `storage` and
// `now` are injectable for tests.
import { STORAGE_KEYS } from '../../shared/lib/keys.js'
import { consentMarker } from './legalGateMath.js'

const ACCEPTED = STORAGE_KEYS.legalAccepted
const PENDING = STORAGE_KEYS.legalConsentPending

function readJson(storage, key) {
  try {
    const raw = storage?.getItem(key)
    return raw ? JSON.parse(raw) : null
  } catch { return null }
}

function write(storage, key, value) {
  try {
    if (value) storage?.setItem(key, JSON.stringify(value))
    else storage?.removeItem(key)
  } catch { /* storage unavailable: nothing remembered */ }
}

export const readLocalAcceptance = (storage = globalThis.localStorage) => readJson(storage, ACCEPTED)

// Store `local` ({ uid, privacy, terms }), or forget it when null.
export function writeLocalAcceptance(local, storage = globalThis.localStorage) {
  write(storage, ACCEPTED, local)
}

// Sign-up via Google: remember the ticked versions for the trip to Google.
// null clears it (a log-in with Google, which ticks nothing).
export function rememberConsentMarker(ticked, storage = globalThis.sessionStorage, now = Date.now()) {
  write(storage, PENDING, ticked ? consentMarker(now) : null)
}

// Read and clear the marker: it's used once, whatever the answer.
export function takeConsentMarker(storage = globalThis.sessionStorage) {
  const marker = readJson(storage, PENDING)
  write(storage, PENDING, null)
  return marker
}
