// Which navigation entry is "current" for a pathname. A tab lights up for its
// own section and for the pages you reach from it (Import lives under
// Transactions; a category's page, with its budget, under Budgets; Insights,
// Recurring, Settings, Help and the legal pages are gathered under More).
const SECTIONS = {
  '/transactions': ['/transactions', '/import'],
  '/budgets': ['/budgets', '/categories'],
  '/more': ['/more', '/insights', '/recurring', '/settings', '/help', '/privacy', '/terms'],
}

// `pathname` is `prefix` itself or a page below it (`/groups/42`), but not a
// sibling that merely shares the letters (`/groupsx`).
function under(pathname, prefix) {
  return pathname === prefix || pathname.startsWith(`${prefix}/`)
}

export function isNavActive(to, pathname) {
  if (to === '/') return pathname === '/'
  return (SECTIONS[to] ?? [to]).some((p) => under(pathname, p))
}

// The phone's floating "Add expense" button: only on the four main tabs'
// own pages — never over a form, a detail page or Settings. It also steps
// aside while the page shows an empty state (`emptyState`, shared/ui/
// EmptyState): that card's own buttons are the next step there, and on a
// short screen the floating button would sit over them.
const ADD_EXPENSE_PAGES = new Set(['/', '/transactions', '/groups', '/budgets'])

export function showsAddExpense(pathname, { emptyState = false } = {}) {
  if (emptyState) return false
  return ADD_EXPENSE_PAGES.has(pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname)
}
