import { useState } from 'react'
import {
  Button, Divider, FormControl, FormLabel, HStack, Input, Select, Stack, Textarea, useToast,
} from '@chakra-ui/react'
import { useAuth } from '../auth/AuthProvider.jsx'
import { useCategories } from '../lib/useData.js'
import { toMinor, getRate, CURRENCIES } from '../lib/currency.js'
import { queueTransaction } from '../lib/offlineQueue.js'
import { uploadReceipt } from '../lib/receipts.js'
import ReceiptScanner from './ReceiptScanner.jsx'
import MoneyInput from './MoneyInput.jsx'

// Fast-path entry for a single expense or income. Writes go through the
// offline queue so logging works with no connection.
export default function TransactionForm({ kind = 'expense', baseCurrency = 'EUR', onSaved }) {
  const { user } = useAuth()
  const { categories } = useCategories(kind)
  const toast = useToast()
  const [amount, setAmount] = useState('')
  const [currency, setCurrency] = useState(baseCurrency)
  const [categoryId, setCategoryId] = useState('')
  const [description, setDescription] = useState('')
  const [spentAt, setSpentAt] = useState(() => new Date().toISOString().slice(0, 10))
  const [notes, setNotes] = useState('')
  const [receiptFile, setReceiptFile] = useState(null)
  const [busy, setBusy] = useState(false)

  function handleScan({ file, total, date }) {
    setReceiptFile(file)
    if (total != null) setAmount(String(total))
    if (date) setSpentAt(date)
  }

  async function submit(e) {
    e.preventDefault()
    if (!amount || Number(amount) <= 0) {
      toast({ title: 'Enter an amount', status: 'warning' })
      return
    }
    setBusy(true)

    // Upload the receipt image first (only possible online). If it fails or
    // we're offline, save the transaction anyway without the attachment.
    let receipt_path = null
    if (receiptFile && navigator.onLine) {
      try {
        receipt_path = await uploadReceipt(user.id, receiptFile)
      } catch {
        toast({ title: 'Saved, but the receipt image could not be uploaded.', status: 'warning' })
      }
    } else if (receiptFile) {
      toast({ title: 'Offline — saved without the receipt image.', status: 'info' })
    }

    // Capture the FX rate at entry time so historical balances never shift.
    const exchange_rate = await getRate(currency, baseCurrency)
    await queueTransaction({
      user_id: user.id,
      kind,
      category_id: categoryId || null,
      amount_minor: toMinor(amount, currency),
      currency,
      exchange_rate,
      description: description || null,
      notes: notes || null,
      spent_at: spentAt,
      receipt_path,
    })
    setBusy(false)
    setAmount(''); setDescription(''); setNotes(''); setReceiptFile(null)
    toast({ title: `${kind === 'income' ? 'Income' : 'Expense'} saved`, status: 'success' })
    onSaved?.()
  }

  return (
    <form onSubmit={submit}>
      <Stack spacing={3}>
        {kind === 'expense' && (
          <>
            <ReceiptScanner onScan={handleScan} />
            <Divider />
          </>
        )}
        <HStack>
          <FormControl isRequired>
            <FormLabel>Amount</FormLabel>
            <MoneyInput value={amount} onChange={setAmount} />
          </FormControl>
          <FormControl maxW="110px">
            <FormLabel>Currency</FormLabel>
            <Select value={currency} onChange={(e) => setCurrency(e.target.value)}>
              {CURRENCIES.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </Select>
          </FormControl>
        </HStack>

        <FormControl>
          <FormLabel>Category</FormLabel>
          <Select placeholder="Uncategorized" value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </Select>
        </FormControl>

        <HStack align="end">
          <FormControl>
            <FormLabel>Description</FormLabel>
            <Input value={description} onChange={(e) => setDescription(e.target.value)}
              placeholder={kind === 'income' ? 'Paycheck' : 'Coffee'} />
          </FormControl>
          <FormControl maxW="170px">
            <FormLabel>Date</FormLabel>
            <Input type="date" value={spentAt} onChange={(e) => setSpentAt(e.target.value)} />
          </FormControl>
        </HStack>

        <FormControl>
          <FormLabel>Notes</FormLabel>
          <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </FormControl>

        <Button type="submit" isLoading={busy}>
          Add {kind === 'income' ? 'income' : 'expense'}
        </Button>
      </Stack>
    </form>
  )
}
