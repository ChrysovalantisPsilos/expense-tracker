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
