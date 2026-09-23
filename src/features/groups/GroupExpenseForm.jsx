import { useMemo, useState } from 'react'
import {
  Modal, ModalOverlay, ModalContent, ModalHeader, ModalBody, ModalFooter,
  Button, Stack, HStack, FormControl, FormLabel, Input, Select, Checkbox,
  Text, Divider, useToast, Spacer, IconButton, ButtonGroup,
  InputGroup, InputRightAddon,
} from '@chakra-ui/react'
import { Trash2 } from 'lucide-react'
import {
  toMinor, fromMinor, formatMoney, parseManualRate, CURRENCIES,
} from '../../shared/lib/currency.js'
import { useFxRate } from '../../shared/lib/fx.js'
import { today } from '../../shared/lib/dates.js'
import { distributeByWeights, splitEqually, expenseGroupAmount } from './splitMath.js'
import { addSharedExpense, updateSharedExpense, deleteSharedExpense } from './groups.js'
import ReceiptScanner from '../../shared/ui/ReceiptScanner.jsx'
import MoneyInput from '../../shared/ui/MoneyInput.jsx'
import FxPreview from '../../shared/ui/FxPreview.jsx'

const MODES = [
  { key: 'equal', label: 'Equally' },
  { key: 'exact', label: 'Amounts' },
  { key: 'percent', label: 'Percent' },
  { key: 'shares', label: 'Shares' },
]

// Reconstruct per-member input values when editing, from the stored shares.
// Shares are in the group currency, whatever currency the expense was paid in.
function prefillValues(expense, mode, groupCurrency) {
  const splits = expense?.expense_splits ?? []
  const total = expense?.group_amount_minor ?? expense?.amount_minor ?? 0
  const cur = groupCurrency
  const out = {}
  for (const s of splits) {
    if (mode === 'exact') out[s.member_id] = String(fromMinor(s.share_minor, cur))
    else if (mode === 'percent') out[s.member_id] = total ? String(Math.round((s.share_minor / total) * 1000) / 10) : ''
    else if (mode === 'shares') out[s.member_id] = String(s.share_minor)
  }
  return out
}

