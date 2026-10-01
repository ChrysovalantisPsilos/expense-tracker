import { useState } from 'react'
import { Box, HStack, Tab, TabList, TabPanel, TabPanels, Tabs, Text } from '@chakra-ui/react'
import Figure from '../../shared/ui/kit/Figure.jsx'
import { groupTotalParts, ratesNotes } from './recurringMath.js'

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
// currencies count at today's rate (subscriptionGroups); the line under it
// says so, and names any left out for want of a rate.
export function GroupTotal({ group: g, baseCurrency, ...props }) {
  const p = groupTotalParts(g, baseCurrency)
  return (
    <Box {...props}>
      <HStack justify="space-between" align="end" spacing={3} flexWrap="wrap">
        <Figure label={p.label} size="lg" value={p.value} />
        {p.perMonth && <Text fontSize="sm" color="text.muted">{p.perMonth}</Text>}
      </HStack>
      <RatesNote converted={g.converted} missing={g.missing} mt={1} />
    </Box>
  )
}

// The notes under a total built from rules: foreign ones converted at today's
// rate, and those left out because there's no rate right now.
export function RatesNote({ converted, missing, ...props }) {
  const notes = ratesNotes(converted, missing)
  if (!notes.converted && !notes.missing) return null
  return (
    <Box fontSize="xs" color="text.muted" {...props}>
      {notes.converted && <Text>{notes.converted}</Text>}
      {notes.missing && <Text>{notes.missing}</Text>}
    </Box>
  )
}
