import { STORAGE_KEYS } from './keys.js'

// When a new deploy is waiting, is this a safe moment to reload onto it?
// Safe unless the user is mid-task: typing in a field, inside an open
// dialog/drawer, or on a form page they've filled in but not saved
// (reloading would throw away what they entered). A hidden tab is always
// safe. Takes the document so it can be unit-tested with a stub.
const EDITABLE = new Set(['INPUT', 'TEXTAREA', 'SELECT'])

// A form page marks its form with this attribute while it holds input that
// isn't saved yet (useUnsavedForm), so the reload waits even after focus has
// left the fields.
export const UNSAVED_FORM_ATTR = 'data-unsaved-form'

// Spread onto the form element: the attribute while `dirty`, else nothing.
export const unsavedFormAttr = (dirty) => (dirty ? { [UNSAVED_FORM_ATTR]: '' } : {})

const BUSY = `[role="dialog"], [role="alertdialog"], [${UNSAVED_FORM_ATTR}]`

// Only what's on screen counts: a closed popover keeps its (hidden)
// role="dialog" panel in the page — the notification bells do — and must not
// hold the update back for ever.
function shown(el, doc) {
  if (typeof el.checkVisibility === 'function') {
    return el.checkVisibility({ visibilityProperty: true, checkVisibilityCSS: true })
  }
  const style = doc.defaultView?.getComputedStyle?.(el)
  return !style || (style.display !== 'none' && style.visibility !== 'hidden')
}

export function isSafeToReload(doc) {
  if (doc.visibilityState === 'hidden') return true
  const el = doc.activeElement
  if (el && (EDITABLE.has(el.tagName) || el.isContentEditable)) return false
  return ![...doc.querySelectorAll(BUSY)].some((busy) => shown(busy, doc))
}

// A page the service worker doesn't control (opened before the first worker
// finished installing, or loaded around it) never gets the "waiting" worker
// that the reload above hangs on: a new deploy's worker activates at once
// and nothing reloads the page. It keeps running the old build, whose page
// chunks the server no longer has, so the next page it opens fails to load.
// True when a worker that replaced an active one (`replacedActive`) has
// activated while this page is still uncontrolled: reload onto the new build.
export const missedUpdate = ({ state, replacedActive, controlled }) =>
  state === 'activated' && replacedActive && !controlled

// A page's code chunk failed to load (errorScreens.js → 'update'): the tab is
// on an older build than the server's. One automatic reload picks up the new
// build; a second failure within CHUNK_RELOAD_WINDOW_MS shows the "new
// version" screen instead, so a chunk that's really broken can't loop. The
// record (when, and the error's message: the chunk's address, nothing
// personal) is kept in this tab's session storage, so the original error
// survives the reload for whoever inspects it.
export const CHUNK_RELOAD_WINDOW_MS = 2 * 60 * 1000

export function chunkReloadDue(record, now) {
  let at = null
  try { at = JSON.parse(record ?? 'null')?.at } catch { /* unreadable: treat as none */ }
  return !(typeof at === 'number' && now >= at && now - at < CHUNK_RELOAD_WINDOW_MS)
}

// Reloads (and returns true) unless this tab already did so for a chunk
// error within the window. `storage`/`reload`/`now` are injectable for tests.
export function reloadForNewVersion(error, {
  storage,
  reload = () => globalThis.location.reload(),
  now = Date.now(),
} = {}) {
  // Without storage the guard can't hold: don't risk a reload loop. (Reading
  // sessionStorage itself throws where site data is blocked.)
  try {
    const store = storage === undefined ? globalThis.sessionStorage : storage
    if (!chunkReloadDue(store.getItem(STORAGE_KEYS.chunkReload), now)) return false
    const message = String(error?.message ?? error ?? '').slice(0, 300)
    store.setItem(STORAGE_KEYS.chunkReload, JSON.stringify({ at: now, message }))
  } catch {
    return false
  }
  reload()
  return true
}
