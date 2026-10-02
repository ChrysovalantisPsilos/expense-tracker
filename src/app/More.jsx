import { Stack } from '@chakra-ui/react'
import { TrendingUp, PiggyBank, Repeat, Calculator, Ticket } from 'lucide-react'
import PageHeader from '../shared/ui/PageHeader.jsx'
import { NavList, NavRow } from '../shared/ui/NavList.jsx'
import { useT } from '../shared/lib/i18n/I18nProvider.jsx'
import { useMealVouchers } from '../features/vouchers/vouchers.js'

// The mobile "More" tab: the destinations that don't fit the bottom bar,
// in labelled groups. Settings isn't one: the header's picture opens it. Labels are keys in the shell namespace: a link's name
// is its nav entry's (nav.<id>), its description more.<id>. Meal vouchers
// joins Money, after Plan, once they're set up (Settings › Meal vouchers).
const VOUCHERS = { to: '/vouchers', id: 'vouchers', icon: Ticket }
const SECTIONS = [
  { label: 'more.money', links: [
    { to: '/insights', id: 'insights', icon: TrendingUp },
    { to: '/savings', id: 'savings', icon: PiggyBank },
    { to: '/recurring', id: 'recurring', icon: Repeat },
    { to: '/plan', id: 'plan', icon: Calculator },
  ] },
]

export default function More() {
  const t = useT('shell')
  const { settings: vouchers } = useMealVouchers()
  return (
    <Stack spacing={5}>
      <PageHeader title={t('nav.more')} />
      {SECTIONS.map(({ label, links }) => (
        <NavList key={label} label={t(label)}>
          {(vouchers && label === 'more.money' ? [...links, VOUCHERS] : links).map(({ to, id, icon }) => (
            <NavRow key={to} to={to} icon={icon} label={t(`nav.${id}`)} description={t(`more.${id}`)} />
          ))}
        </NavList>
      ))}
    </Stack>
  )
}
