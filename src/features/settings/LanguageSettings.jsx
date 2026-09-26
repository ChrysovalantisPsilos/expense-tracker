import { Box, Button, HStack, Stack, Text, useToast } from '@chakra-ui/react'
import { Check, Smartphone } from 'lucide-react'
import { useAuth } from '../../shared/auth/AuthProvider.jsx'
import { useProfile } from '../../shared/lib/ProfileProvider.jsx'
import { updateProfile } from '../../shared/lib/profile.js'
import { EVENTS } from '../../shared/lib/keys.js'
import { userMessage } from '../../shared/lib/errors.js'
import { useLanguage, useT } from '../../shared/lib/i18n/I18nProvider.jsx'
import { DEFAULT_LANGUAGE, LANGUAGE_PREFS, NATIVE_NAMES, SYSTEM, deviceLanguage, profileValue } from '../../shared/lib/i18n/language.js'
import Panel from '../../shared/ui/kit/Panel.jsx'
import SettingsPage from './SettingsPage.jsx'

// Settings › Language: Follow my device (the default), English or Ελληνικά.
// The two languages are always written in themselves, so they can be found
// whatever the app is showing. The choice applies on this device at once and
// is saved to the profile (profiles.language, 0091; null = follow the device)
// for the other devices and, later, the server's emails, pushes and PDFs.
// The shared demo account keeps it on this device only.
export default function LanguageSettings() {
  const t = useT('settings')
  const toast = useToast()
  const { user } = useAuth()
  const { profile, isDemo } = useProfile()
  const { pref, lang, setPref } = useLanguage()
  const device = deviceLanguage(navigator.languages ?? [navigator.language])

  async function choose(next) {
    if (next === pref) return
    setPref(next)
    if (!user || isDemo || !profile || !('language' in profile)) return
    try {
      await updateProfile(user.id, { language: profileValue(next) })
      window.dispatchEvent(new Event(EVENTS.profileUpdated))
    } catch (err) {
      console.error('[settings] language not saved:', err)
      toast({ title: t('common:errors.notSaved'), description: userMessage(err), status: 'error' })
    }
  }

  return (
    <SettingsPage title={t('language.title')} description={t('language.description')}>
      <Panel p={2}>
        <Stack spacing={1}>
          {LANGUAGE_PREFS.map((value) => {
            const active = pref === value
            const system = value === SYSTEM
            return (
              <Button key={value} onClick={() => choose(value)} variant="ghost"
                aria-pressed={active} h="auto" py={3} px={3} justifyContent="flex-start" textAlign="left"
                whiteSpace="normal" fontWeight="600" color="text.primary"
                bg={active ? 'bg.subtle' : 'transparent'} _hover={{ bg: 'bg.subtle' }}>
                <HStack spacing={3} w="full">
                  <Box flex="1" minW={0}>
                    {system ? (
                      <>
                        <HStack spacing={2}>
                          <Smartphone size={16} aria-hidden />
                          <Text as="span">{t('language.system')}</Text>
                        </HStack>
                        <Text fontSize="sm" fontWeight="400" color="text.muted" mt={0.5}>
                          {t('language.systemNow', { language: NATIVE_NAMES[device] })}
                        </Text>
                      </>
                    ) : (
                      <Text as="span" lang={value}>{NATIVE_NAMES[value]}</Text>
                    )}
                  </Box>
                  <Box color="accent.fg" flexShrink={0} visibility={active ? 'visible' : 'hidden'}>
                    <Check size={18} strokeWidth={2.6} />
                  </Box>
                </HStack>
              </Button>
            )
          })}
        </Stack>
      </Panel>
      {lang !== DEFAULT_LANGUAGE && (
        <Text fontSize="sm" color="text.muted" px={1}>{t('language.partial')}</Text>
      )}
    </SettingsPage>
  )
}
