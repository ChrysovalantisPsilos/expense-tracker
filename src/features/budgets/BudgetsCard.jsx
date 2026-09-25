import { useNavigate } from 'react-router-dom'
import { Stack, Button } from '@chakra-ui/react'
import { Target } from 'lucide-react'
import Panel from '../../shared/ui/kit/Panel.jsx'
import { CardEmptyState } from '../../shared/ui/EmptyState.jsx'
import { useProfile } from '../../shared/lib/ProfileProvider.jsx'
import { today } from '../../shared/lib/dates.js'
import { usePaged } from '../../shared/ui/usePaged.js'
import Paginator from '../../shared/ui/Paginator.jsx'
import { isCurrentPeriod } from '../transactions/periods.js'
import { useBudgetProgress } from './useBudgetProgress.js'
import BudgetRow from './BudgetRow.jsx'
import { budgetSubtitle, budgetsEmpty } from './budgetMath.js'
import QueryError from '../../shared/ui/QueryError.jsx'
import { SkeletonRegion, SkeletonRows } from '../../shared/ui/Skeleton.jsx'

// Home's Budgets card for the picked `period` (periods.js): a month's budgets,
// or a year's / all time's monthly caps added up per category, each against
// its spend (budgetMath.periodBudgets). Paginated 10/page. The Budgets page
// edits this month only, so "Manage" always opens it.
export default function BudgetsCard({ period }) {
  const navigate = useNavigate()
  const { baseCurrency } = useProfile()
  const { items, months, carriedFrom, periodStart, loading, error, reload } = useBudgetProgress(period)
  const { page, setPage, count, pageItems } = usePaged(items, 10, period.value)
  const empty = budgetsEmpty(period, isCurrentPeriod(period, today()))

  return (
    <Panel icon={Target} title="Budgets"
      subtitle={budgetSubtitle(period, { months, carried: carriedFrom, periodStart })}
      action={<Button size="xs" variant="ghost" onClick={() => navigate('/budgets')}>Manage</Button>}>
      {error ? <QueryError error={error} onRetry={reload} what="budgets" py={4} /> : loading ? (
        <SkeletonRegion><SkeletonRows count={3} progress /></SkeletonRegion>
      ) : items.length === 0 ? (
        <CardEmptyState text={empty.text}
          action={empty.canSet && <Button size="sm" variant="outline" onClick={() => navigate('/budgets')}>Set a budget</Button>} />
      ) : (
        <>
          <Stack spacing={4} role="list" aria-label="Budgets">
            {pageItems.map((b) => <BudgetRow key={b.id} item={b} currency={baseCurrency} period={period} />)}
          </Stack>
          <Paginator page={page} count={count} onPage={setPage} />
        </>
      )}
    </Panel>
  )
}
