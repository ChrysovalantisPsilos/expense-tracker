// Which navigation entry is "current" for a pathname. A tab lights up for its
// own section and for the pages you reach from it (Import lives under
// Transactions; a category's page, with its budget, under Budgets; Insights,
// Recurring and Settings are gathered under More).
const SECTIONS = {
  '/transactions': ['/transactions', '/import'],
  '/budgets': ['/budgets', '/categories'],
  '/more': ['/more', '/insights', '/recurring', '/settings'],
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
