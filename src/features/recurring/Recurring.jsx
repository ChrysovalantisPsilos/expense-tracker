import { useMemo, useState } from 'react'
import {
  Heading, Stack, Card, CardBody, HStack, Text, Spacer, Button, Center, Spinner,
  List, ListItem, Divider, IconButton, Switch, Tag, SimpleGrid, Stat, StatLabel,
  StatNumber, StatHelpText, Modal, ModalOverlay, ModalContent, ModalHeader,
  ModalBody, ModalFooter, FormControl, FormLabel, Input, Select, useToast,
  useDisclosure, NumberInput, NumberInputField,
} from '@chakra-ui/react'
import { Plus, Pencil, Trash2, Repeat, Bell } from 'lucide-react'
import CategoryBadge from '../../shared/ui/CategoryBadge.jsx'
import MoneyInput from '../../shared/ui/MoneyInput.jsx'
import OptionalDate from '../../shared/ui/OptionalDate.jsx'
import { useProfile } from '../../shared/lib/useProfile.js'
import { useCategories } from '../transactions/useData.js'
import { toMinor, fromMinor, formatMoney } from '../../shared/lib/currency.js'
import { today } from '../../shared/lib/dates.js'
import { useAsyncSubmit } from '../../shared/lib/useAsyncSubmit.js'
import { enablePush } from '../../shared/lib/push.js'
import {
  useRecurring, monthlyMinor, frequencyLabel, FREQUENCIES,
  saveRecurring, setRecurringActive, deleteRecurring,
} from './recurring.js'

