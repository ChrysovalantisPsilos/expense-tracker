import { Box, Stack, Text } from '@chakra-ui/react'
import {
  BellRing, Palette, ShieldCheck, DatabaseBackup, FileText, LogOut, Tags, CalendarRange, Compass, CircleHelp, Mail,
  Scale, UserCheck, ArrowLeftRight,
} from 'lucide-react'
import { useAuth } from '../../shared/auth/AuthProvider.jsx'
import { useProfile } from '../../shared/lib/ProfileProvider.jsx'
import PageHeader from '../../shared/ui/PageHeader.jsx'
import UserAvatar from '../../shared/ui/UserAvatar.jsx'
import { NavList, NavRow } from '../../shared/ui/NavList.jsx'
import { SUPPORT_EMAIL } from '../../shared/lib/contact.js'
import { useSiteSwitch } from '../../shared/lib/useSiteSwitch.js'
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
  { to: '/settings/privacy', label: 'Privacy', desc: 'Your data rights, consents and requests', icon: UserCheck },
  { to: '/privacy', label: 'Privacy Notice', desc: 'What we store, why, and who receives it', icon: FileText },
  { to: '/terms', label: 'Terms of Use', desc: 'The rules for using Budgeer', icon: Scale },
]

const rows = (items) => items.map(({ to, label, desc, icon }) => (
  <NavRow key={to} to={to} icon={icon} label={label} description={desc} />
))

// The Settings list: who you are at the top (taps into Account), then the
// sub-pages in labelled groups, help (the FAQ and replaying the app tour),
// the live/test site switch for developer accounts, then sign-out.
export default function Settings() {
  const { user, signOut } = useAuth()
  const { profile } = useProfile()
  const site = useSiteSwitch()

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
        <NavRow href={`mailto:${SUPPORT_EMAIL}`} icon={Mail} label="Contact support" description={SUPPORT_EMAIL} />
        <NavRow icon={Compass} label="Take the tour again" description="A quick look around the app"
          data-tour="replay" onClick={() => startTour({ returnTo: '/settings', returnFocus: '[data-tour="replay"]' })} />
      </NavList>
      {site && (
        <Box>
          <NavList label="Developer">
            <NavRow href={site.href} icon={ArrowLeftRight} label={site.label}
              description={site.host} />
          </NavList>
          <Text fontSize="sm" color="text.muted" mt={2} px={1}>
            The live and test sites have separate accounts and data: you sign in separately on each.
          </Text>
        </Box>
      )}
      <NavList>
        <NavRow onClick={signOut} icon={LogOut} label="Sign out" />
      </NavList>
    </Stack>
  )
}
