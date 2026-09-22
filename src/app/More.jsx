import { Stack } from '@chakra-ui/react'
import {
  TrendingUp, Repeat, Search, Settings,
} from 'lucide-react'
import PageHeader from '../shared/ui/PageHeader.jsx'
import { NavList, NavRow } from '../shared/ui/NavList.jsx'

const LINKS = [
  { to: '/insights', label: 'Insights', desc: 'Trends, net worth & goals', icon: TrendingUp },
  { to: '/recurring', label: 'Recurring', desc: 'Subscriptions & recurring bills', icon: Repeat },
  { to: '/search', label: 'Search', desc: 'Find any transaction', icon: Search },
  { to: '/settings', label: 'Settings', desc: 'Account, notifications & security', icon: Settings },
]

export default function More() {
  return (
    <Stack spacing={5}>
      <PageHeader title="More" />
      <NavList>
        {LINKS.map(({ to, label, desc, icon }) => (
          <NavRow key={to} to={to} icon={icon} label={label} description={desc} />
        ))}
      </NavList>
    </Stack>
  )
}
