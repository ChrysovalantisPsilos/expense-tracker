import { useLocation } from 'react-router-dom'
import { useProfile } from './ProfileProvider.jsx'
import { CURRENT_ENV, SITES, otherEnvironment, otherSiteUrl } from './environment.js'

// The live ⇄ test site switch, for developer accounts only (profiles.
// is_developer, set server-side — 0075). Null for everyone else; otherwise
// the other site's link for the current page, its host and its label.
export function useSiteSwitch() {
  const { profile } = useProfile()
  const location = useLocation()
  if (!profile?.is_developer) return null
  const site = SITES[otherEnvironment(CURRENT_ENV)]
  return {
    href: otherSiteUrl(CURRENT_ENV, location),
    host: new URL(site.origin).host,
    label: `Open ${site.name}`,
  }
}
