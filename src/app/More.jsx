import { Stack } from '@chakra-ui/react'
import { TrendingUp, PiggyBank, Repeat, Settings } from 'lucide-react'
import PageHeader from '../shared/ui/PageHeader.jsx'
import { NavList, NavRow } from '../shared/ui/NavList.jsx'
import { useT } from '../shared/lib/i18n/I18nProvider.jsx'

// The mobile "More" tab: the destinations that don't fit the bottom bar,
// in labelled groups. Labels are keys in the shell namespace: a link's name
// is its nav entry's (nav.<id>), its description more.<id>.
const SECTIONS = [
  { label: 'more.money', links: [
    { to: '/insights', id: 'insights', icon: TrendingUp },
    { to: '/savings', id: 'savings', icon: PiggyBank },
    { to: '/recurring', id: 'recurring', icon: Repeat },
  ] },
  { label: 'more.account', links: [
    { to: '/settings', id: 'settings', icon: Settings },
  ] },
]

export default function More() {
  const t = useT('shell')
  return (
    <Stack spacing={5}>
      <PageHeader title={t('nav.more')} />
      {SECTIONS.map(({ label, links }) => (
        <NavList key={label} label={t(label)}>
          {links.map(({ to, id, icon }) => (
            <NavRow key={to} to={to} icon={icon} label={t(`nav.${id}`)} description={t(`more.${id}`)} />
          ))}
        </NavList>
      ))}
    </Stack>
  )
}
