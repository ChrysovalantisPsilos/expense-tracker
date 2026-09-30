import BackButton from './BackButton.jsx'

// The ← of a page opened from More (Insights, Savings, Recurring, Plan, Meal
// vouchers, Settings): back to where the user came from, or to More. Only
// where More is the way in — the bottom bar's phones (AppShell's mobile nav,
// below md); wider screens reach these pages from the sidebar, with no back.
export default function MoreBackButton() {
  return <BackButton fallback="/more" display={{ base: 'inline-flex', md: 'none' }} />
}
