import { STORAGE_KEYS } from '../../shared/lib/keys.js'

// Which "What's new" release to show, and what to remember (per device, in
// localStorage: the id of the newest release seen).
//   * Show the newest release not seen yet that has pages. Missed several?
//     Only the newest one, and all of them count as seen afterwards.
//   * Nothing remembered yet: a brand-new account (not onboarded, or onboarded
//     on/after the newest release's day) never sees it: the newest release
//     is marked seen silently. An account onboarded before that day is an
//     existing user (a new device, or from before this popup existed): show it.
//   * Storage unreadable (private mode, blocked site data): show nothing, so
//     it can't pop up on every visit.
// Returns { show: release | null, markSeen: id | null }.
export function pickRelease(releases, { seenId, onboardedAt } = {}) {
  const none = { show: null, markSeen: null }
  const newest = releases[0]
  if (!newest || seenId === undefined || seenId === newest.id) return none
  if (seenId === null && !(onboardedAt && String(onboardedAt).slice(0, 10) < newest.date)) {
    return { show: null, markSeen: newest.id }
  }
  const seenAt = releases.findIndex((r) => r.id === seenId)
  const unseen = seenAt === -1 ? releases : releases.slice(0, seenAt)
  const show = unseen.find((r) => r.pages?.length > 0) ?? null
  return { show, markSeen: newest.id }
}

// The ring pictures a page may pick: the LooseRing variants that read as good
// news. Anything else falls back to 'update'.
const RING_VARIANTS = ['update', 'start', 'split']
export const ringVariant = (page) => (RING_VARIANTS.includes(page?.variant) ? page.variant : 'update')

// Fixed English month names: Intl's short months differ by ICU version ("Sept").
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July',
  'August', 'September', 'October', 'November', 'December']
const parts = (iso) => iso.split('-').map(Number)
// '2026-09-26' → '26 Sep' (the story's eyebrow) and '26 September 2026' (Settings).
export function releaseDay(iso) {
  const [, m, d] = parts(iso)
  return `${d} ${MONTHS[m - 1].slice(0, 3)}`
}
export function releaseDate(iso) {
  const [y, m, d] = parts(iso)
  return `${d} ${MONTHS[m - 1]} ${y}`
}

// The remembered id: a string, null when nothing is stored, undefined when
// storage can't be read. `getStorage` is injectable for tests.
const local = () => globalThis.localStorage
export function readSeen(getStorage = local) {
  try {
    const s = getStorage()
    return s ? s.getItem(STORAGE_KEYS.whatsNewSeen) : undefined
  } catch {
    return undefined
  }
}
export function writeSeen(id, getStorage = local) {
  try { getStorage()?.setItem(STORAGE_KEYS.whatsNewSeen, id) } catch { /* shown again next visit */ }
}
