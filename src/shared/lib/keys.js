// Centralized storage keys + custom-event names. A typo in any one of these
// silently breaks a cross-page handshake (invite redeem, verify-email, profile
// refresh), so they live in exactly one place.
export const STORAGE_KEYS = {
  pendingInvite: 'budge:invite',       // localStorage — survives email round-trip
  pendingEmail: 'budge:pendingEmail',  // sessionStorage — verify-email screen
  overviewView: 'budge:overviewView',  // localStorage — dashboard chart/table toggle
}

export const EVENTS = {
  profileUpdated: 'budge:profile-updated', // window event → useProfile refetches
}
