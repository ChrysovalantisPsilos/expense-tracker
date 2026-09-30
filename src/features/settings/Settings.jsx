import { Box, Stack, Text } from '@chakra-ui/react'
import {
  BellRing, Palette, ShieldCheck, DatabaseBackup, FileText, LogOut, Tags, CalendarRange, Compass, CircleHelp, Mail,
  Scale, UserCheck, ArrowLeftRight, Sparkles, Sparkle, Activity, Languages, Wand2, Ticket,
} from 'lucide-react'
import { useAuth } from '../../shared/auth/AuthProvider.jsx'
import { useProfile } from '../../shared/lib/ProfileProvider.jsx'
import PageHeader from '../../shared/ui/PageHeader.jsx'
import UserAvatar from '../../shared/ui/UserAvatar.jsx'
import { NavList, NavRow } from '../../shared/ui/NavList.jsx'
import { STATUS_URL, SUPPORT_EMAIL } from '../../shared/lib/contact.js'
import { useSiteSwitch } from '../../shared/lib/useSiteSwitch.js'
import { startTour } from '../onboarding/tour.js'
import DemoNotice from './DemoNotice.jsx'
import { useT } from '../../shared/lib/i18n/I18nProvider.jsx'
import MoreBackButton from '../../shared/ui/MoreBackButton.jsx'

// Each row's words are rows.<id>.label / .desc in the settings namespace.
const PREFERENCES = [
  { to: '/settings/categories', id: 'categories', icon: Tags },
  { to: '/settings/spending', id: 'spending', icon: CalendarRange },
  { to: '/settings/vouchers', id: 'vouchers', icon: Ticket },
  { to: '/settings/notifications', id: 'notifications', icon: BellRing },
  { to: '/settings/appearance', id: 'appearance', icon: Palette },
  { to: '/settings/language', id: 'language', icon: Languages },
  { to: '/settings/import-rules', id: 'importRules', icon: Wand2 },
  { to: '/settings/ai', id: 'ai', icon: Sparkle },
]
const PRIVACY = [
  { to: '/settings/security', id: 'security', icon: ShieldCheck },
  { to: '/settings/data', id: 'data', icon: DatabaseBackup },
  { to: '/settings/privacy', id: 'privacy', icon: UserCheck },
  { to: '/privacy', id: 'privacyNotice', icon: FileText },
  { to: '/terms', id: 'terms', icon: Scale },
]

const rows = (items, t) => items.map(({ to, id, icon }) => (
  <NavRow key={to} to={to} icon={icon} label={t(`rows.${id}.label`)} description={t(`rows.${id}.desc`)} />
))

// The Settings list: who you are at the top (taps into Account), then the
// sub-pages in labelled groups, help (the FAQ, What's new, the service status
// page and replaying the app tour),
// the live/test site switch for developer accounts, then sign-out.
export default function Settings() {
  const t = useT('settings')
  const { user, signOut } = useAuth()
  const { profile, isDemo } = useProfile()
  const site = useSiteSwitch()

  return (
    <Stack spacing={5}>
      <PageHeader leading={<MoreBackButton />} title={t('title')} />

      <NavList label={t('sections.profile')}>
        <NavRow to="/settings/account" label={profile?.display_name || t('yourName')}
          description={user.email}
          media={<UserAvatar size="md" name={profile?.display_name} src={profile?.avatar_url}
            highlight flexShrink={0} />} />
      </NavList>
      {isDemo && <DemoNotice />}
      <NavList label={t('sections.preferences')}>{rows(PREFERENCES, t)}</NavList>
      <NavList label={t('sections.privacy')} data-tour="settings-privacy">{rows(PRIVACY, t)}</NavList>
      <NavList label={t('sections.help')}>
        <NavRow to="/help" icon={CircleHelp} label={t('rows.help.label')} description={t('rows.help.desc')} />
        <NavRow to="/settings/whats-new" icon={Sparkles} label={t('rows.whatsNew.label')}
          description={t('rows.whatsNew.desc')} />
        <NavRow href={STATUS_URL} target="_blank" rel="noopener noreferrer" icon={Activity}
          label={t('rows.status.label')} description={t('rows.status.desc')} />
        <NavRow href={`mailto:${SUPPORT_EMAIL}`} icon={Mail} label={t('rows.contact.label')} description={SUPPORT_EMAIL} />
        <NavRow icon={Compass} label={t('rows.tour.label')} description={t('rows.tour.desc')}
          data-tour="replay" onClick={() => startTour({ returnTo: '/settings', returnFocus: '[data-tour="replay"]' })} />
      </NavList>
      {site && (
        <Box>
          <NavList label={t('sections.developer')}>
            <NavRow href={site.href} icon={ArrowLeftRight} label={site.label}
              description={site.host} />
          </NavList>
          <Text fontSize="sm" color="text.muted" mt={2} px={1}>
            {t('developerNote')}
          </Text>
        </Box>
      )}
      <NavList>
        <NavRow onClick={signOut} icon={LogOut} label={t('rows.signOut.label')} />
      </NavList>
    </Stack>
  )
}
