import { Stack } from '@chakra-ui/react'
import {
  UserRound, BellRing, Palette, ShieldCheck, FileText, LogOut,
} from 'lucide-react'
import { useAuth } from '../../shared/auth/AuthProvider.jsx'
import { useProfile } from '../../shared/lib/useProfile.js'
import PageHeader from '../../shared/ui/PageHeader.jsx'
import UserAvatar from '../../shared/ui/UserAvatar.jsx'
import { NavList, NavRow } from '../../shared/ui/NavList.jsx'

const SECTIONS = [
  { to: '/settings/account', label: 'Account', desc: 'Name, photo, currency & getting paid', icon: UserRound },
  { to: '/settings/notifications', label: 'Notifications', desc: 'Push and email alerts', icon: BellRing },
  { to: '/settings/appearance', label: 'Appearance', desc: 'Light, dark or match your device', icon: Palette },
  { to: '/settings/security', label: 'Security', desc: 'Sign-in and account deletion', icon: ShieldCheck },
]

// The Settings list: who you are at the top (taps into Account), then one row
// per sub-page, then privacy and sign-out.
export default function Settings() {
  const { user, signOut } = useAuth()
  const { profile } = useProfile()

  return (
    <Stack spacing={5}>
      <PageHeader title="Settings" />

      <NavList>
        <NavRow to="/settings/account" label={profile?.display_name || 'Your name'}
          description={user.email}
          media={<UserAvatar size="md" name={profile?.display_name} src={profile?.avatar_url}
            highlight flexShrink={0} />} />
      </NavList>

      <NavList>
        {SECTIONS.map(({ to, label, desc, icon }) => (
          <NavRow key={to} to={to} icon={icon} label={label} description={desc} />
        ))}
      </NavList>

      <NavList>
        <NavRow to="/privacy" icon={FileText} label="Privacy"
          description="What we store and how it’s protected" />
        <NavRow onClick={signOut} icon={LogOut} label="Sign out" />
      </NavList>
    </Stack>
  )
}
