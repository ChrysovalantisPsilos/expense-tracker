import { useMemo } from 'react'
import { Link as RouterLink } from 'react-router-dom'
import { Button, Flex, Stack, Text } from '@chakra-ui/react'
import { ChevronRight, Tag, Target } from 'lucide-react'
import Panel from '../../shared/ui/kit/Panel.jsx'
import ProgressRow from '../../shared/ui/kit/ProgressRow.jsx'
import { useProfile } from '../../shared/lib/ProfileProvider.jsx'
import { useAllCategories } from '../../shared/lib/categories.js'
import { useTransactions } from '../../shared/lib/transactions.js'
import { useMonthBudgets } from '../budgets/budgets.js'
import { entryCategoryBox, entryMonth } from '../categories/categoryMath.js'
import { periodMonth } from '../../shared/lib/periods.js'

// Under an entry on its page: its category in the month it was paid — the
// month's budget bar when it has one, and the category's other entries that
// month (newest first, each with its day and amount), "See all" opening the
// category's page for the month. Every figure and word is
// categoryMath.entryCategoryBox's (the iPad's entry detail shows the same
// box). Nothing shows until it's read, nor for an entry it doesn't apply to.
export default function EntryCategoryBox({ entry }) {
  const { baseCurrency = 'EUR', separateYearly, payCalendar: cal } = useProfile()
  const month = entryMonth(entry, new Date(), cal)
  const cats = useAllCategories()
  const txns = useTransactions({ categoryId: entry.category_id, from: month.from, to: month.to, spread: true })
  const budgets = useMonthBudgets(periodMonth(month))
  const category = cats.rows.find((c) => c.id === entry.category_id) ?? null
  const budget = budgets.rows.find((b) => b.category_id === entry.category_id) ?? null
  const box = useMemo(() => entryCategoryBox({
    entry, category, rows: txns.rows, budget, baseCurrency, separateYearly, cal,
  }), [entry, category, txns.rows, budget, baseCurrency, separateYearly, cal])

  if (!box || cats.loading || txns.loading || budgets.loading) return null
  return (
    <Panel icon={Tag} title={box.title} data-testid="entry-category-box" action={
      <Button as={RouterLink} to={box.path} size="sm" variant="ghost" rightIcon={<ChevronRight size={16} />}>
        {box.seeAll}
      </Button>
    }>
      <Stack spacing={4}>
        {box.budget && (
          <ProgressRow icon={Target} title={box.budget.title} meta={box.budget.meta} percent={box.budget.percent}
            valueLabel={box.budget.valueLabel} tone={box.budget.tone ?? undefined} over={box.budget.over} />
        )}
        {box.others.map((o) => (
          <Flex key={o.id} justify="space-between" align="baseline" gap={3}>
            <Stack spacing={0} minW={0}>
              <Text fontWeight="600" noOfLines={1}>{o.name}</Text>
              <Text fontSize="sm" color="text.muted">{o.date}</Text>
            </Stack>
            <Text fontWeight="600" flexShrink={0} sx={{ fontVariantNumeric: 'tabular-nums' }}>{o.amount}</Text>
          </Flex>
        ))}
        {box.empty && <Text color="text.muted" fontSize="sm">{box.empty}</Text>}
      </Stack>
    </Panel>
  )
}
