import { useMemo, useState } from 'react'
import {
  Modal, ModalOverlay, ModalContent, ModalHeader, ModalBody, ModalFooter,
  Button, Stack, HStack, FormControl, FormLabel, Input, Select, Checkbox,
  Text, Divider, useToast, Spacer, IconButton, ButtonGroup,
  InputGroup, InputRightAddon,
} from '@chakra-ui/react'
import { Trash2 } from 'lucide-react'
import { useAuth } from '../auth/AuthProvider.jsx'
import { toMinor, fromMinor, formatMoney } from '../lib/currency.js'
import { distributeByWeights, splitEqually } from '../lib/splitMath.js'
import { addSharedExpense, updateSharedExpense, deleteSharedExpense } from '../lib/groups.js'
import { uploadReceipt } from '../lib/receipts.js'
import ReceiptScanner from './ReceiptScanner.jsx'
import MoneyInput from './MoneyInput.jsx'

const MODES = [
  { key: 'equal', label: 'Equally' },
  { key: 'exact', label: 'Amounts' },
  { key: 'percent', label: 'Percent' },
  { key: 'shares', label: 'Shares' },
]

// Reconstruct per-member input values when editing, from the stored shares.
function prefillValues(expense, mode) {
  const splits = expense?.expense_splits ?? []
  const total = expense?.amount_minor ?? 0
  const cur = expense?.currency
  const out = {}
  for (const s of splits) {
    if (mode === 'exact') out[s.member_id] = String(fromMinor(s.share_minor, cur))
    else if (mode === 'percent') out[s.member_id] = total ? String(Math.round((s.share_minor / total) * 1000) / 10) : ''
    else if (mode === 'shares') out[s.member_id] = String(s.share_minor)
  }
  return out
}

export default function GroupExpenseForm({ group, members, defaultPayer, expense, isOpen, onClose, onSaved }) {
  const { user } = useAuth()
  const toast = useToast()
  const isEdit = !!expense
  const cur = group.currency

  const initialMode = ['exact', 'percent', 'shares'].includes(expense?.split_type)
    ? expense.split_type
    : expense?.split_type === 'items' ? 'exact' : 'equal'

  const [description, setDescription] = useState(expense?.description ?? '')
  const [amount, setAmount] = useState(
    expense ? String(fromMinor(expense.amount_minor, cur)) : '')
  const [paidBy, setPaidBy] = useState(expense?.paid_by ?? defaultPayer ?? members[0]?.id ?? '')
  const [spentAt, setSpentAt] = useState(expense?.spent_at ?? new Date().toISOString().slice(0, 10))
  const [splitWith, setSplitWith] = useState(
    expense ? (expense.expense_splits ?? []).map((s) => s.member_id) : members.map((m) => m.id))
  const [mode, setMode] = useState(initialMode)
  const [values, setValues] = useState(() => (isEdit ? prefillValues(expense, initialMode) : {}))
  const [receiptFile, setReceiptFile] = useState(null)
  const [busy, setBusy] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const includedIds = members.filter((m) => splitWith.includes(m.id)).map((m) => m.id)
  const totalMinor = amount && Number(amount) > 0 ? toMinor(amount, cur) : 0
  const setVal = (id, v) => setValues((s) => ({ ...s, [id]: v }))

  function toggle(id) {
    setSplitWith((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]))
  }

  function handleScan({ file, total, date }) {
    setReceiptFile(file)
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
          expenseId: expense.id, description, amountMinor: totalMinor, currency: cur,
          paidBy, spentAt, memberIds: includedIds, shares, splitType: mode,
        })
        toast({ title: 'Expense updated', status: 'success' })
      } else {
        let receiptPath = null
        if (receiptFile && navigator.onLine) {
          try { receiptPath = await uploadReceipt(user.id, receiptFile) } catch { /* save without */ }
        }
        await addSharedExpense({
          groupId: group.id, description, amountMinor: totalMinor, currency: cur,
          paidBy, spentAt, memberIds: includedIds, shares, splitType: mode, receiptPath,
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
            <HStack>
              <FormControl isRequired>
                <FormLabel>Amount ({cur})</FormLabel>
                <MoneyInput value={amount} onChange={setAmount} />
              </FormControl>
              <FormControl maxW="160px">
                <FormLabel>Date</FormLabel>
                <Input type="date" value={spentAt} onChange={(e) => setSpentAt(e.target.value)} />
              </FormControl>
            </HStack>
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
                color={summaryOk ? 'green.500' : 'text.muted'}>
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
