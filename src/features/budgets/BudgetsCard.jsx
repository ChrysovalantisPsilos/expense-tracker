import { useNavigate } from 'react-router-dom'
import {
  Card, CardBody, HStack, Stack, Heading, Text, Spacer, Button, Box,
  Progress, Center, Spinner,
} from '@chakra-ui/react'
import { Target } from 'lucide-react'
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
      <HStack mb={items.length ? 3 : 0}>
        <Box color="accent.fg"><Target size={18} /></Box>
        <Heading size="sm">Budgets</Heading>
        <Text fontSize="xs" color="text.muted">this month</Text>
        <Spacer />
        <Button size="xs" variant="ghost" onClick={() => navigate('/budgets')}>Manage</Button>
      </HStack>

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
              const over = b.spent > b.limit
              return (
                <Box key={b.id}>
                  <HStack mb={1} fontSize="sm">
                    <Text fontWeight="600" noOfLines={1}>{b.name}</Text>
                    <Spacer />
                    <Text color={over ? 'red.500' : 'text.muted'}>
                      {formatMoney(b.spent, baseCurrency)} / {formatMoney(b.limit, baseCurrency)}
                    </Text>
                  </HStack>
                  <Progress value={Math.min(pct, 100)} size="sm" borderRadius="full"
                    colorScheme={over ? 'red' : pct >= 80 ? 'orange' : 'brand'} />
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
