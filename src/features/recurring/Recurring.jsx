import { useMemo, useState } from 'react'
import {
  Stack, Text, Button, Center, Spinner,
  List, ListItem, Switch, Tag, SimpleGrid, Flex, Box, Modal, ModalOverlay, ModalContent, ModalHeader,
  ModalBody, ModalFooter, useToast,
  useDisclosure,
} from '@chakra-ui/react'
import { Plus, Pencil, Trash2, Repeat, Bell, Pause, Play } from 'lucide-react'
import CategoryBadge from '../../shared/ui/CategoryBadge.jsx'
import Panel from '../../shared/ui/kit/Panel.jsx'
import Figure from '../../shared/ui/kit/Figure.jsx'
import ItemRow from '../../shared/ui/kit/ItemRow.jsx'
import PageHeader, { PageAction } from '../../shared/ui/PageHeader.jsx'
import { useProfile } from '../../shared/lib/ProfileProvider.jsx'
import { formatMoney } from '../../shared/lib/currency.js'
import { shortDate } from '../../shared/lib/dates.js'
import { useRecurring, setRecurringActive, deleteRecurring } from './recurring.js'
import { monthlyMinor, frequencyLabel, monthlyBudgetShare } from './recurringMath.js'
import RecurringForm from './RecurringForm.jsx'
import QueryError from '../../shared/ui/QueryError.jsx'

export default function Recurring() {
  const { baseCurrency = 'EUR' } = useProfile()
  const { rules, loading, error, reload } = useRecurring()
  const toast = useToast()
  const form = useDisclosure()
  const [editing, setEditing] = useState(null)
  const [removing, setRemoving] = useState(null)

  const { expenseMonthly, incomeMonthly } = useMemo(() => {
    let e = 0, i = 0
    for (const r of rules) {
      if (!r.is_active) continue
      const m = monthlyMinor(r)
      if (r.kind === 'income') i += m; else e += m
    }
    return { expenseMonthly: e, incomeMonthly: i }
  }, [rules])

  function openNew() { setEditing(null); form.onOpen() }
  function openEdit(r) { setEditing(r); form.onOpen() }

  async function toggle(r) {
    try { await setRecurringActive(r.id, !r.is_active); reload() }
    catch (e) { toast({ title: e.message, status: 'error' }) }
  }
  async function confirmRemove() {
    try {
      await deleteRecurring(removing.id)
      toast({ title: 'Recurring entry removed', status: 'success' })
      setRemoving(null); reload()
    } catch (e) { toast({ title: e.message, status: 'error' }) }
  }

  return (
    <Stack spacing={5}>
      <PageHeader title="Recurring"
        action={<PageAction icon={<Plus size={16} />} label="Add" onClick={openNew} />} />

      <Panel>
        <SimpleGrid columns={2} spacing={4}>
          <Box>
            <Figure label="Subscriptions" size="lg" value={formatMoney(expenseMonthly, baseCurrency)} />
            <Text fontSize="xs" color="text.muted">per month</Text>
          </Box>
          <Box textAlign="right">
            <Figure label="Recurring income" size="lg" align="right" tone="positive"
              value={formatMoney(incomeMonthly, baseCurrency)} />
            <Text fontSize="xs" color="text.muted">per month</Text>
          </Box>
        </SimpleGrid>
      </Panel>

      <Panel>
        {error ? <QueryError error={error} onRetry={reload} what="recurring payments" /> : loading ? (
          <Center py={8}><Spinner color="brand.500" /></Center>
        ) : rules.length === 0 ? (
          <Stack align="center" py={8} spacing={3} color="text.muted">
            <Repeat size={28} />
            <Text>No recurring entries yet.</Text>
            <Button size="sm" onClick={openNew}>Add your first</Button>
          </Stack>
        ) : (
          <List spacing={0}>
            {rules.map((r) => (
              <ListItem key={r.id}>
                <ItemRow py={2.5} dimmed={!r.is_active}
                  media={<CategoryBadge category={r.categories} kind={r.kind} size={32} />}
                  title={r.description || r.categories?.name || (r.kind === 'income' ? 'Income' : 'Expense')}
                  meta={<RuleMeta rule={r} />}
                  amount={formatMoney(r.amount_minor, r.currency)}
                  amountTone={r.kind === 'income' ? 'positive' : 'default'}
                  trailing={
                    <Box display={{ base: 'none', sm: 'block' }} flexShrink={0}>
                      <Switch isChecked={r.is_active} onChange={() => toggle(r)}
                        aria-label={r.is_active ? 'Pause' : 'Resume'} />
                    </Box>
                  }
                  actionSlots={2} actions={[
                    { label: r.is_active ? 'Pause' : 'Resume', icon: r.is_active ? Pause : Play,
                      menuOnly: true, onClick: () => toggle(r) },
                    { label: 'Edit', icon: Pencil, onClick: () => openEdit(r) },
                    { label: 'Delete', icon: Trash2, danger: true, onClick: () => setRemoving(r) },
                  ]} />
              </ListItem>
            ))}
          </List>
        )}
      </Panel>

      {form.isOpen && (
        <RecurringForm rule={editing} baseCurrency={baseCurrency}
          onClose={form.onClose} onSaved={() => { form.onClose(); reload() }} />
      )}

      <Modal isOpen={!!removing} onClose={() => setRemoving(null)} isCentered>
        <ModalOverlay />
        <ModalContent mx={4}>
          <ModalHeader>Remove recurring entry?</ModalHeader>
          <ModalBody>
            <Text color="text.muted">
              “{removing?.description || removing?.categories?.name || 'This entry'}” will stop repeating.
              Transactions it already created stay.
            </Text>
          </ModalBody>
          <ModalFooter gap={2}>
            <Button variant="ghost" onClick={() => setRemoving(null)}>Cancel</Button>
            <Button colorScheme="red" onClick={confirmRemove}>Remove</Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </Stack>
  )
}

// The muted line under a rule's title: frequency · next date · a yearly
// expense's monthly budget share, plus its reminder and paused tags.
function RuleMeta({ rule: r }) {
  const share = monthlyBudgetShare(r)
  return (
    <Flex wrap="wrap" align="center" columnGap={1.5} rowGap={1} mt={0.5} fontSize="xs" color="text.muted">
      <Text whiteSpace="nowrap">{frequencyLabel(r)}</Text>
      <Text whiteSpace="nowrap">· next {shortDate(r.next_run)}</Text>
      {share && (
        <Text whiteSpace="nowrap">
          · {share.exact ? '' : '≈ '}{formatMoney(share.perMonth, r.currency)}/month in budgets
        </Text>
      )}
      {r.remind_days_before != null && (
        <Tag size="sm" colorScheme="brand" borderRadius="full" px={2}>
          <Bell size={10} style={{ marginRight: 3 }} /> {r.remind_days_before}d
        </Tag>
      )}
      {!r.is_active && <Tag size="sm" borderRadius="full">Paused</Tag>}
    </Flex>
  )
}
