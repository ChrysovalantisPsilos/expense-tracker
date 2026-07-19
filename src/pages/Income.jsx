import {
  Heading, Stack, Card, CardBody, List, ListItem, HStack, Text, Spacer,
  Center, Spinner, Divider,
} from '@chakra-ui/react'
import TransactionForm from '../components/TransactionForm.jsx'
import CategoryBadge from '../components/CategoryBadge.jsx'
import { useTransactions, monthRange } from '../lib/useData.js'
import { useProfile } from '../lib/useProfile.js'
import { formatMoney } from '../lib/currency.js'

export default function Income() {
  const { baseCurrency } = useProfile()
  const { from, to } = monthRange()
  const { rows, loading, reload } = useTransactions({ kind: 'income', from, to })

  return (
    <Stack spacing={5}>
      <Heading size="lg">Income</Heading>

      <Card><CardBody>
        <TransactionForm kind="income" baseCurrency={baseCurrency} onSaved={reload} />
      </CardBody></Card>

      <Card><CardBody>
        <Heading size="sm" mb={3}>This month</Heading>
        {loading ? (
          <Center py={8}><Spinner color="brand.500" /></Center>
        ) : rows.length === 0 ? (
          <Text color="text.muted">No income logged yet.</Text>
        ) : (
          <List spacing={0}>
            {rows.map((r, i) => (
              <ListItem key={r.id}>
                {i > 0 && <Divider />}
                <HStack py={3} spacing={3}>
                  <CategoryBadge category={r.categories} kind="income" />
                  <Stack spacing={0}>
                    <Text fontWeight="600">{r.description || r.categories?.name || 'Income'}</Text>
                    <Text fontSize="xs" color="text.muted">{r.spent_at}</Text>
                  </Stack>
                  <Spacer />
                  <Text fontWeight="semibold" color="green.500">
                    {formatMoney(r.amount_minor, r.currency)}
                  </Text>
                </HStack>
              </ListItem>
            ))}
          </List>
        )}
      </CardBody></Card>
    </Stack>
  )
}
