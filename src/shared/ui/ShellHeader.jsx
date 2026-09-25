import { createContext, useContext } from 'react'
import { createPortal } from 'react-dom'

// The slim header a phone held sideways gets (AppShell): the page puts its
// title and controls there instead of at the top of its content. AppShell
// provides the header's slots as DOM nodes, `{ title, actions }` — `title`
// takes PageHeader's row (back button, title, the page's controls) and
// `actions` a form's Save button (PageForm), just before the bell. Anywhere
// else (portrait, desktop, the signed-out pages) there are none, and pages
// lay out their own header.
export const ShellHeaderSlots = createContext(null)

// The slots when the page sits under the sideways header, else null.
export function useShellHeader() {
  return useContext(ShellHeaderSlots)
}

// Renders `children` into one of the header's slots (nothing while the slot
// is still mounting).
export function ShellSlot({ slot, children }) {
  const node = useContext(ShellHeaderSlots)?.[slot]
  return node ? createPortal(children, node) : null
}
