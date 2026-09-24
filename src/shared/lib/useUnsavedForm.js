import { useState } from 'react'
import { unsavedFormAttr } from './autoUpdate.js'

// The "unsaved form" signal for a form page: spread the returned props onto
// the <form>. From the first edit in any of its fields (a change event
// bubbling up to the form) the form carries the marker that holds back an
// automatic update reload (autoUpdate.js), until the page is left — saving
// navigates away. `also` marks it busy without an edit (e.g. a restore
// that's under way).
export function useUnsavedForm(also = false) {
  const [edited, setEdited] = useState(false)
  return {
    ...unsavedFormAttr(edited || also),
    onChange: () => setEdited(true),
  }
}
