import { useState } from 'react'
import { Sparkles } from 'lucide-react'
import { NavList, NavRow } from '../../shared/ui/NavList.jsx'
import SettingsSubPage from '../../shared/ui/SettingsSubPage.jsx'
import { RELEASES } from './releases.js'
import { whatsNewList } from './whatsNewMath.js'
import WhatsNewStory from './WhatsNewStory.jsx'
import { useT } from '../../shared/lib/i18n/I18nProvider.jsx'

// Settings → What's new: every release, newest first; tapping one replays its
// story.
export default function WhatsNewPage() {
  const t = useT('whatsnew')
  const [replay, setReplay] = useState(null)
  return (
    <SettingsSubPage title={t('settings:rows.whatsNew.label')} description={t('description')}>
      <NavList>
        {whatsNewList().map((r) => (
          <NavRow key={r.id} icon={Sparkles} label={r.date}
            description={r.pages.map((p) => p.title).join(' · ')}
            onClick={() => setReplay(RELEASES.find((x) => x.id === r.id))} />
        ))}
      </NavList>
      <WhatsNewStory release={replay} onClose={() => setReplay(null)} />
    </SettingsSubPage>
  )
}
