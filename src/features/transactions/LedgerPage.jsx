import {
  Stack, Card, CardBody, useDisclosure, Collapse, Text, Center, Spinner,
} from '@chakra-ui/react'
import { CalendarDays, Plus, X } from 'lucide-react'
import PageHeader, { PageAction } from '../../shared/ui/PageHeader.jsx'
import CardHeader from '../../shared/ui/CardHeader.jsx'
import TransactionForm from './TransactionForm.jsx'
import TransactionList from './TransactionList.jsx'
import { useTransactions } from './useData.js'
import { monthRange } from '../../shared/lib/dates.js'
import { useProfile } from '../../shared/lib/useProfile.js'

// The Expenses and Income pages: this month's entries of one kind, with the
// add form folded away behind the header's "Add" button until it's wanted.
// `extraAction` sits before that button.
export default function LedgerPage({ kind, title, addLabel, emptyText, extraAction }) {
  const { baseCurrency } = useProfile()
  const { from, to } = monthRange()
  const { rows, loading, reload, mutate } = useTransactions({ kind, from, to })
  const { isOpen, onToggle, onClose } = useDisclosure()

  return (
    <Stack spacing={5}>
      <PageHeader title={title} action={<>
        {extraAction}
        <PageAction icon={isOpen ? <X size={16} /> : <Plus size={16} />}
          label={isOpen ? 'Hide form' : addLabel} onClick={onToggle} />
      </>} />

      <Collapse in={isOpen} animateOpacity>
        <Card><CardBody>
          <TransactionForm kind={kind} baseCurrency={baseCurrency}
            onSaved={() => { reload(); onClose() }} />
        </CardBody></Card>
      </Collapse>

      <Card><CardBody>
        <CardHeader icon={CalendarDays} title="This month" />
        {loading ? (
          <Center py={8}><Spinner color="brand.500" /></Center>
        ) : rows.length === 0 ? (
          <Text color="text.muted">{emptyText}</Text>
        ) : (
          <TransactionList rows={rows} kind={kind} baseCurrency={baseCurrency}
            mutate={mutate} reload={reload} />
        )}
      </CardBody></Card>
    </Stack>
  )
}
