import { useState } from 'react'
import { Divider, Stack, useToast } from '@chakra-ui/react'
import { ShieldCheck } from 'lucide-react'
import SettingsSubPage from '../../shared/ui/SettingsSubPage.jsx'
import Panel from '../../shared/ui/kit/Panel.jsx'
import { InfoNote } from '../../shared/ui/InfoToggle.jsx'
import { useAuth } from '../../shared/auth/AuthProvider.jsx'
import { useProfile } from '../../shared/lib/ProfileProvider.jsx'
import { userMessage } from '../../shared/lib/errors.js'
import { useT } from '../../shared/lib/i18n/I18nProvider.jsx'
import PrefRow from '../settings/PrefRow.jsx'
import DemoNotice from '../settings/DemoNotice.jsx'
import { AI_SWITCHES } from './aiMath.js'
import { saveAiHelper, useAiHelpers } from './ai.js'

const drop = (obj, ids) => Object.fromEntries(Object.entries(obj).filter(([id]) => !ids.includes(id)))

// Settings → AI helpers: one switch per helper, each with what it sends, and
// the privacy note they share. Every change is recorded server-side in the
// consent history (0103), like the message switches. On the shared demo login
// the helpers start on (0106) and the demo notice says what typing there sends.
export default function AiSettings() {
  const t = useT('ai')
  const toast = useToast()
  const { user } = useAuth()
  const { isDemo } = useProfile()
  const saved = useAiHelpers()
  // The switch moves at once; the saved value takes over once the profile
  // has it (or the save failed).
  const [pending, setPending] = useState({})
  const settled = Object.keys(pending).filter((id) => saved[id] === pending[id])
  if (settled.length) setPending((p) => drop(p, settled))
  const on = { ...saved, ...pending }

  async function flip(id, value) {
    setPending((p) => ({ ...p, [id]: value }))
    try {
      await saveAiHelper(user.id, id, value)
    } catch (e) {
      setPending((p) => drop(p, [id]))
      console.error('[ai] switch not saved:', e)
      toast({ title: t('common:errors.notSaved'), description: userMessage(e), status: 'error' })
    }
  }

  return (
    <SettingsSubPage title={t('settings.title')}>
      {isDemo && <DemoNotice>{t('demoNote')}</DemoNotice>}
      <Panel>
        <Stack direction="row" spacing={3} align="start">
          <ShieldCheck size={18} style={{ flexShrink: 0, marginTop: 2 }} aria-hidden />
          <InfoNote more={t('settings.noteMore')} label={t('settings.noteLabel')} textProps={{ color: 'text.primary' }}>
            {t('settings.note')}
          </InfoNote>
        </Stack>
      </Panel>
      <Panel>
        <Stack spacing={4} divider={<Divider />}>
          {Object.keys(AI_SWITCHES).map((id) => (
            <PrefRow key={id} id={`ai-${id}`} label={t(`settings.${id}.label`)} hint={t(`settings.${id}.hint`)}
              more={t(`settings.${id}.more`)} isChecked={on[id]}
              onChange={(e) => flip(id, e.target.checked)} />
          ))}
        </Stack>
      </Panel>
    </SettingsSubPage>
  )
}
