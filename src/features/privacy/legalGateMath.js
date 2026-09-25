// What the signed-in app shows while it checks the Privacy Notice / Terms
// acceptance (useLegalGate, App.jsx). Consent fails CLOSED: nothing of the app
// renders until the server says the versions in force are accepted. Pure
// (unit-tested in test/legalGate.test.js); the storage wrappers that feed it
// are in legalConsentStore.js.
import { LEGAL_VERSIONS } from './legal.js'

export const GATE_VIEW = {
  loading: 'loading',         // no answer yet: the full-screen loader, nothing else
  autoAccept: 'auto-accept',  // record the consent ticked before Google (still the loader)
  gate: 'gate',               // only the acceptance prompt
  app: 'app',                 // the app itself
  error: 'error',             // couldn't check: "Try again" / "Log out", nothing else
}

// The ticked-before-Google marker stops counting after this long (a sign-up
// abandoned on Google's screen shouldn't consent for a later one in the tab).
export const CONSENT_MARKER_TTL_MS = 30 * 60 * 1000

const sameVersions = (a, b) => !!a && !!b && a.privacy === b.privacy && a.terms === b.terms

// The marker the sign-up screen keeps before sending the visitor to Google:
// the versions they ticked, and when.
export function consentMarker(now = Date.now(), versions = LEGAL_VERSIONS) {
  return { privacy: versions.privacy, terms: versions.terms, at: now }
}

// Does the marker cover this server status? It must be fresh, and name both
// the versions this app shows and the ones the server has in force (the
// server records its own versions, so a mismatch means the visitor ticked
// something other than what would be recorded).
export function markerMatches(marker, status, now = Date.now(), versions = LEGAL_VERSIONS) {
  if (!marker || typeof marker.at !== 'number') return false
  const age = now - marker.at
  if (age < 0 || age > CONSENT_MARKER_TTL_MS) return false
  return sameVersions(marker, versions)
    && sameVersions(marker, { privacy: status?.privacy_version, terms: status?.terms_version })
}

// What this device remembers once the server has said "accepted": the
// account and the versions it accepted. null when the status isn't one.
export function localAcceptanceFor(uid, status) {
  if (!uid || !status || status.needs_acceptance) return null
  return { uid, privacy: status.privacy_accepted, terms: status.terms_accepted }
}

// Does the remembered acceptance cover this account and the versions the app
// shows now? A version bump makes it stale by itself.
export function localAcceptanceMatches(local, uid, versions = LEGAL_VERSIONS) {
  return !!uid && local?.uid === uid && sameVersions(local, versions)
}

// The view for the check's current state. `status` is the server's answer
// (null until one arrives), `failed` whether the last check couldn't reach
// the server. The server's answer always wins; the device's memory counts
// only when the server can't be reached.
export function gateView({ status, failed, marker, local, uid, now = Date.now(), versions = LEGAL_VERSIONS }) {
  if (status) {
    if (!status.needs_acceptance) return GATE_VIEW.app
    return markerMatches(marker, status, now, versions) ? GATE_VIEW.autoAccept : GATE_VIEW.gate
  }
  if (failed) return localAcceptanceMatches(local, uid, versions) ? GATE_VIEW.app : GATE_VIEW.error
  return GATE_VIEW.loading
}
