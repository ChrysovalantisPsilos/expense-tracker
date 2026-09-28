// Every page of the signed-in app: the AppShell's <Route>s in App.jsx, legacy
// redirects included, as absolute patterns. A signed-out visit to one of these
// goes to /login and comes back after sign-in; any other unknown address is a
// 404. test/routes.test.js checks this list against App.jsx, so a new page
// can't be added to one and forgotten in the other. (Help and the legal pages
// are here too, but signed out their public route matches first.)
export const SIGNED_IN_ROUTES = [
  '/',
  '/recurring',
  '/recurring/new',
  '/recurring/:id',
  '/plan',
  '/vouchers',
  '/insights',
  '/insights/accounts/new',
  '/insights/accounts/:id',
  '/savings',
  '/savings/goals/new',
  '/savings/goals/:id',
  '/more',
  '/transactions',
  '/transactions/new',
  '/transactions/:id',
  '/import',
  '/budgets',
  '/categories/:id',
  '/groups',
  '/groups/new',
  '/groups/:id',
  '/groups/:id/edit',
  '/groups/:id/members',
  '/groups/:id/settle',
  '/groups/:id/expenses/new',
  '/groups/:id/expenses/:expenseId',
  '/groups/:id/comments/:itemId',
  '/settings',
  '/settings/account',
  '/settings/notifications',
  '/settings/appearance',
  '/settings/language',
  '/settings/spending',
  '/settings/vouchers',
  '/settings/categories',
  '/settings/categories/new',
  '/settings/import-rules',
  '/settings/security',
  '/settings/data',
  '/settings/data/export',
  '/settings/data/restore',
  '/settings/privacy',
  '/settings/privacy/request',
  '/settings/whats-new',
  '/help',
  '/privacy',
  '/terms',
  // Legacy addresses that redirect (Settings' old name; the pages that
  // became Transactions; goals, which moved from Insights to Savings).
  '/profile',
  '/expenses',
  '/income',
  '/search',
  '/insights/goals/new',
  '/insights/goals/:id',
]

const segments = (path) => path.split('/').filter(Boolean)

// Does `pathname` match `pattern` the way React Router matches it: segment by
// segment, `:param` standing for any one segment, case-insensitive, and a
// trailing slash ignored.
function matchesRoute(pattern, pathname) {
  const want = segments(pattern)
  const got = segments(pathname)
  if (want.length !== got.length) return false
  return want.every((w, i) => (w.startsWith(':') ? got[i].length > 0 : w.toLowerCase() === got[i].toLowerCase()))
}

export function isSignedInRoute(pathname) {
  if (typeof pathname !== 'string' || !pathname.startsWith('/') || pathname.includes('//')) return false
  return SIGNED_IN_ROUTES.some((pattern) => matchesRoute(pattern, pathname))
}
