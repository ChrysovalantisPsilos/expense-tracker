import { useState } from 'react'
import {
  Modal, ModalOverlay, ModalContent, ModalHeader, ModalBody, ModalFooter,
  Button, Stack, HStack, FormControl, FormLabel, Input, Select, Checkbox,
  CheckboxGroup, Text, Divider, useToast, Wrap, WrapItem,
} from '@chakra-ui/react'
import { useAuth } from '../auth/AuthProvider.jsx'
import { toMinor } from '../lib/currency.js'
import { addSharedExpense } from '../lib/groups.js'
import { uploadReceipt } from '../lib/receipts.js'
import ReceiptScanner from './ReceiptScanner.jsx'

export default function GroupExpenseForm({ group, members, defaultPayer, isOpen, onClose, onSaved }) {
  const { user } = useAuth()
  const toast = useToast()
  const [description, setDescription] = useState('')
  const [amount, setAmount] = useState('')
  const [paidBy, setPaidBy] = useState(defaultPayer ?? members[0]?.id ?? '')
  const [spentAt, setSpentAt] = useState(() => new Date().toISOString().slice(0, 10))
  const [splitWith, setSplitWith] = useState(members.map((m) => m.id))
  const [receiptFile, setReceiptFile] = useState(null)
  const [busy, setBusy] = useState(false)

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
      let receiptPath = null
      if (receiptFile && navigator.onLine) {
        try { receiptPath = await uploadReceipt(user.id, receiptFile) } catch { /* save without */ }
      }
      await addSharedExpense({
        groupId: group.id,
        description,
        amountMinor: toMinor(amount, group.currency),
        currency: group.currency,
        paidBy,
        spentAt,
        memberIds: splitWith,
        receiptPath,
      })
      toast({ title: 'Expense added', status: 'success' })
      onSaved?.()
      onClose()
      // reset
      setDescription(''); setAmount(''); setReceiptFile(null)
      setSplitWith(members.map((m) => m.id))
    } catch (e) {
      toast({ title: e.message, status: 'error' })
    } finally { setBusy(false) }
  }

  const per = amount && splitWith.length
    ? (Number(amount) / splitWith.length).toFixed(2)
    : null

  return (
    <Modal isOpen={isOpen} onClose={onClose} isCentered scrollBehavior="inside">
      <ModalOverlay />
      <ModalContent as="form" onSubmit={submit} mx={4}>
        <ModalHeader>Add shared expense</ModalHeader>
        <ModalBody>
          <Stack spacing={4}>
            <ReceiptScanner onScan={handleScan} />
            <Divider />
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
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button type="submit" isLoading={busy}>Add expense</Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  )
}
