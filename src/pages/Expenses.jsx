import { useNavigate } from 'react-router-dom'
import {
  Heading, Stack, Card, CardBody, Button, useDisclosure, Collapse,
  List, ListItem, HStack, Text, Spacer, Badge, Center, Spinner, Divider,
  IconButton, useToast, Tag,
} from '@chakra-ui/react'
import { Paperclip, FileSpreadsheet } from 'lucide-react'
import TransactionForm from '../components/TransactionForm.jsx'
import CategoryBadge from '../components/CategoryBadge.jsx'
import { useTransactions, monthRange } from '../lib/useData.js'
import { useProfile } from '../lib/useProfile.js'
import { formatMoney } from '../lib/currency.js'
import { receiptUrl } from '../lib/receipts.js'

export default function Expenses() {
  const navigate = useNavigate()
  const { baseCurrency } = useProfile()
  const { from, to } = monthRange()
  const { rows, loading, reload } = useTransactions({ kind: 'expense', from, to })
  const { isOpen, onToggle, onClose } = useDisclosure({ defaultIsOpen: true })
  const toast = useToast()

  async function openReceipt(path) {
    const url = await receiptUrl(path)
    if (url) window.open(url, '_blank', 'noopener')
    else toast({ title: 'Could not open receipt', status: 'error' })
  }

  return (
    <Stack spacing={5}>
      <HStack>
        <Heading size="lg">Expenses</Heading>
        <Spacer />
        <Button size="sm" variant="ghost" leftIcon={<FileSpreadsheet size={16} />}
          onClick={() => navigate('/import')}>Import</Button>
        <Button size="sm" onClick={onToggle}>{isOpen ? 'Hide form' : 'Add expense'}</Button>
      </HStack>

      <Collapse in={isOpen} animateOpacity>
        <Card><CardBody>
          <TransactionForm
            kind="expense"
            baseCurrency={baseCurrency}
            onSaved={() => { reload(); onClose() }}
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
                    <HStack spacing={2}>
                      <Text fontWeight="600">{r.description || r.categories?.name || 'Expense'}</Text>
                      {r.group_expense_id && <Tag size="sm" colorScheme="brand">Group</Tag>}
                    </HStack>
                    <Text fontSize="xs" color="text.muted">{r.spent_at}</Text>
                  </Stack>
                  <Spacer />
                  {r.receipt_path && (
                    <IconButton aria-label="View receipt" size="sm" variant="ghost"
                      icon={<Paperclip size={16} />} onClick={() => openReceipt(r.receipt_path)} />
                  )}
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
