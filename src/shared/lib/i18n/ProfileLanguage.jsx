import { useEffect } from 'react'
import { useProfile } from '../ProfileProvider.jsx'
import { updateProfile } from '../profile.js'
import { useLanguage } from './I18nProvider.jsx'
import { reconcileLanguage } from './language.js'

// Signed in: the profile's language (profiles.language, 0091) wins over this
// device's, and a language picked here while signed out is saved up to a
// profile that has none (reconcileLanguage). Runs when the profile loads or
// its language changes (another device, via realtime). The shared demo
// account (0090) is left alone: one visitor's choice mustn't follow the next.
// Renders nothing.
export default function ProfileLanguage() {
  const { profile, isDemo } = useProfile()
  const { pref, setPref } = useLanguage()
  const userId = profile?.id
  const profileLanguage = profile?.language
  // A database without the 0091 column yet: nothing to read or save.
  const synced = !!profile && 'language' in profile && !isDemo

  useEffect(() => {
    if (!userId || !synced) return
    const { local, push } = reconcileLanguage(profileLanguage, pref)
    if (local !== pref) setPref(local)
    if (push !== undefined) {
      updateProfile(userId, { language: push }).catch((err) => {
        console.error('[i18n] language not saved to the profile:', err)
      })
    }
    // Only a new profile value (or account) re-runs this: a change made on
    // this device is saved by Settings › Language itself.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, synced, profileLanguage])

  return null
}
