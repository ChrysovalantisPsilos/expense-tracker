import { Box, Stack } from '@chakra-ui/react'
import {
  BellRing, Palette, ShieldCheck, DatabaseBackup, FileText, LogOut,
} from 'lucide-react'
import { useAuth } from '../../shared/auth/AuthProvider.jsx'
import { useProfile } from '../../shared/lib/useProfile.js'
import PageHeader from '../../shared/ui/PageHeader.jsx'
import UserAvatar from '../../shared/ui/UserAvatar.jsx'
import { NavList, NavRow } from '../../shared/ui/NavList.jsx'
import SectionLabel from '../../shared/ui/kit/SectionLabel.jsx'

const PREFERENCES = [
  { to: '/settings/notifications', label: 'Notifications', desc: 'Push and email alerts', icon: BellRing },
  { to: '/settings/appearance', label: 'Appearance', desc: 'Light, dark or match your device', icon: Palette },
]
const PRIVACY = [
  { to: '/settings/security', label: 'Security', desc: 'Sign-in and account deletion', icon: ShieldCheck },
  { to: '/settings/data', label: 'Your data', desc: 'Back up or restore your account', icon: DatabaseBackup },
  { to: '/privacy', label: 'Privacy', desc: 'What we store and how it’s protected', icon: FileText },
]

// One labelled group of rows.
function Section({ label, children }) {
  return (
    <Box>
      <SectionLabel mb={2} px={1}>{label}</SectionLabel>
      <NavList>{children}</NavList>
    </Box>
  )
}
const rows = (items) => items.map(({ to, label, desc, icon }) => (
  <NavRow key={to} to={to} icon={icon} label={label} description={desc} />
))

// The Settings list: who you are at the top (taps into Account), then the
// sub-pages in labelled groups, then sign-out.
export default function Settings() {
  const { user, signOut } = useAuth()
  const { profile } = useProfile()

  return (
    <Stack spacing={5}>
      <PageHeader title="Settings" />

      <Section label="Profile">
        <NavRow to="/settings/account" label={profile?.display_name || 'Your name'}
          description={user.email}
          media={<UserAvatar size="md" name={profile?.display_name} src={profile?.avatar_url}
            highlight flexShrink={0} />} />
      </Section>
      <Section label="Preferences">{rows(PREFERENCES)}</Section>
      <Section label="Privacy & security">{rows(PRIVACY)}</Section>
      <NavList>
        <NavRow onClick={signOut} icon={LogOut} label="Sign out" />
      </NavList>
    </Stack>
  )
}
