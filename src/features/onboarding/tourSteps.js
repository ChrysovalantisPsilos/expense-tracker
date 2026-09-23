// The app tour's stops, in order. Each highlights the element marked
// data-tour="<target>" (the first one that's actually on screen — the mobile
// bar and the desktop sidebar carry the same names), after moving to `route`
// if the step has one. `media` limits a step to 'mobile' or 'desktop'; a step
// with no `target` is a centred card. A stop whose target never appears is
// skipped (Spotlight.jsx), so an empty Home or a missing button can't strand
// the tour. `prefer` orders the popover's sides (spotlightMath.placePopover):
// nav stops sit beside the desktop sidebar, and fall back to above/below the
// phone's bars, where there's no room at the side.
const NAV = ['right', 'bottom', 'top']

export const TOUR_STEPS = [
  {
    id: 'overview', route: '/', target: 'overview',
    title: 'Your month at a glance',
    body: 'What you spent, earned and kept this month. Pick another period from the menu above.',
  },
  {
    id: 'categories', route: '/', target: 'categories',
    title: 'Where it goes',
    body: 'Your spending by category. Tap a category to see its expenses.',
  },
  {
    id: 'transactions', target: 'nav-transactions', prefer: NAV,
    title: 'Transactions',
    body: 'Everything you spend and earn, in one list.',
  },
  {
    id: 'add-expense', route: '/transactions', target: 'add-expense',
    title: 'Add an expense',
    body: 'Log what you spend or earn, in any currency.',
  },
  {
    id: 'search', route: '/transactions', target: 'ledger-search',
    title: 'Search and filters',
    body: 'Find anything you’ve logged. To import a bank or card statement, use the ⋯ menu at the top.',
  },
  {
    id: 'groups', target: 'nav-groups', prefer: NAV,
    title: 'Groups',
    body: 'Split bills with friends and invite them with a link. Budgeer keeps track of who owes whom.',
  },
  {
    id: 'budgets', target: 'nav-budgets', prefer: NAV,
    title: 'Budgets',
    body: 'Set a monthly limit for each category. What you don’t spend can carry over to next month.',
  },
  {
    id: 'more', media: 'mobile', target: 'nav-more', prefer: NAV,
    title: 'More',
    body: 'Recurring bills, Insights and Settings are here.',
  },
  {
    id: 'more', media: 'desktop', target: 'nav-more', prefer: NAV,
    title: 'Insights and Recurring',
    body: 'Trends, net worth and goals, plus your subscriptions and recurring bills.',
  },
  {
    id: 'account', media: 'mobile', target: 'account',
    title: 'Updates, theme and Settings',
    body: 'The bell shows what’s new, the moon switches light and dark, and your picture opens Settings.',
  },
  {
    id: 'account', media: 'desktop', target: 'account', prefer: NAV,
    title: 'Your account',
    body: 'Settings, light or dark, and sign-out. The bell at the top shows what’s new.',
  },
  {
    id: 'done',
    title: 'You’re all set',
    body: 'You can take this tour again any time from Settings.',
  },
]
