import { useState } from 'react'
import {
  Heading, Stack, Card, CardBody, Button, useDisclosure, Collapse,
  List, ListItem, HStack, Text, Spacer, Badge, Center, Spinner, Divider,
} from '@chakra-ui/react'
import TransactionForm from '../components/TransactionForm.jsx'
import CategoryBadge from '../components/CategoryBadge.jsx'
import { useTransactions, monthRange } from '../lib/useData.js'
import { useProfile } from '../lib/useProfile.js'
import { formatMoney } from '../lib/currency.js'

export default function Expenses() {
  const { baseCurrency } = useProfile()
  const { from, to } = monthRange()
  const { rows, loading, reload } = useTransactions({ kind: 'expense', from, to })
  const { isOpen, onToggle, onClose } = useDisclosure({ defaultIsOpen: true })
  const [, forceReload] = useState(0)

  return (
    <Stack spacing={5}>
      <HStack>
        <Heading size="lg">Expenses</Heading>
        <Spacer />
        <Button size="sm" onClick={onToggle}>{isOpen ? 'Hide form' : 'Add expense'}</Button>
      </HStack>

      <Collapse in={isOpen} animateOpacity>
        <Card><CardBody>
          <TransactionForm
            kind="expense"
            baseCurrency={baseCurrency}
            onSaved={() => { reload(); forceReload((n) => n + 1); onClose() }}
          />
        </CardBody></Card>
      </Collapse>

      <Card><CardBody>
        <Heading size="sm" mb={3}>This month</Heading>
        {loading ? (
          <Center py={8}><Spinner color="brand.500" /></Center>
        ) : rows.length === 0 ? (
          <Text color="text.muted">Nothing logged yet.</Text>
        ) : (
          <List spacing={0}>
            {rows.map((r, i) => (
              <ListItem key={r.id}>
                {i > 0 && <Divider />}
                <HStack py={3} spacing={3}>
                  <CategoryBadge category={r.categories} />
                  <Stack spacing={0}>
                    <Text fontWeight="600">{r.description || r.categories?.name || 'Expense'}</Text>
                    <Text fontSize="xs" color="text.muted">{r.spent_at}</Text>
                  </Stack>
                  <Spacer />
                  <Stack spacing={0} align="end">
                    <Text fontWeight="semibold">{formatMoney(r.amount_minor, r.currency)}</Text>
                    {r.currency !== baseCurrency && (
                      <Badge fontSize="0.6rem" colorScheme="gray">{r.currency}</Badge>
                    )}
                  </Stack>
                </HStack>
              </ListItem>
            ))}
          </List>
        )}
      </CardBody></Card>
    </Stack>
  )
}
