import { RETIRED_STORAGE_KEYS } from '../../shared/lib/keys.js'
import { shortMonth } from '../../shared/lib/dates.js'
import { getLanguage, intlLocale } from '../../shared/lib/i18n/i18n.js'

// Which "What's new" release to show, and what to remember (per account, in
// profiles.whats_new_seen, 0087: the id of the newest release seen).
//   * Show the newest release not seen yet that has pages. Missed several?
//     Only the newest one, and all of them count as seen afterwards.
//   * Nothing recorded yet (null): a brand-new account (not onboarded, or
//     onboarded on/after the newest release's day) never sees it: the newest
//     release is marked seen silently. An account onboarded before that day
//     is an existing user (from before this popup existed): show it.
//   * Unknown (undefined: the profile has no such column to read): show
//     nothing, so it can't pop up on every visit.
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

// A release in words: each page's title, body, chips and action label from
// the whatsnew dictionary (releases.js holds only ids). `t` is useT('whatsnew')
// or any t that resolves keys in that namespace.
export function releaseText(release, t) {
  if (!release) return release
  return {
    ...release,
    pages: release.pages.map((p) => {
      const key = (part) => `releases.${release.id}.${p.id}.${part}`
      return {
        ...p,
        title: t(key('title')),
        body: t(key('body')),
        chips: (p.chips ?? []).map((c) => t(key(`chips.${c}`))),
        ...(p.action ? { action: { ...p.action, label: t(key('action')) } } : {}),
      }
    }),
  }
}

// Fixed English month names: Intl's short months differ by ICU version ("Sept").
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July',
  'August', 'September', 'October', 'November', 'December']
const parts = (iso) => iso.split('-').map(Number)
// '2026-09-26' → '26 Sep' (the story's eyebrow) and '26 September 2026'
// (Settings); in Greek '26 Σεπ' and '26 Σεπτεμβρίου 2026' (a day takes the
// genitive month, which Intl gives).
export function releaseDay(iso) {
  const [, m, d] = parts(iso)
  return `${d} ${shortMonth(m - 1)}`
}
export function releaseDate(iso) {
  const [y, m, d] = parts(iso)
  if (getLanguage() === 'en') return `${d} ${MONTHS[m - 1]} ${y}`
  return new Intl.DateTimeFormat(intlLocale(), { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
    .format(Date.UTC(y, m - 1, d))
}

// A release id, as profiles_whats_new_seen_check (0087) accepts it.
const RELEASE_ID = /^[0-9]{4}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$/

// The account's "seen" state for one app session. The profile is the record;
// what this session marked stays in memory too, so a write that failed
// (offline) can't bring the story back before the app is loaded again, when
// the choice (and its write) is simply made again. Keyed by user, so another
// account signed in on the same tab starts from its own profile.
//   save(userId, id)  writes profiles.whats_new_seen (throws on failure)
//   getStorage()      the device's localStorage, for the one-time move below
const local = () => globalThis.localStorage
export function createSeenTracker({ save, getStorage = local }) {
  const marked = new Map()

  // The newer of the profile's id and this session's (ids are dates, so they
  // order as strings); undefined stays undefined.
  const current = (userId, profileSeen) => {
    const mine = marked.get(userId)
    if (profileSeen === undefined || !mine) return profileSeen
    return profileSeen === null || mine > profileSeen ? mine : profileSeen
  }

  async function mark(userId, id) {
    marked.set(userId, id)
    try { await save(userId, id); return true } catch { return false }
  }

  // The id to decide from. Before the account held it, each device kept its
  // own (RETIRED_STORAGE_KEYS.whatsNewSeen): with nothing on the profile yet,
  // that value is written there once, and the key is deleted when the write
  // succeeds (kept, and tried again next load, when it fails). Once the
  // profile has a value, the device's is just deleted.
  async function load(userId, profileSeen) {
    const key = RETIRED_STORAGE_KEYS.whatsNewSeen
    let storage = null
    let legacy = null
    try { storage = getStorage() ?? null; legacy = storage?.getItem(key) ?? null } catch { storage = null }
    const drop = () => { try { storage.removeItem(key) } catch { /* removed next load */ } }
    if (legacy !== null && profileSeen !== undefined) {
      if (profileSeen === null && RELEASE_ID.test(legacy) && !marked.has(userId)) {
        if (await mark(userId, legacy)) drop()
      } else if (profileSeen !== null || !RELEASE_ID.test(legacy)) {
        drop()
      }
    }
    return current(userId, profileSeen)
  }

  return { load, mark }
}
