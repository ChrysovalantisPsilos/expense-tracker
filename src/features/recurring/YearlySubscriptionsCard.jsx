import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Box, Button, SimpleGrid, Text } from '@chakra-ui/react'
import { CalendarClock } from 'lucide-react'
import Panel from '../../shared/ui/kit/Panel.jsx'
import Figure from '../../shared/ui/kit/Figure.jsx'
import ItemRow from '../../shared/ui/kit/ItemRow.jsx'
import SectionLabel from '../../shared/ui/kit/SectionLabel.jsx'
import CategoryBadge from '../../shared/ui/CategoryBadge.jsx'
import { formatMoney } from '../../shared/lib/currency.js'
import { shortDate } from '../../shared/lib/dates.js'
import { frequencyLabel, yearlySubscriptions } from './recurringMath.js'

// Home's "Yearly subscriptions" card, for users who keep them out of monthly
// spending (profiles.yearly_separate): what they cost per year and per month,
// and the next few charges. Hidden unless that setting is on and there is at
// least one active yearly expense rule. `rules` are the useRecurring() rows.
export default function YearlySubscriptionsCard({ rules, baseCurrency }) {
  const navigate = useNavigate()
  const y = useMemo(() => yearlySubscriptions(rules, baseCurrency), [rules, baseCurrency])
  if (y.count === 0) return null

  return (
    <Panel icon={CalendarClock} title="Yearly subscriptions" subtitle="Kept out of monthly spending"
      action={<Button size="xs" variant="ghost" onClick={() => navigate('/recurring')}>Manage</Button>}>
      <SimpleGrid columns={2} spacing={4}>
        <Figure label="Per year" size="lg" value={formatMoney(y.perYear, baseCurrency)} />
        <Figure label="Per month" size="lg" align="right" value={`≈ ${formatMoney(y.perMonth, baseCurrency)}`} />
      </SimpleGrid>
      {y.foreign && (
        <Text fontSize="xs" color="text.muted" mt={1}>
          Other currencies are added at face value (recurring entries have no exchange rate).
        </Text>
      )}
      <SectionLabel mt={4} mb={1}>Next due</SectionLabel>
      <Box as="ul" listStyleType="none">
        {y.next.map((r) => (
          <ItemRow as="li" key={r.id} py={2.5}
            media={<CategoryBadge category={r.categories} kind={r.kind} size={32} />}
            title={r.description || r.categories?.name || 'Expense'}
            meta={`${shortDate(r.next_run)} · ${frequencyLabel(r)}`}
            amount={formatMoney(r.amount_minor, r.currency)} />
        ))}
      </Box>
    </Panel>
  )
}
