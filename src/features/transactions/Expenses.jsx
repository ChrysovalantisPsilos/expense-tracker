import { useNavigate } from 'react-router-dom'
import {
  Heading, Stack, Card, CardBody, Button, useDisclosure, Collapse,
  HStack, Text, Spacer, Center, Spinner,
} from '@chakra-ui/react'
import { FileSpreadsheet } from 'lucide-react'
import TransactionForm from './TransactionForm.jsx'
import TransactionList from './TransactionList.jsx'
import { useTransactions, monthRange } from './useData.js'
import { useProfile } from '../../shared/lib/useProfile.js'

export default function Expenses() {
  const navigate = useNavigate()
  const { baseCurrency } = useProfile()
  const { from, to } = monthRange()
  const { rows, loading, reload, mutate } = useTransactions({ kind: 'expense', from, to, withGroup: true })
  const { isOpen, onToggle, onClose } = useDisclosure({ defaultIsOpen: true })

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
          <TransactionList rows={rows} kind="expense" baseCurrency={baseCurrency}
            mutate={mutate} reload={reload} />
        )}
      </CardBody></Card>
    </Stack>
  )
}
