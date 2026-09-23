import { useRef, useState } from 'react'
import { Link as RouterLink } from 'react-router-dom'
import {
  Button, Divider, FormControl, FormHelperText, FormLabel, HStack, Input, Link, Select, Stack,
  Switch, Text, Textarea, useToast, NumberInput, NumberInputField,
} from '@chakra-ui/react'
import { useCategories } from './useData.js'
import { toMinor, fromMinor, parseManualRate, CURRENCIES } from '../../shared/lib/currency.js'
import { useFxRate } from '../../shared/lib/fx.js'
import { today, shortDate } from '../../shared/lib/dates.js'
import { insertTransaction, updateTransaction } from './writes.js'
import { saveRecurring } from '../recurring/recurring.js'
import { frequencyLabel, nextRunAfter, ruleFromTransaction } from '../recurring/recurringMath.js'
import { saveErrorToast } from '../../shared/lib/saveError.js'
import ReceiptScanner from '../../shared/ui/ReceiptScanner.jsx'
import MoneyInput from '../../shared/ui/MoneyInput.jsx'
import FxPreview from '../../shared/ui/FxPreview.jsx'

// Fast-path entry for a single expense or income. Pass `transaction` to edit
// an existing one instead of creating a new one. "Repeat" also makes it a
// recurring rule whose next charge is one period after the entry's date (the
// entry itself is the first occurrence).
const REPEAT_FREQUENCIES = [['weekly', 'Weekly'], ['monthly', 'Monthly'], ['yearly', 'Yearly']]
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
  const [repeat, setRepeat] = useState(false)
  const [repeatFreq, setRepeatFreq] = useState('monthly')
  const [repeatN, setRepeatN] = useState('1')
  const repeatEvery = Math.max(1, parseInt(repeatN, 10) || 1)
  const alreadyRepeats = !!transaction?.recurring_rule_id

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
    // After the entry is saved: the rule it repeats by (never fails the save).
    const makeRecurring = async (entry) => {
      if (!repeat) return
      try {
        await saveRecurring(ruleFromTransaction(entry, { frequency: repeatFreq, interval_n: repeatEvery }))
      } catch (err) {
        toast({ title: 'Saved, but it couldn’t be set to repeat', description: err.message, status: 'warning' })
      }
    }

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
      await makeRecurring({ ...fields, id: transaction.id, account_id: transaction.account_id })
      setBusy(false)
      toast({ title: 'Saved', status: 'success' })
      onSaved?.({ id: transaction.id, ...fields })
      return
    }

    // Capture the FX rate at entry time so historical balances never shift.
    const row = {
      client_uuid: clientUuid.current,
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
      await insertTransaction(row)
    } catch (e) {
      setBusy(false)
      toast(saveErrorToast(e))
      return
    }
    await makeRecurring(row) // linked through row.client_uuid
    clientUuid.current = crypto.randomUUID() // fresh id for the next entry
    setBusy(false)
    setAmount(''); setDescription(''); setNotes('')
    setRepeat(false)
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
          <FormHelperText>
            <Link as={RouterLink} to="/settings/categories" color="accent.fg">Manage categories</Link>
          </FormHelperText>
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

        {alreadyRepeats ? (
          <Text fontSize="sm" color="text.muted">
            Repeats {transaction.recurring ? frequencyLabel(transaction.recurring) : 'on a schedule'} —
            {' '}<Link as={RouterLink} to="/recurring" color="accent.fg">change it in Recurring</Link>
          </Text>
        ) : (
          <FormControl>
            <HStack justify="space-between">
              <FormLabel mb={0} htmlFor="repeat-switch">Repeat</FormLabel>
              <Switch id="repeat-switch" isChecked={repeat} onChange={(e) => setRepeat(e.target.checked)} />
            </HStack>
            {repeat && (
              <>
                <HStack mt={2} spacing={2}>
                  <Text fontSize="sm" color="text.muted">Every</Text>
                  <NumberInput size="sm" min={1} maxW="72px" value={repeatN} onChange={setRepeatN}>
                    <NumberInputField aria-label="Repeat every" />
                  </NumberInput>
                  <Select size="sm" maxW="140px" aria-label="Repeat frequency" value={repeatFreq}
                    onChange={(e) => setRepeatFreq(e.target.value)}>
                    {REPEAT_FREQUENCIES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </Select>
                </HStack>
                <FormHelperText>
                  This one is the first; the next is on {shortDate(nextRunAfter(spentAt || today(), repeatFreq, repeatEvery))}.
                  {nextRunAfter(spentAt || today(), repeatFreq, repeatEvery) < today()
                    && ' Any missed since then are added tonight.'}
                </FormHelperText>
              </>
            )}
          </FormControl>
        )}

        <Button type="submit" isLoading={busy} isDisabled={!rate}>
          {isEdit ? 'Save changes' : `Add ${kindEff === 'income' ? 'income' : 'expense'}`}
        </Button>
      </Stack>
    </form>
  )
}
