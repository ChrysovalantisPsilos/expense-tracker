import { useEffect, useState } from 'react'
import { Stack, Divider, Text, useToast } from '@chakra-ui/react'
import { useAuth } from '../../shared/auth/AuthProvider.jsx'
import { enablePush } from '../../shared/lib/push.js'
import { getProfile, updateProfile } from '../../shared/lib/profile.js'
import { useProfile } from '../../shared/lib/ProfileProvider.jsx'
import Panel from '../../shared/ui/kit/Panel.jsx'
import SettingsPage from './SettingsPage.jsx'
import PrefRow from './PrefRow.jsx'
import { userMessage } from '../../shared/lib/errors.js'
import RingLoader from '../../shared/ui/RingLoader.jsx'

export default function NotificationSettings() {
  return (
    <SettingsPage title="Notifications">
      <NotificationPrefs />
    </SettingsPage>
  )
}

// The message switches. Also shown in Settings → Privacy, where they are how
// you give or withdraw consent; every change is recorded server-side in your
// consent history (0072). The weekly summary is opt-in (off for new accounts).
export function NotificationPrefs({ title, onChanged }) {
  const { user } = useAuth()
  const toast = useToast()
  // The shared demo login (0090) sends no messages: the server refuses
  // turning any of them on, so the switches stay put.
  const { isDemo } = useProfile()
  const [prefs, setPrefs] = useState(null) // { notify_email, notify_push, notify_digest }

  useEffect(() => {
    let active = true
    getProfile(user.id, 'notify_email, notify_push, notify_digest').then((data) => {
      if (active && data) setPrefs(data)
    })
    return () => { active = false }
  }, [user.id])

  async function setPref(field, value) {
    const prev = prefs
    setPrefs({ ...prefs, [field]: value }) // optimistic
    try {
      await updateProfile(user.id, { [field]: value })
      onChanged?.()
      // Turning push on is the moment to enrol this device (user gesture).
      if (field === 'notify_push' && value) {
        const status = await enablePush()
        if (status === 'denied') {
          toast({ title: 'This browser blocks notifications', status: 'info',
            description: 'Allow them in your browser settings to get push here. Other devices are unaffected.' })
        } else if (status === 'unsupported') {
          toast({ title: 'Push isn’t available in this browser', status: 'info',
            description: 'On iPhone, install Budgeer to your home screen first.' })
        }
      }
    } catch (e) {
      setPrefs(prev)
      console.error('[settings] notification setting not saved:', e)
      toast({ title: 'Couldn’t save', description: userMessage(e), status: 'error' })
    }
  }

  return (
    <Panel title={title}>
      {prefs === null ? (
        <RingLoader compact />
      ) : (
        <Stack spacing={4} divider={<Divider />}>
          <PrefRow id="pref-push" label="Push notifications"
            hint="Group activity, payment reminders and budget alerts, on every device you’ve allowed."
            isChecked={prefs.notify_push} isDisabled={isDemo}
            onChange={(e) => setPref('notify_push', e.target.checked)} />
          <PrefRow id="pref-email" label="Email me"
            hint="Big events only: group invites, members joining or leaving."
            isChecked={prefs.notify_email} isDisabled={isDemo}
            onChange={(e) => setPref('notify_email', e.target.checked)} />
          <PrefRow id="pref-digest" label="Weekly summary"
            hint="Optional: every Sunday, how many expenses you logged and your top category."
            isChecked={!!prefs.notify_digest} isDisabled={isDemo}
            onChange={(e) => setPref('notify_digest', e.target.checked)} />
          {isDemo && (
            <Text fontSize="sm" color="text.muted">Messages stay off on the shared demo account.</Text>
          )}
        </Stack>
      )}
    </Panel>
  )
}
