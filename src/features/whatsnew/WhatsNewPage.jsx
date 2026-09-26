import { useState } from 'react'
import { Sparkles } from 'lucide-react'
import { NavList, NavRow } from '../../shared/ui/NavList.jsx'
import SettingsPage from '../settings/SettingsPage.jsx'
import { RELEASES } from './releases.js'
import { releaseDate, releaseText } from './whatsNewMath.js'
import WhatsNewStory from './WhatsNewStory.jsx'
import { useT } from '../../shared/lib/i18n/I18nProvider.jsx'

// Settings → What's new: every release, newest first; tapping one replays its
// story.
export default function WhatsNewPage() {
  const t = useT('whatsnew')
  const [replay, setReplay] = useState(null)
  const releases = RELEASES.filter((r) => r.pages.length > 0)
  return (
    <SettingsPage title={t('settings:rows.whatsNew.label')} description={t('description')}>
      <NavList>
        {releases.map((r) => (
          <NavRow key={r.id} icon={Sparkles} label={releaseDate(r.date)}
            description={releaseText(r, t).pages.map((p) => p.title).join(' · ')}
            onClick={() => setReplay(r)} />
        ))}
      </NavList>
      <WhatsNewStory release={replay} onClose={() => setReplay(null)} />
    </SettingsPage>
  )
}