// An expense can be paid in any currency: the split is always worked out in
// the group currency, from the ECB rate for the expense's date (or a rate the
// user types when none can be fetched) — the same rules as a personal expense.
export default function GroupExpenseForm({ group, members, defaultPayer, expense, isOpen, onClose, onSaved }) {
  const toast = useToast()
  const isEdit = !!expense
  const cur = group.currency // shares and balances

  const initialMode = ['exact', 'percent', 'shares'].includes(expense?.split_type)
    ? expense.split_type
    : expense?.split_type === 'items' ? 'exact' : 'equal'

  const [description, setDescription] = useState(expense?.description ?? '')
  const [paidCurrency, setPaidCurrency] = useState(expense?.currency ?? cur)
  const [amount, setAmount] = useState(
    expense ? String(fromMinor(expense.amount_minor, expense.currency ?? cur)) : '')
  const [manualRate, setManualRate] = useState('')
  const [paidBy, setPaidBy] = useState(expense?.paid_by ?? defaultPayer ?? members[0]?.id ?? '')
  const [spentAt, setSpentAt] = useState(expense?.spent_at ?? today)
  const [splitWith, setSplitWith] = useState(
    expense ? (expense.expense_splits ?? []).map((s) => s.member_id) : members.map((m) => m.id))
  const [mode, setMode] = useState(initialMode)
  const [values, setValues] = useState(() => (isEdit ? prefillValues(expense, initialMode, cur) : {}))
  const [busy, setBusy] = useState(false)
  const [deleting, setDeleting] = useState(false)

  // Rate paid currency → group currency. Editing keeps the saved rate unless
  // the currency or date changes.
  const needsFx = paidCurrency !== cur
  const captured = Number(expense?.exchange_rate)
  const keepCaptured = isEdit && needsFx && paidCurrency === expense.currency &&
    spentAt === expense.spent_at && captured > 0
  const fx = useFxRate(paidCurrency, cur, spentAt, { skip: keepCaptured })
  const rate = !needsFx ? 1
    : keepCaptured ? captured
      : fx.status === 'ok' ? fx.rate
        : fx.status === 'missing' ? parseManualRate(manualRate) : null

  const includedIds = members.filter((m) => splitWith.includes(m.id)).map((m) => m.id)
  const paidMinor = amount && Number(amount) > 0 ? toMinor(amount, paidCurrency) : 0
  // What the split must add up to: the amount in the group currency.
  const totalMinor = expenseGroupAmount(paidMinor, paidCurrency, rate, cur) ?? 0
  const setVal = (id, v) => setValues((s) => ({ ...s, [id]: v }))

  function toggle(id) {
    setSplitWith((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]))
  }

  function handleScan({ total, date }) {
    if (total != null) setAmount(String(total))
    if (date) setSpentAt(date)
  }

  // Live-compute each included member's share (minor) for the current mode.
  const computed = useMemo(() => {
    if (includedIds.length === 0) return { shares: [], assigned: 0, ok: false }
    if (mode === 'equal') {
      const arr = splitEqually(totalMinor, includedIds.length)
      return { shares: arr, assigned: totalMinor, ok: totalMinor > 0 }
    }
    if (mode === 'exact') {
      const arr = includedIds.map((id) => (values[id] ? toMinor(values[id], cur) : 0))
      const assigned = arr.reduce((a, b) => a + b, 0)
      return { shares: arr, assigned, ok: totalMinor > 0 && assigned === totalMinor }
    }
    // percent / shares → weight-based
    const weights = includedIds.map((id) => Number(values[id]) || 0)
    const wsum = weights.reduce((a, b) => a + b, 0)
    const arr = distributeByWeights(totalMinor, weights)
    const ok = totalMinor > 0 && wsum > 0 &&
      (mode === 'shares' || Math.abs(wsum - 100) < 0.001)
    return { shares: arr, assigned: totalMinor, ok, wsum }
  }, [mode, includedIds, values, totalMinor, cur])

  const shareOf = (id) => {
    const i = includedIds.indexOf(id)
    return i >= 0 ? computed.shares[i] ?? 0 : 0
  }

  async function submit(e) {
    e.preventDefault()
    if (!amount || Number(amount) <= 0) return toast({ title: 'Enter an amount', status: 'warning' })
    // Never split a foreign amount without a real rate (no silent 1:1).
    if (!rate) {
      return toast({
        title: fx.status === 'loading' ? 'Still fetching the exchange rate…' : 'Enter the exchange rate',
        status: 'warning',
      })
    }
    if (!paidBy) return toast({ title: 'Who paid?', status: 'warning' })
    if (includedIds.length === 0) return toast({ title: 'Split between at least one person', status: 'warning' })

    if (mode === 'exact' && computed.assigned !== totalMinor) {
      const diff = totalMinor - computed.assigned
      return toast({
        title: 'Amounts must add up to the total',
        description: `${diff > 0 ? 'Missing' : 'Over by'} ${formatMoney(Math.abs(diff), cur)}`,
        status: 'warning',
      })
    }
    if (mode === 'percent' && !computed.ok) {
      return toast({ title: 'Percentages must add up to 100%', status: 'warning' })
    }
    if (mode === 'shares' && !computed.ok) {
      return toast({ title: 'Give at least one person a share', status: 'warning' })
    }

    const shares = mode === 'equal' ? null : includedIds.map((id) => shareOf(id))
    setBusy(true)
    try {
      if (isEdit) {
        await updateSharedExpense({
          expenseId: expense.id, description, amountMinor: paidMinor, currency: paidCurrency,
          exchangeRate: needsFx ? rate : null,
          paidBy, spentAt, memberIds: includedIds, shares, splitType: mode,
        })
        toast({ title: 'Expense updated', status: 'success' })
      } else {
        await addSharedExpense({
          groupId: group.id, description, amountMinor: paidMinor, currency: paidCurrency,
          exchangeRate: needsFx ? rate : null,
          paidBy, spentAt, memberIds: includedIds, shares, splitType: mode,
        })
        toast({ title: 'Expense added', status: 'success' })
      }
      onSaved?.()
      onClose()
    } catch (err) {
      toast({ title: err.message, status: 'error' })
    } finally { setBusy(false) }
  }

  async function remove() {
    setDeleting(true)
    try {
      await deleteSharedExpense(expense.id)
      toast({ title: 'Expense deleted', status: 'success' })
      onSaved?.()
      onClose()
    } catch (err) { toast({ title: err.message, status: 'error' }) }
    finally { setDeleting(false) }
  }

  const remaining = totalMinor - computed.assigned
  const pctSum = mode === 'percent' ? (computed.wsum ?? 0) : 0

  function summary() {
    if (includedIds.length === 0) return 'Pick at least one person.'
    if (needsFx && paidMinor && !rate) return 'The split needs the exchange rate.'
    if (!totalMinor) return 'Enter an amount to see the split.'
    if (mode === 'equal') return `${formatMoney(splitEqually(totalMinor, includedIds.length)[0], cur)} each`
    if (mode === 'exact') {
      if (remaining === 0) return 'Adds up to the total ✓'
      return `${formatMoney(Math.abs(remaining), cur)} ${remaining > 0 ? 'left to assign' : 'over the total'}`
    }
    if (mode === 'percent') {
      const r = Math.round((pctSum) * 10) / 10
      return r === 100 ? 'Adds up to 100% ✓' : `${r}% of 100% assigned`
    }
    return computed.wsum > 0 ? 'Split by shares' : 'Give someone a share'
  }
  const summaryOk = includedIds.length > 0 && totalMinor > 0 &&
    (mode === 'equal' || computed.ok)

  const addon = mode === 'percent' ? '%' : mode === 'shares' ? '×' : cur

  return (
    <Modal isOpen={isOpen} onClose={onClose} isCentered scrollBehavior="inside">
      <ModalOverlay />
      <ModalContent as="form" onSubmit={submit} mx={4}>
        <ModalHeader>{isEdit ? 'Edit expense' : 'Add shared expense'}</ModalHeader>
        <ModalBody>
          <Stack spacing={4}>
            {!isEdit && (
              <>
                <ReceiptScanner onScan={handleScan} />
                <Divider />
              </>
            )}
            <FormControl isRequired>
              <FormLabel>Description</FormLabel>
              <Input value={description} onChange={(e) => setDescription(e.target.value)}
                placeholder="Dinner, taxi, groceries…" />
            </FormControl>
            <HStack align="end">
              <FormControl isRequired>
                <FormLabel>Amount</FormLabel>
                <MoneyInput value={amount} onChange={setAmount} />
              </FormControl>
              <FormControl maxW="110px">
                <FormLabel>Currency</FormLabel>
                <Select value={paidCurrency} onChange={(e) => setPaidCurrency(e.target.value)}
                  aria-label="Currency paid in">
                  {(CURRENCIES.includes(cur) ? CURRENCIES : [cur, ...CURRENCIES]).map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </Select>
              </FormControl>
            </HStack>
            {needsFx && (
              <FxPreview from={paidCurrency} to={cur} amountMinor={paidMinor}
                fx={fx} captured={keepCaptured ? captured : null} rate={rate}
                manual={manualRate} onManual={setManualRate} />
            )}
            <FormControl maxW="200px">
              <FormLabel>Date</FormLabel>
              <Input type="date" value={spentAt} onChange={(e) => setSpentAt(e.target.value)} />
            </FormControl>
            <FormControl isRequired>
              <FormLabel>Paid by</FormLabel>
              <Select value={paidBy} onChange={(e) => setPaidBy(e.target.value)}>
                {members.map((m) => <option key={m.id} value={m.id}>{m.display_name}</option>)}
              </Select>
            </FormControl>

            <FormControl>
              <FormLabel mb={2}>Split</FormLabel>
              <ButtonGroup size="sm" isAttached variant="outline" mb={3} flexWrap="wrap">
                {MODES.map((m) => (
                  <Button key={m.key}
                    onClick={() => setMode(m.key)}
                    variant={mode === m.key ? 'solid' : 'outline'}
                    colorScheme={mode === m.key ? 'brand' : 'gray'}>
                    {m.label}
                  </Button>
                ))}
              </ButtonGroup>

              <Stack spacing={2}>
                {members.map((m) => {
                  const on = splitWith.includes(m.id)
                  return (
                    <HStack key={m.id} spacing={3}>
                      <Checkbox isChecked={on} onChange={() => toggle(m.id)} flex="1" minW={0}>
                        <Text noOfLines={1}>{m.display_name}</Text>
                      </Checkbox>
                      {on && mode !== 'equal' && (
                        <InputGroup size="sm" maxW="130px">
                          <Input type="number" inputMode="decimal" textAlign="right"
                            placeholder="0" value={values[m.id] ?? ''}
                            onChange={(e) => setVal(m.id, e.target.value)} />
                          <InputRightAddon>{addon}</InputRightAddon>
                        </InputGroup>
                      )}
                      {on && (
                        <Text fontSize="sm" color="text.muted" minW="72px" textAlign="right">
                          {formatMoney(shareOf(m.id), cur)}
                        </Text>
                      )}
                    </HStack>
                  )
                })}
              </Stack>

              <Text fontSize="sm" mt={2} fontWeight="600"
                color={summaryOk ? 'status.positive' : 'text.muted'}>
                {summary()}
              </Text>
            </FormControl>
          </Stack>
        </ModalBody>
        <ModalFooter gap={2}>
          {isEdit && (
            <>
              <IconButton aria-label="Delete expense" icon={<Trash2 size={16} />}
                variant="ghost" colorScheme="red" isLoading={deleting} onClick={remove} />
              <Spacer />
            </>
          )}
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button type="submit" isLoading={busy}>{isEdit ? 'Save' : 'Add expense'}</Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  )
}
