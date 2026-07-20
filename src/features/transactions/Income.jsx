import {
  Heading, Stack, Card, CardBody, Text, Center, Spinner,
} from '@chakra-ui/react'
import TransactionForm from './TransactionForm.jsx'
import TransactionList from './TransactionList.jsx'
import { useTransactions, monthRange } from './useData.js'
import { useProfile } from '../../shared/lib/useProfile.js'

export default function Income() {
  const { baseCurrency } = useProfile()
  const { from, to } = monthRange()
  const { rows, loading, reload, mutate } = useTransactions({ kind: 'income', from, to })

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
          <TransactionList rows={rows} kind="income" baseCurrency={baseCurrency}
            mutate={mutate} reload={reload} />
        )}
      </CardBody></Card>
    </Stack>
  )
}
