import { useState } from 'react'
import {
  Modal, ModalOverlay, ModalContent, ModalHeader, ModalBody, ModalFooter,
  Button, Stack, HStack, FormControl, FormLabel, Input, Select, Checkbox,
  CheckboxGroup, Text, Divider, useToast, Wrap, WrapItem, Spacer, IconButton,
} from '@chakra-ui/react'
import { Trash2 } from 'lucide-react'
import { useAuth } from '../auth/AuthProvider.jsx'
import { toMinor, fromMinor } from '../lib/currency.js'
import { addSharedExpense, updateSharedExpense, deleteSharedExpense } from '../lib/groups.js'
import { uploadReceipt } from '../lib/receipts.js'
import ReceiptScanner from './ReceiptScanner.jsx'

export default function GroupExpenseForm({ group, members, defaultPayer, expense, isOpen, onClose, onSaved }) {
  const { user } = useAuth()
  const toast = useToast()
  const isEdit = !!expense
  const [description, setDescription] = useState(expense?.description ?? '')
  const [amount, setAmount] = useState(
    expense ? String(fromMinor(expense.amount_minor, expense.currency)) : '')
  const [paidBy, setPaidBy] = useState(expense?.paid_by ?? defaultPayer ?? members[0]?.id ?? '')
  const [spentAt, setSpentAt] = useState(expense?.spent_at ?? new Date().toISOString().slice(0, 10))
  const [splitWith, setSplitWith] = useState(
    expense ? (expense.expense_splits ?? []).map((s) => s.member_id) : members.map((m) => m.id))
  const [receiptFile, setReceiptFile] = useState(null)
  const [busy, setBusy] = useState(false)
  const [deleting, setDeleting] = useState(false)

  function handleScan({ file, total, date }) {
    setReceiptFile(file)
    if (total != null) setAmount(String(total))
    if (date) setSpentAt(date)
  }

  async function submit(e) {
    e.preventDefault()
    if (!amount || Number(amount) <= 0) return toast({ title: 'Enter an amount', status: 'warning' })
    if (!paidBy) return toast({ title: 'Who paid?', status: 'warning' })
    if (splitWith.length === 0) return toast({ title: 'Split between at least one person', status: 'warning' })
    setBusy(true)
    try {
      if (isEdit) {
        await updateSharedExpense({
          expenseId: expense.id, description, amountMinor: toMinor(amount, group.currency),
          currency: group.currency, paidBy, spentAt, memberIds: splitWith,
        })
        toast({ title: 'Expense updated', status: 'success' })
      } else {
        let receiptPath = null
        if (receiptFile && navigator.onLine) {
          try { receiptPath = await uploadReceipt(user.id, receiptFile) } catch { /* save without */ }
        }
        await addSharedExpense({
          groupId: group.id, description, amountMinor: toMinor(amount, group.currency),
          currency: group.currency, paidBy, spentAt, memberIds: splitWith, receiptPath,
        })
        toast({ title: 'Expense added', status: 'success' })
      }
      onSaved?.()
      onClose()
    } catch (e) {
      toast({ title: e.message, status: 'error' })
    } finally { setBusy(false) }
  }

  async function remove() {
    setDeleting(true)
    try {
      await deleteSharedExpense(expense.id)
      toast({ title: 'Expense deleted', status: 'success' })
      onSaved?.()
      onClose()
    } catch (e) { toast({ title: e.message, status: 'error' }) }
    finally { setDeleting(false) }
  }

  const per = amount && splitWith.length
    ? (Number(amount) / splitWith.length).toFixed(2)
    : null

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
                <FormLabel>Amount ({group.currency})</FormLabel>
                <Input type="number" step="0.01" inputMode="decimal" value={amount}
                  onChange={(e) => setAmount(e.target.value)} placeholder="0.00" />
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
              <FormLabel>Split equally between</FormLabel>
              <CheckboxGroup value={splitWith} onChange={setSplitWith}>
                <Wrap spacing={3}>
                  {members.map((m) => (
                    <WrapItem key={m.id}>
                      <Checkbox value={m.id}>{m.display_name}</Checkbox>
                    </WrapItem>
                  ))}
                </Wrap>
              </CheckboxGroup>
              {per && (
                <Text fontSize="sm" color="text.muted" mt={2}>
                  {group.currency} {per} each ({splitWith.length} {splitWith.length === 1 ? 'person' : 'people'})
                </Text>
              )}
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
