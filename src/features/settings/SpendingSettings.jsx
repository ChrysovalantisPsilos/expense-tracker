import { useState } from 'react'
import { useToast } from '@chakra-ui/react'
import { useAuth } from '../../shared/auth/AuthProvider.jsx'
import { useProfile } from '../../shared/lib/ProfileProvider.jsx'
import { updateProfile } from '../../shared/lib/profile.js'
import { EVENTS } from '../../shared/lib/keys.js'
import Panel from '../../shared/ui/kit/Panel.jsx'
import SettingsPage from './SettingsPage.jsx'
import PrefRow from './PrefRow.jsx'
import { userMessage } from '../../shared/lib/errors.js'
import RingLoader from '../../shared/ui/RingLoader.jsx'

// How monthly spending is counted. One synced preference for now:
// profiles.yearly_separate (0068). Off (the default) spreads a yearly
// subscription over the months it covers; on keeps those payments out of every
// monthly figure — Home, Insights, budgets and the server's budget alerts —
// (Home’s Subscriptions card lists them under Yearly either way).
export default function SpendingSettings() {
  const { user } = useAuth()
  const { profile, separateYearly } = useProfile()
  const toast = useToast()
  // The value being saved, shown until the profile (refetched on
  // profileUpdated) catches up — then the live value takes over again.
  const [pending, setPending] = useState(null)
  if (pending !== null && pending === separateYearly) setPending(null)
  const separate = pending ?? separateYearly

  async function onChange(e) {
    const next = !e.target.checked // the switch reads "count them in monthly"
    setPending(next)
    try {
      await updateProfile(user.id, { yearly_separate: next })
      window.dispatchEvent(new Event(EVENTS.profileUpdated))
    } catch (err) {
      setPending(null)
      console.error('[settings] spending setting not saved:', err)
      toast({ title: 'Couldn’t save', description: userMessage(err), status: 'error' })
    }
  }

  return (
    <SettingsPage title="Monthly spending">
      <Panel>
        {!profile ? (
          <RingLoader compact />
        ) : (
          <PrefRow id="pref-yearly" label="Count yearly subscriptions in monthly spending"
            hint="On: a yearly payment is spread over the months it covers. Off: it stays out of monthly totals and budgets (Home's Subscriptions card still lists it)."
            isChecked={!separate} onChange={onChange} />
        )}
      </Panel>
    </SettingsPage>
  )
}
