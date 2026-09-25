import { useState } from 'react'
import { Sparkles } from 'lucide-react'
import { NavList, NavRow } from '../../shared/ui/NavList.jsx'
import SettingsPage from '../settings/SettingsPage.jsx'
import { RELEASES } from './releases.js'
import { releaseDate } from './whatsNewMath.js'
import WhatsNewStory from './WhatsNewStory.jsx'

// Settings → What's new: every release, newest first; tapping one replays its
// story.
export default function WhatsNewPage() {
  const [replay, setReplay] = useState(null)
  const releases = RELEASES.filter((r) => r.pages.length > 0)
  return (
    <SettingsPage title="What’s new" description="The changes in each update. Tap one to see it again.">
      <NavList>
        {releases.map((r) => (
          <NavRow key={r.id} icon={Sparkles} label={releaseDate(r.date)}
            description={r.pages.map((p) => p.title).join(' · ')}
            onClick={() => setReplay(r)} />
        ))}
      </NavList>
      <WhatsNewStory release={replay} onClose={() => setReplay(null)} />
    </SettingsPage>
  )
}
