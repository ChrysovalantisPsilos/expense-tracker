import { Stack } from '@chakra-ui/react'
import {
  BellRing, Palette, ShieldCheck, DatabaseBackup, FileText, LogOut, Tags, CalendarRange, Compass, CircleHelp,
} from 'lucide-react'
import { useAuth } from '../../shared/auth/AuthProvider.jsx'
import { useProfile } from '../../shared/lib/ProfileProvider.jsx'
import PageHeader from '../../shared/ui/PageHeader.jsx'
import UserAvatar from '../../shared/ui/UserAvatar.jsx'
import { NavList, NavRow } from '../../shared/ui/NavList.jsx'
import { startTour } from '../onboarding/tour.js'

const PREFERENCES = [
  { to: '/settings/categories', label: 'Categories', desc: 'Add, rename, recolour or archive', icon: Tags },
  { to: '/settings/spending', label: 'Monthly spending', desc: 'How yearly subscriptions count', icon: CalendarRange },
  { to: '/settings/notifications', label: 'Notifications', desc: 'Push and email alerts', icon: BellRing },
  { to: '/settings/appearance', label: 'Appearance', desc: 'Light, dark or match your device', icon: Palette },
]
const PRIVACY = [
  { to: '/settings/security', label: 'Security', desc: 'Sign-in and account deletion', icon: ShieldCheck },
  { to: '/settings/data', label: 'Your data', desc: 'Back up or restore your account', icon: DatabaseBackup },
  { to: '/privacy', label: 'Privacy', desc: 'What we store and how it’s protected', icon: FileText },
]

const rows = (items) => items.map(({ to, label, desc, icon }) => (
  <NavRow key={to} to={to} icon={icon} label={label} description={desc} />
))

// The Settings list: who you are at the top (taps into Account), then the
// sub-pages in labelled groups, help (the FAQ and replaying the app tour),
// then sign-out.
export default function Settings() {
  const { user, signOut } = useAuth()
  const { profile } = useProfile()

  return (
    <Stack spacing={5}>
      <PageHeader title="Settings" />

      <NavList label="Profile">
        <NavRow to="/settings/account" label={profile?.display_name || 'Your name'}
          description={user.email}
          media={<UserAvatar size="md" name={profile?.display_name} src={profile?.avatar_url}
            highlight flexShrink={0} />} />
      </NavList>
      <NavList label="Preferences">{rows(PREFERENCES)}</NavList>
      <NavList label="Privacy & security">{rows(PRIVACY)}</NavList>
      <NavList label="Help">
        <NavRow to="/help" icon={CircleHelp} label="Help & FAQ" description="Answers to common questions" />
        <NavRow icon={Compass} label="Take the tour again" description="A quick look around the app"
          data-tour="replay" onClick={() => startTour({ returnTo: '/settings', returnFocus: '[data-tour="replay"]' })} />
      </NavList>
      <NavList>
        <NavRow onClick={signOut} icon={LogOut} label="Sign out" />
      </NavList>
    </Stack>
  )
}