export default function Recurring() {
  const { baseCurrency = 'EUR' } = useProfile()
  const { rules, loading, reload } = useRecurring()
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
      <HStack>
        <Heading size="lg">Recurring</Heading>
        <Spacer />
        <Button size="sm" leftIcon={<Plus size={16} />} onClick={openNew}>Add</Button>
      </HStack>

      <SimpleGrid columns={{ base: 2, sm: 2 }} spacing={4}>
        <Card><CardBody>
          <Stat>
            <StatLabel>Subscriptions</StatLabel>
            <StatNumber>{formatMoney(expenseMonthly, baseCurrency)}</StatNumber>
            <StatHelpText>per month</StatHelpText>
          </Stat>
        </CardBody></Card>
        <Card><CardBody>
          <Stat>
            <StatLabel>Recurring income</StatLabel>
            <StatNumber color="green.500">{formatMoney(incomeMonthly, baseCurrency)}</StatNumber>
            <StatHelpText>per month</StatHelpText>
          </Stat>
        </CardBody></Card>
      </SimpleGrid>

      <Card><CardBody>
        {loading ? (
          <Center py={8}><Spinner color="brand.500" /></Center>
        ) : rules.length === 0 ? (
          <Stack align="center" py={8} spacing={3} color="text.muted">
            <Repeat size={28} />
            <Text>No recurring entries yet.</Text>
            <Button size="sm" onClick={openNew}>Add your first</Button>
          </Stack>
        ) : (
          <List spacing={0}>
            {rules.map((r, i) => (
              <ListItem key={r.id}>
                {i > 0 && <Divider />}
                <HStack py={3} spacing={3} align="center" opacity={r.is_active ? 1 : 0.55}>
                  <CategoryBadge category={r.categories} kind={r.kind} />
                  <Stack spacing={0} flex="1" minW={0}>
                    <HStack spacing={2}>
                      <Text fontWeight="600" noOfLines={1}>
                        {r.description || r.categories?.name || (r.kind === 'income' ? 'Income' : 'Expense')}
                      </Text>
                      {!r.is_active && <Tag size="sm">Paused</Tag>}
                    </HStack>
                    <HStack spacing={1.5}>
                      <Text fontSize="xs" color="text.muted">
                        {frequencyLabel(r)} · next {r.next_run}
                      </Text>
                      {r.remind_days_before != null && (
                        <Tag size="sm" colorScheme="brand" px={1.5}>
                          <Bell size={10} style={{ marginRight: 3 }} /> {r.remind_days_before}d
                        </Tag>
                      )}
                    </HStack>
                  </Stack>
                  <Stack spacing={0} align="end">
                    <Text fontWeight="600" color={r.kind === 'income' ? 'green.500' : 'text.primary'}>
                      {formatMoney(r.amount_minor, r.currency)}
                    </Text>
                    <Text fontSize="xs" color="text.muted">
                      {formatMoney(monthlyMinor(r), r.currency)}/mo
                    </Text>
                  </Stack>
                  <Switch isChecked={r.is_active} onChange={() => toggle(r)} colorScheme="brand" />
                  <IconButton aria-label="Edit" size="xs" variant="ghost"
                    icon={<Pencil size={14} />} onClick={() => openEdit(r)} />
                  <IconButton aria-label="Delete" size="xs" variant="ghost" color="red.400"
                    icon={<Trash2 size={14} />} onClick={() => setRemoving(r)} />
                </HStack>
              </ListItem>
            ))}
          </List>
        )}
      </CardBody></Card>

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

function RecurringForm({ rule, baseCurrency, onClose, onSaved }) {
  const toast = useToast()
  const isEdit = !!rule
  const [kind, setKind] = useState(rule?.kind ?? 'expense')
  const { categories } = useCategories(kind)
  const [amount, setAmount] = useState(rule ? String(fromMinor(rule.amount_minor, rule.currency)) : '')
  const [currency] = useState(rule?.currency ?? baseCurrency)
  const [categoryId, setCategoryId] = useState(rule?.category_id ?? '')
  const [description, setDescription] = useState(rule?.description ?? '')
  const [frequency, setFrequency] = useState(rule?.frequency ?? 'monthly')
  const [intervalN, setIntervalN] = useState(String(rule?.interval_n ?? 1))
  const [nextRun, setNextRun] = useState(rule?.next_run ?? today())
  const [endDate, setEndDate] = useState(rule?.end_date ?? '')
  const [remind, setRemind] = useState(rule?.remind_days_before != null)
  const [remindDays, setRemindDays] = useState(String(rule?.remind_days_before ?? 3))
  const { busy, run } = useAsyncSubmit()

  // Enrol this device for push the moment reminders are switched on — the
  // flip is the user gesture iOS needs for the permission prompt. A refusal
  // isn't fatal: reminders still land in the app's notification bell.
  async function toggleRemind(e) {
    const on = e.target.checked
    setRemind(on)
    if (!on) return
    try {
      const status = await enablePush()
      if (status === 'denied') {
        toast({ title: 'Push blocked', status: 'info',
          description: 'Reminders will show in the app’s notification bell instead.' })
      } else if (status === 'unsupported') {
        toast({ title: 'Push isn’t available in this browser', status: 'info',
          description: 'On iPhone, install Budge to your home screen first. Reminders will still show in the bell.' })
      }
    } catch {
      toast({ title: 'Couldn’t enable push on this device', status: 'warning',
        description: 'Reminders will show in the app’s notification bell.' })
    }
  }

  async function submit(e) {
    e.preventDefault()
    if (!amount || Number(amount) <= 0) return toast({ title: 'Enter an amount', status: 'warning' })
    await run(async () => {
      await saveRecurring({
        id: rule?.id,
        kind,
        category_id: categoryId || null,
        amount_minor: toMinor(amount, currency),
        currency,
        description: description || null,
        frequency,
        interval_n: Math.max(1, parseInt(intervalN, 10) || 1),
        next_run: nextRun,
        end_date: endDate || null,
        is_active: rule?.is_active ?? true,
        remind_days_before: remind
          ? Math.min(60, Math.max(1, parseInt(remindDays, 10) || 3))
          : null,
      })
      toast({ title: isEdit ? 'Recurring entry updated' : 'Recurring entry added', status: 'success' })
      onSaved()
    })
  }

  return (
    <Modal isOpen onClose={onClose} isCentered scrollBehavior="inside">
      <ModalOverlay />
      <ModalContent as="form" onSubmit={submit} mx={4}>
        <ModalHeader>{isEdit ? 'Edit recurring entry' : 'New recurring entry'}</ModalHeader>
        <ModalBody>
          <Stack spacing={4}>
            <HStack spacing={2}>
              <Button flex="1" variant={kind === 'expense' ? 'solid' : 'outline'}
                colorScheme={kind === 'expense' ? 'brand' : 'gray'}
                onClick={() => { setKind('expense'); setCategoryId('') }}>Expense</Button>
              <Button flex="1" variant={kind === 'income' ? 'solid' : 'outline'}
                colorScheme={kind === 'income' ? 'brand' : 'gray'}
                onClick={() => { setKind('income'); setCategoryId('') }}>Income</Button>
            </HStack>

            <FormControl isRequired>
              <FormLabel>Description</FormLabel>
              <Input value={description} onChange={(e) => setDescription(e.target.value)}
                placeholder={kind === 'income' ? 'Salary' : 'Netflix, rent, gym…'} />
            </FormControl>

            <FormControl isRequired>
              <FormLabel>Amount ({currency})</FormLabel>
              <MoneyInput value={amount} onChange={setAmount} />
            </FormControl>

            <FormControl>
              <FormLabel>Category</FormLabel>
              <Select placeholder="Uncategorized" value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}>
                {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </Select>
            </FormControl>

            <HStack align="end">
              <FormControl maxW="120px">
                <FormLabel>Every</FormLabel>
                <NumberInput min={1} value={intervalN} onChange={setIntervalN}>
                  <NumberInputField />
                </NumberInput>
              </FormControl>
              <FormControl>
                <FormLabel>Frequency</FormLabel>
                <Select value={frequency} onChange={(e) => setFrequency(e.target.value)}>
                  {FREQUENCIES.map((f) => (
                    <option key={f} value={f}>{f.charAt(0).toUpperCase() + f.slice(1)}</option>
                  ))}
                </Select>
              </FormControl>
            </HStack>

            <FormControl>
              <FormLabel>Next charge</FormLabel>
              <Input type="date" value={nextRun} onChange={(e) => setNextRun(e.target.value)} />
            </FormControl>
            <FormControl>
              <OptionalDate label="Set an end date" value={endDate} onChange={setEndDate} />
            </FormControl>

            <FormControl>
              <HStack justify="space-between">
                <FormLabel mb={0} htmlFor="remind-switch">
                  <HStack spacing={2}>
                    <Bell size={15} />
                    <Text>Remind me before each charge</Text>
                  </HStack>
                </FormLabel>
                <Switch id="remind-switch" colorScheme="brand"
                  isChecked={remind} onChange={toggleRemind} />
              </HStack>
              {remind && (
                <HStack mt={3} spacing={2}>
                  <NumberInput min={1} max={60} maxW="90px" value={remindDays}
                    onChange={setRemindDays}>
                    <NumberInputField />
                  </NumberInput>
                  <Text fontSize="sm" color="text.muted">days before, via notification</Text>
                </HStack>
              )}
            </FormControl>
          </Stack>
        </ModalBody>
        <ModalFooter gap={2}>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button type="submit" isLoading={busy}>{isEdit ? 'Save' : 'Add'}</Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  )
}
