import { useNavigate } from 'react-router-dom'
import {
  Stack, Card, CardBody, useDisclosure, Collapse, Text, Center, Spinner,
} from '@chakra-ui/react'
import { CalendarDays, FileSpreadsheet, Plus, X } from 'lucide-react'
import PageHeader, { PageAction } from '../../shared/ui/PageHeader.jsx'
import CardHeader from '../../shared/ui/CardHeader.jsx'
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
      <PageHeader title="Expenses" action={<>
        <PageAction variant="ghost" icon={<FileSpreadsheet size={16} />} label="Import"
          onClick={() => navigate('/import')} />
        <PageAction icon={isOpen ? <X size={16} /> : <Plus size={16} />}
          label={isOpen ? 'Hide form' : 'Add expense'} onClick={onToggle} />
      </>} />

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
        <CardHeader icon={CalendarDays} title="This month" />
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
