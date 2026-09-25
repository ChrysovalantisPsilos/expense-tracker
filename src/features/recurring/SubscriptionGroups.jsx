import { useState } from 'react'
import { Box, HStack, Tab, TabList, TabPanel, TabPanels, Tabs, Text } from '@chakra-ui/react'
import Figure from '../../shared/ui/kit/Figure.jsx'
import { formatMoney } from '../../shared/lib/currency.js'

// Frequency chips over subscriptionGroups() (recurringMath.js) — Home's
// Recurring card and the Recurring page's Subscriptions tab. One tab per
// group the user has; with a single group there is no tab bar, just its
// content. `children(group)` renders a group's panel. The picked group is
// remembered by key, so adding a rule that inserts a new tab keeps it.
export function GroupTabs({ groups, label, children }) {
  const [picked, setPicked] = useState(null)
  if (groups.length === 1) return children(groups[0])
  const index = Math.max(0, groups.findIndex((g) => g.key === picked))
  return (
    <Tabs variant="soft-rounded" colorScheme="brand" size="sm" isLazy index={index}
      onChange={(i) => setPicked(groups[i].key)}>
      <TabList aria-label={label} flexWrap="wrap" gap={1}>
        {groups.map((g) => <Tab key={g.key} px={3}>{g.label}</Tab>)}
      </TabList>
      <TabPanels>
        {groups.map((g) => <TabPanel key={g.key} px={0} pb={0} pt={4}>{children(g)}</TabPanel>)}
      </TabPanels>
    </Tabs>
  )
}

// A group's headline: what it costs per period ("€29.97 a month"), and, for
// the other periods, about how much that is a month. Rules in other
// currencies are summed at face value (they carry no exchange rate), and the
// line under it says so.
export function GroupTotal({ group: g, baseCurrency, ...props }) {
  return (
    <Box {...props}>
      <HStack justify="space-between" align="end" spacing={3} flexWrap="wrap">
        <Figure label={`${g.label} total`} size="lg" value={`${formatMoney(g.total, baseCurrency)}/${g.unit}`} />
        {g.unit !== 'month' && (
          <Text fontSize="sm" color="text.muted">≈ {formatMoney(g.perMonth, baseCurrency)}/month</Text>
        )}
      </HStack>
      {g.foreign && (
        <Text fontSize="xs" color="text.muted" mt={1}>
          Other currencies are added at face value (recurring entries have no exchange rate).
        </Text>
      )}
    </Box>
  )
}
