import { useState } from 'react'
import { Box, HStack, Tab, TabList, TabPanel, TabPanels, Tabs, Text } from '@chakra-ui/react'
import Figure from '../../shared/ui/kit/Figure.jsx'
import { formatMoney } from '../../shared/lib/currency.js'
import { missingRatesNote, ruleInBase } from '../../shared/lib/ruleFx.js'
import { useT } from '../../shared/lib/i18n/I18nProvider.jsx'

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
  const t = useT('recurring')
  return (
    <Box {...props}>
      <HStack justify="space-between" align="end" spacing={3} flexWrap="wrap">
        <Figure label={t(`groups.total.${g.key}`)} size="lg"
          value={t(`groups.perUnit.${g.unit}`, { amount: formatMoney(g.total, baseCurrency) })} />
        {g.unit !== 'month' && (
          <Text fontSize="sm" color="text.muted">
            {t('groups.aboutPerMonth', { amount: formatMoney(g.perMonth, baseCurrency) })}
          </Text>
        )}
      </HStack>
      <RatesNote converted={g.converted} missing={g.missing} mt={1} />
    </Box>
  )
}

// The notes under a total built from rules: foreign ones converted at today's
// rate, and those left out because there's no rate right now.
export function RatesNote({ converted, missing, ...props }) {
  const t = useT('recurring')
  const left = missingRatesNote(missing, formatMoney, (amounts) => t('rates.missing', { amounts }))
  if (!converted && !left) return null
  return (
    <Box fontSize="xs" color="text.muted" {...props}>
      {converted && <Text>{t('rates.converted')}</Text>}
      {left && <Text>{left}</Text>}
    </Box>
  )
}

// What a foreign rule's charge is in the base currency at today's rate
// ("≈ €6.98"), shown under its own amount; undefined for a base-currency rule
// or one with no rate.
export function baseHint(rule, baseCurrency, rates) {
  const b = rule.currency !== baseCurrency && ruleInBase(rule, baseCurrency, rates)
  return b ? `≈ ${formatMoney(b.amount_minor, baseCurrency)}` : undefined
}
