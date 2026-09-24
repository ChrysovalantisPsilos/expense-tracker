import { useNavigate } from 'react-router-dom'
import { Stack, Text, Button } from '@chakra-ui/react'
import { Target } from 'lucide-react'
import Panel from '../../shared/ui/kit/Panel.jsx'
import { useProfile } from '../../shared/lib/ProfileProvider.jsx'
import { usePaged } from '../../shared/ui/usePaged.js'
import Paginator from '../../shared/ui/Paginator.jsx'
import { useBudgetProgress } from './useBudgetProgress.js'
import BudgetRow from './BudgetRow.jsx'
import { carriedLabel } from './budgetMath.js'
import QueryError from '../../shared/ui/QueryError.jsx'
import { SkeletonRegion, SkeletonRows } from '../../shared/ui/Skeleton.jsx'

// This month's budgets with progress bars, on the Home tab. Paginated 10/page.
export default function BudgetsCard() {
  const navigate = useNavigate()
  const { baseCurrency } = useProfile()
  const { items, carriedFrom, periodStart, loading, error, reload } = useBudgetProgress()
  const { page, setPage, count, pageItems } = usePaged(items, 10)

  return (
    <Panel icon={Target} title="Budgets"
      subtitle={carriedFrom ? carriedLabel(carriedFrom, periodStart) : 'This month'}
      action={<Button size="xs" variant="ghost" onClick={() => navigate('/budgets')}>Manage</Button>}>
      {error ? <QueryError error={error} onRetry={reload} what="budgets" py={4} /> : loading ? (
        <SkeletonRegion><SkeletonRows count={3} progress /></SkeletonRegion>
      ) : items.length === 0 ? (
        <Text color="text.muted" fontSize="sm">
          No budgets yet. Set monthly caps per category to track them here.
        </Text>
      ) : (
        <>
          <Stack spacing={4} role="list" aria-label="Budgets">
            {pageItems.map((b) => <BudgetRow key={b.id} item={b} currency={baseCurrency} />)}
          </Stack>
          <Paginator page={page} count={count} onPage={setPage} />
        </>
      )}
    </Panel>
  )
}
