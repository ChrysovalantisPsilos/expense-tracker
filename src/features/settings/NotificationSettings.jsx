import { useEffect, useState } from 'react'
import { Stack, Divider, Text, useToast } from '@chakra-ui/react'
import { useAuth } from '../../shared/auth/AuthProvider.jsx'
import { enablePush } from '../../shared/lib/push.js'
import { getProfile, updateProfile } from '../../shared/lib/profile.js'
import { useProfile } from '../../shared/lib/ProfileProvider.jsx'
import Panel from '../../shared/ui/kit/Panel.jsx'
import SettingsSubPage from '../../shared/ui/SettingsSubPage.jsx'
import PrefRow from './PrefRow.jsx'
import { userMessage } from '../../shared/lib/errors.js'
import RingLoader from '../../shared/ui/RingLoader.jsx'
import { useT } from '../../shared/lib/i18n/I18nProvider.jsx'

export default function NotificationSettings() {
  const t = useT('settings')
  return (
    <SettingsSubPage title={t('notifications.title')}>
      <NotificationPrefs />
    </SettingsSubPage>
  )
}

// The message switches. Also shown in Settings → Privacy, where they are how
// you give or withdraw consent; every change is recorded server-side in your
// consent history (0072). The weekly summary is opt-in (off for new accounts).
export function NotificationPrefs({ title, onChanged }) {
  const t = useT('settings')
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
          toast({ title: t('notifications.blocked.title'), status: 'info',
            description: t('notifications.blocked.body') })
        } else if (status === 'unsupported') {
          toast({ title: t('notifications.unsupported.title'), status: 'info',
            description: t('notifications.unsupported.body') })
        }
      }
    } catch (e) {
      setPrefs(prev)
      console.error('[settings] notification setting not saved:', e)
      toast({ title: t('common:errors.notSaved'), description: userMessage(e), status: 'error' })
    }
  }

  return (
    <Panel title={title}>
      {prefs === null ? (
        <RingLoader compact />
      ) : (
        <Stack spacing={4} divider={<Divider />}>
          <PrefRow id="pref-push" label={t('notifications.push.label')}
            hint={t('notifications.push.hint')}
            isChecked={prefs.notify_push} isDisabled={isDemo}
            onChange={(e) => setPref('notify_push', e.target.checked)} />
          <PrefRow id="pref-email" label={t('notifications.email.label')}
            hint={t('notifications.email.hint')}
            isChecked={prefs.notify_email} isDisabled={isDemo}
            onChange={(e) => setPref('notify_email', e.target.checked)} />
          <PrefRow id="pref-digest" label={t('notifications.digest.label')}
            hint={t('notifications.digest.hint')}
            isChecked={!!prefs.notify_digest} isDisabled={isDemo}
            onChange={(e) => setPref('notify_digest', e.target.checked)} />
          {isDemo && (
            <Text fontSize="sm" color="text.muted">{t('notifications.demoOff')}</Text>
          )}
        </Stack>
      )}
    </Panel>
  )
}
