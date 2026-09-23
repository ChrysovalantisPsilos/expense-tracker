import { useEffect, useState } from 'react'
import { Stack, Divider, Center, Spinner, useToast } from '@chakra-ui/react'
import { useAuth } from '../../shared/auth/AuthProvider.jsx'
import { enablePush } from '../../shared/lib/push.js'
import { getProfile, updateProfile } from '../../shared/lib/profile.js'
import Panel from '../../shared/ui/kit/Panel.jsx'
import SettingsPage from './SettingsPage.jsx'
import PrefRow from './PrefRow.jsx'

export default function NotificationSettings() {
  const { user } = useAuth()
  const toast = useToast()
  const [prefs, setPrefs] = useState(null) // { notify_email, notify_push }

  useEffect(() => {
    let active = true
    getProfile(user.id, 'notify_email, notify_push').then((data) => {
      if (active && data) setPrefs(data)
    })
    return () => { active = false }
  }, [user.id])

  async function setPref(field, value) {
    const prev = prefs
    setPrefs({ ...prefs, [field]: value }) // optimistic
    try {
      await updateProfile(user.id, { [field]: value })
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
      toast({ title: 'Couldn’t save', description: e.message, status: 'error' })
    }
  }

  return (
    <SettingsPage title="Notifications">
      <Panel>
        {prefs === null ? (
          <Center py={4}><Spinner size="sm" color="brand.500" /></Center>
        ) : (
          <Stack spacing={4} divider={<Divider />}>
            <PrefRow id="pref-push" label="Push notifications"
              hint="Group activity and payment reminders, on every device you’ve allowed."
              isChecked={prefs.notify_push}
              onChange={(e) => setPref('notify_push', e.target.checked)} />
            <PrefRow id="pref-email" label="Email me"
              hint="Big events only: group invites, members joining or leaving."
              isChecked={prefs.notify_email}
              onChange={(e) => setPref('notify_email', e.target.checked)} />
          </Stack>
        )}
      </Panel>
    </SettingsPage>
  )
}
