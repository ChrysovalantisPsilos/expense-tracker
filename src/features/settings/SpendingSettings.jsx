import { useState } from 'react'
import { Center, Spinner, useToast } from '@chakra-ui/react'
import { useAuth } from '../../shared/auth/AuthProvider.jsx'
import { useProfile } from '../../shared/lib/ProfileProvider.jsx'
import { updateProfile } from '../../shared/lib/profile.js'
import { EVENTS } from '../../shared/lib/keys.js'
import Panel from '../../shared/ui/kit/Panel.jsx'
import SettingsPage from './SettingsPage.jsx'
import PrefRow from './PrefRow.jsx'

// How monthly spending is counted. One synced preference for now:
// profiles.yearly_separate (0068). Off (the default) spreads a yearly
// subscription over the months it covers; on keeps those payments out of every
// monthly figure — Home, Insights, budgets and the server's budget alerts —
// and shows them in Home's "Yearly subscriptions" card instead.
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
      toast({ title: 'Couldn’t save', description: err.message, status: 'error' })
    }
  }

  return (
    <SettingsPage title="Monthly spending">
      <Panel>
        {!profile ? (
          <Center py={4}><Spinner size="sm" color="brand.500" /></Center>
        ) : (
          <PrefRow id="pref-yearly" label="Count yearly subscriptions in monthly spending"
            hint="On: a yearly payment is spread over the months it covers. Off: it stays out of monthly totals and budgets, in its own card on Home."
            isChecked={!separate} onChange={onChange} />
        )}
      </Panel>
    </SettingsPage>
  )
}
