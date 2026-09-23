import { Box, Stack } from '@chakra-ui/react'
import { TrendingUp, Repeat, Settings } from 'lucide-react'
import PageHeader from '../shared/ui/PageHeader.jsx'
import { NavList, NavRow } from '../shared/ui/NavList.jsx'
import SectionLabel from '../shared/ui/kit/SectionLabel.jsx'

// The mobile "More" tab: the destinations that don't fit the bottom bar,
// in labelled groups.
const SECTIONS = [
  { label: 'Money', links: [
    { to: '/insights', label: 'Insights', desc: 'Trends, net worth & goals', icon: TrendingUp },
    { to: '/recurring', label: 'Recurring', desc: 'Subscriptions & recurring bills', icon: Repeat },
  ] },
  { label: 'Account', links: [
    { to: '/settings', label: 'Settings', desc: 'Account, notifications & security', icon: Settings },
  ] },
]

export default function More() {
  return (
    <Stack spacing={5}>
      <PageHeader title="More" />
      {SECTIONS.map(({ label, links }) => (
        <Box key={label}>
          <SectionLabel mb={2} px={1}>{label}</SectionLabel>
          <NavList>
            {links.map(({ to, label, desc, icon }) => (
              <NavRow key={to} to={to} icon={icon} label={label} description={desc} />
            ))}
          </NavList>
        </Box>
      ))}
    </Stack>
  )
}
