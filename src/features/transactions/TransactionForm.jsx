import { useRef, useState } from 'react'
import {
  Button, Divider, FormControl, FormLabel, HStack, Input, Select, Stack, Textarea, useToast,
} from '@chakra-ui/react'
import { useCategories } from './useData.js'
import { toMinor, fromMinor, parseManualRate, CURRENCIES } from '../../shared/lib/currency.js'
import { useFxRate } from '../../shared/lib/fx.js'
import { today } from '../../shared/lib/dates.js'
import { insertTransaction, updateTransaction } from './writes.js'
import { saveErrorToast } from '../../shared/lib/saveError.js'
import ReceiptScanner from '../../shared/ui/ReceiptScanner.jsx'
import MoneyInput from '../../shared/ui/MoneyInput.jsx'
import FxPreview from './FxPreview.jsx'

// Fast-path entry for a single expense or income. Writes go through the
// offline queue so logging works with no connection. Pass `transaction` to
// edit an existing one instead of creating a new one.
export default function TransactionForm({ kind = 'expense', baseCurrency = 'EUR', transaction = null, onSaved }) {
  const isEdit = !!transaction
  const kindEff = transaction?.kind ?? kind
  const { categories } = useCategories(kindEff)
  const toast = useToast()
  const [amount, setAmount] = useState(
    transaction ? String(fromMinor(transaction.amount_minor, transaction.currency)) : '')
  const [currency, setCurrency] = useState(transaction?.currency ?? baseCurrency)
  const [categoryId, setCategoryId] = useState(transaction?.category_id ?? '')
  const [description, setDescription] = useState(transaction?.description ?? '')
  const [spentAt, setSpentAt] = useState(transaction?.spent_at ?? today)
  const [notes, setNotes] = useState(transaction?.notes ?? '')
  const [busy, setBusy] = useState(false)
  const [manualRate, setManualRate] = useState('')

  // Exchange rate: the ECB rate for the expense's date. Editing keeps the rate
  // the row was saved with unless its currency or date changes — except a
  // foreign row stored at exactly 1, which is the old broken lookup's fallback.
  const needsFx = currency !== baseCurrency
  const captured = Number(transaction?.exchange_rate)
  const keepCaptured = isEdit && needsFx && currency === transaction.currency &&
    spentAt === transaction.spent_at && captured > 0 && captured !== 1
  const fx = useFxRate(currency, baseCurrency, spentAt, { skip: keepCaptured })
  const rate = !needsFx ? 1
    : keepCaptured ? captured
      : fx.status === 'ok' ? fx.rate
        : fx.status === 'missing' ? parseManualRate(manualRate) : null
  // Stable across retries of one submit so a lost-response retry can't
  // duplicate; rotated after a successful insert for the next entry.
  const clientUuid = useRef(crypto.randomUUID())

  function handleScan({ total, date }) {
    if (total != null) setAmount(String(total))
    if (date) setSpentAt(date)
  }

  async function submit(e) {
    e.preventDefault()
    if (!amount || Number(amount) <= 0) {
      toast({ title: 'Enter an amount', status: 'warning' })
      return
    }
    // Never save a foreign amount without a real rate (no silent 1:1).
    if (!rate) {
      toast({
        title: fx.status === 'loading' ? 'Still fetching the exchange rate…' : 'Enter the exchange rate',
        status: 'warning',
      })
      return
    }
    setBusy(true)
    const exchange_rate = rate

    if (isEdit) {
      const fields = {
        kind: kindEff,
        category_id: categoryId || null,
        amount_minor: toMinor(amount, currency),
        currency,
        exchange_rate,
        description: description || null,
        notes: notes || null,
        spent_at: spentAt,
      }
      try {
        await updateTransaction(transaction.id, fields)
      } catch (e) {
        setBusy(false)
        toast(saveErrorToast(e))
        return
      }
      setBusy(false)
      toast({ title: 'Saved', status: 'success' })
      onSaved?.({ id: transaction.id, ...fields })
      return
    }

    // Capture the FX rate at entry time so historical balances never shift.
    try {
      await insertTransaction({
        client_uuid: clientUuid.current,
        kind: kindEff,
        category_id: categoryId || null,
        amount_minor: toMinor(amount, currency),
        currency,
        exchange_rate,
        description: description || null,
        notes: notes || null,
        spent_at: spentAt,
      })
    } catch (e) {
      setBusy(false)
      toast(saveErrorToast(e))
      return
    }
    clientUuid.current = crypto.randomUUID() // fresh id for the next entry
    setBusy(false)
    setAmount(''); setDescription(''); setNotes('')
    toast({ title: `${kindEff === 'income' ? 'Income' : 'Expense'} saved`, status: 'success' })
    onSaved?.()
  }

  return (
    <form onSubmit={submit}>
      <Stack spacing={3}>
        {kindEff === 'expense' && !isEdit && (
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
        {needsFx && (
          <FxPreview from={currency} to={baseCurrency} amountMinor={amount ? toMinor(amount, currency) : 0}
            fx={fx} captured={keepCaptured ? captured : null} rate={rate}
            manual={manualRate} onManual={setManualRate} />
        )}

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
              placeholder={kindEff === 'income' ? 'Paycheck' : 'Coffee'} />
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

        <Button type="submit" isLoading={busy} isDisabled={!rate}>
          {isEdit ? 'Save changes' : `Add ${kindEff === 'income' ? 'income' : 'expense'}`}
        </Button>
      </Stack>
    </form>
  )
}
