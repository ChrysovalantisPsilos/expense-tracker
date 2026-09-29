// Centralized storage keys + custom-event names. A typo in any one of these
// silently breaks a cross-page handshake (invite redeem, verify-email, profile
// refresh), so they live in exactly one place. Every browser-storage key the
// app writes belongs here: the Privacy Notice's "Storage on your device" list
// names each one (test/storageKeys.test.js checks both).
export const STORAGE_KEYS = {
  pendingInvite: 'budge:invite',       // localStorage — survives email round-trip
  pendingEmail: 'budge:pendingEmail',  // sessionStorage — verify-email screen
  overviewView: 'budge:overviewView',  // localStorage — dashboard chart/table toggle
  passkeyPrompted: 'budge:passkeyPrompted', // sessionStorage — passkey prompt shown this session
  returnPath: 'budge:returnPath',      // localStorage — page to open after an off-page sign-in
  appearance: 'budge-appearance',      // localStorage — Light/Dark/System (also read by public/theme-boot.js)
  language: 'budge:language',          // localStorage — Follow my device / English / Ελληνικά
  paymentAskDismissed: 'budge:paymentAsk', // localStorage — "Not now" to Settle up's payment-details ask
  notifPrompted: 'budge:notifPrompted', // localStorage — notification prompt answered ("Not now" included)
  recentGroups: 'budge:recentGroups',  // localStorage — group ids last added to from Add, newest first
  aiSummaryHidden: 'budge:aiSummaryHidden', // localStorage — month ('YYYY-MM-01') Home's AI summary was hidden for
  linkingGoogle: 'budge:linkingGoogle', // sessionStorage — a Google link attempt is in flight
  legalConsentPending: 'budge:legalConsentPending', // sessionStorage — Terms/Privacy versions ticked before a Google sign-up
  chunkReload: 'budge:chunkReload',   // sessionStorage — when this tab last reloaded onto a new version after a page failed to load, and why
  legalAccepted: 'budge:legalAccepted', // localStorage — account + Terms/Privacy versions it accepted (offline check)
  importMappings: 'budgeer:import-mappings:v1', // localStorage — confirmed import column mappings
  importHolder: 'budgeer:import-holder:v1', // localStorage — the holder's name, for own transfers on import
  fxRatePrefix: 'fx2:',                // localStorage — prefix of each cached exchange rate
}

// Keys the app no longer writes, kept only so the app can move an old value
// and then remove it (test/storageKeys.test.js checks nothing writes them).
export const RETIRED_STORAGE_KEYS = {
  // The newest "What's new" release seen on this device, before it moved to
  // the account (profiles.whats_new_seen, 0087). Read once, then deleted.
  whatsNewSeen: 'budge:whatsNewSeen',
}

export const EVENTS = {
  profileUpdated: 'budge:profile-updated', // window event → useProfile refetches
  startTour: 'budge:start-tour',           // window event → App runs the app tour
}
