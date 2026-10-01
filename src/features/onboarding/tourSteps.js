// The app tour's stops, in order. Each highlights the element marked
// data-tour="<target>" (the first one that's actually on screen — the mobile
// bar and the desktop sidebar carry the same names), after moving to `route`
// if the step has one. `media` limits a step to 'mobile' or 'desktop'; a step
// with no `target` is a centred card. A stop whose target never appears is
// skipped (Spotlight.jsx), so an empty Home or a missing button can't strand
// the tour. `prefer` orders the popover's sides (spotlightMath.placePopover):
// nav stops sit beside the desktop sidebar, and fall back to above/below the
// phone's bars, where there's no room at the side. `title` and `body` are
// keys in the onboarding namespace (tour.*); ProductTour translates them.
import { t } from '../../shared/lib/i18n/i18n.js'

const NAV = ['right', 'bottom', 'top']
const copy = (key) => ({ title: `tour.${key}.title`, body: `tour.${key}.body` })

export const TOUR_STEPS = [
  { id: 'period', route: '/', target: 'period', ...copy('period') },
  { id: 'overview', route: '/', target: 'overview', ...copy('overview') },
  { id: 'categories', route: '/', target: 'categories', ...copy('categories') },
  { id: 'subscriptions', route: '/', target: 'subscriptions', ...copy('subscriptions') },
  { id: 'add-expense', route: '/transactions', target: 'add-expense', ...copy('addExpense') },
  { id: 'search', route: '/transactions', target: 'ledger-search', ...copy('search') },
  { id: 'groups', target: 'nav-groups', prefer: NAV, ...copy('groups') },
  { id: 'budgets', target: 'nav-budgets', prefer: NAV, ...copy('budgets') },
  { id: 'more', media: 'mobile', target: 'nav-more', prefer: NAV, ...copy('moreMobile') },
  { id: 'more', media: 'desktop', target: 'nav-more', prefer: NAV, ...copy('moreDesktop') },
  { id: 'account', media: 'mobile', target: 'account', ...copy('accountMobile') },
  { id: 'account', media: 'desktop', target: 'account', prefer: NAV, ...copy('accountDesktop') },
  { id: 'privacy', route: '/settings', target: 'settings-privacy', ...copy('privacy') },
  { id: 'done', ...copy('done') },
]

// The stops for one kind of screen ('mobile' or 'desktop'), in order, each
// with its title and body in the app's language: what the native app's tour
// (a phone) shows, stop by stop.
export function tourStops(media) {
  return TOUR_STEPS.filter((s) => !s.media || s.media === media).map((s) => ({
    id: s.id, route: s.route ?? null, target: s.target ?? null,
    title: t(`onboarding:${s.title}`), body: t(`onboarding:${s.body}`),
  }))
}
