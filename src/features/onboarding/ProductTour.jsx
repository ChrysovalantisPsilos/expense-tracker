import { useCallback, useMemo, useRef } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../../shared/auth/AuthProvider.jsx'
import { useProfile } from '../../shared/lib/ProfileProvider.jsx'
import { updateProfile } from '../../shared/lib/profile.js'
import { EVENTS } from '../../shared/lib/keys.js'
import Spotlight from '../../shared/ui/Spotlight.jsx'
import { TOUR_STEPS } from './tourSteps.js'
import { useT } from '../../shared/lib/i18n/I18nProvider.jsx'

// The app tour (lazy chunk): the Spotlight over TOUR_STEPS, in the app's
// language, moving between pages as the steps need. Finishing or skipping both mark it seen on the
// profile (profiles.tour_done, 0069 — follows the account to other devices)
// and go back to `returnTo`.
export default function ProductTour({ returnTo, returnFocus, onEnd }) {
  const t = useT('onboarding')
  const steps = useMemo(() => TOUR_STEPS.map((s) => ({ ...s, title: t(s.title), body: t(s.body) })), [t])
  const { user } = useAuth()
  const { profile } = useProfile()
  const navigate = useNavigate()
  const location = useLocation()
  const path = useRef(location.pathname)
  path.current = location.pathname

  const onStep = useCallback((step) => {
    if (step.route && path.current !== step.route) navigate(step.route)
  }, [navigate])

  async function close() {
    onEnd()
    if (returnTo && `${location.pathname}${location.search}` !== returnTo) navigate(returnTo)
    if (profile?.tour_done) return
    try {
      await updateProfile(user.id, { tour_done: true })
      window.dispatchEvent(new Event(EVENTS.profileUpdated))
    } catch { /* not saved: it offers itself again next session */ }
  }

  return <Spotlight steps={steps} label={t('tourLabel')} onStep={onStep} onClose={close} returnFocus={returnFocus} />
}
