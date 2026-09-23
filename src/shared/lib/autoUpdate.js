// When a new deploy is waiting, is this a safe moment to reload onto it?
// Safe unless the user is mid-task: typing in a field or inside an open
// dialog/drawer (reloading would throw away what they entered). A hidden tab
// is always safe. Takes the document so it can be unit-tested with a stub.
const EDITABLE = new Set(['INPUT', 'TEXTAREA', 'SELECT'])

export function isSafeToReload(doc) {
  if (doc.visibilityState === 'hidden') return true
  const el = doc.activeElement
  if (el && (EDITABLE.has(el.tagName) || el.isContentEditable)) return false
  return !doc.querySelector('[role="dialog"], [role="alertdialog"]')
}
