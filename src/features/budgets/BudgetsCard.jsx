import { useNavigate } from 'react-router-dom'
import {
  Card, CardBody, HStack, Stack, Text, Spacer, Button, Box,
  Progress, Center, Spinner,
} from '@chakra-ui/react'
import { Target } from 'lucide-react'
import CardHeader from '../../shared/ui/CardHeader.jsx'
import { useProfile } from '../../shared/lib/useProfile.js'
import { formatMoney } from '../../shared/lib/currency.js'
import { usePaged } from '../../shared/ui/usePaged.js'
import Paginator from '../../shared/ui/Paginator.jsx'
import { useBudgetProgress } from './useBudgetProgress.js'

// This month's budgets with progress bars, on the Home tab. Paginated 10/page.
export default function BudgetsCard() {
  const navigate = useNavigate()
  const { baseCurrency } = useProfile()
  const { items, loading } = useBudgetProgress()
  const { page, setPage, count, pageItems } = usePaged(items, 10)

  return (
    <Card><CardBody>
      <CardHeader icon={Target} title="Budgets" subtitle="This month"
        mb={items.length ? 4 : 0}
        action={<Button size="xs" variant="ghost" onClick={() => navigate('/budgets')}>Manage</Button>} />

      {loading ? (
        <Center py={6}><Spinner color="brand.500" /></Center>
      ) : items.length === 0 ? (
        <Text color="text.muted" fontSize="sm">
          No budgets yet. Set monthly caps per category to track them here.
        </Text>
      ) : (
        <>
          <Stack spacing={3.5}>
            {pageItems.map((b) => {
              const pct = b.limit > 0 ? (b.spent / b.limit) * 100 : 0
              return (
                <Box key={b.id}>
                  <HStack mb={1} fontSize="sm">
                    <Text fontWeight="600" noOfLines={1}>{b.name}</Text>
                    <Spacer />
                    <Text color={b.tone === 'negative' ? 'status.negative' : 'text.muted'}>
                      {formatMoney(b.spent, baseCurrency)} / {formatMoney(b.limit, baseCurrency)}
                    </Text>
                  </HStack>
                  <Progress value={Math.min(pct, 100)} size="sm" variant={b.tone} />
                </Box>
              )
            })}
          </Stack>
          <Paginator page={page} count={count} onPage={setPage} />
        </>
      )}
    </CardBody></Card>
  )
}
