import { useRef, useState } from 'react'
import { Link as RouterLink } from 'react-router-dom'
import {
  Button, FormControl, FormHelperText, FormLabel, HStack, Input, Link, Select, Stack,
  Switch, Text, Textarea, useToast,
} from '@chakra-ui/react'
import { Repeat, Trash2 } from 'lucide-react'
import { useCategories } from './useData.js'
import { toMinor, fromMinor, parseManualRate, CURRENCIES } from '../../shared/lib/currency.js'
import { useFxRate } from '../../shared/lib/fx.js'
import { today, shortDate } from '../../shared/lib/dates.js'
import { insertTransaction, updateTransaction } from './writes.js'
import { saveRecurring, deleteRecurring } from '../recurring/recurring.js'
import { editRepeat, planRepeat, repeatDraft } from '../recurring/recurringMath.js'
import { saveErrorToast } from '../../shared/lib/saveError.js'
import RepeatFields from '../recurring/RepeatFields.jsx'
import ReceiptScanner from '../../shared/ui/ReceiptScanner.jsx'
import MoneyInput from '../../shared/ui/MoneyInput.jsx'
import FxPreview from '../../shared/ui/FxPreview.jsx'
import SegmentedControl from '../../shared/ui/SegmentedControl.jsx'
import Panel from '../../shared/ui/kit/Panel.jsx'

const KINDS = [['expense', 'Expense'], ['income', 'Income']]

// The body of the transaction page: one expense or income, new or
// (`transaction`) existing, and its Repeat section. `rule` is the recurring
// rule the entry belongs to (transactions.recurring_rule_id), whose schedule
// the Repeat section then edits; switching Repeat on for an entry without one
// makes a rule whose first occurrence is this entry. Saving writes the entry,
// then creates/updates/removes the rule (planRepeat). `onDelete` (existing
// entries) shows a Delete button; the page confirms it.
export default function TransactionForm({
  kind: initialKind = 'expense', baseCurrency = 'EUR', transaction = null, rule = null, onSaved, onDelete,
}) {
  const isEdit = !!transaction
  const [kind, setKind] = useState(transaction?.kind ?? initialKind)
  const { categories } = useCategories(kind)
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
  const [repeat, setRepeat] = useState(!!rule)
  const [draft, setDraft] = useState(() => repeatDraft(rule, { fromDate: spentAt }))

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
  // duplicate.
  const clientUuid = useRef(crypto.randomUUID())
  const amountMinor = Number(amount) > 0 ? toMinor(amount, currency) : 0

  // The next charge follows the entry's date until the user picks one.
  function changeDate(v) {
    setSpentAt(v)
    setDraft((d) => editRepeat(d, {}, v || today()))
  }

  // A confirmed receipt fills the amount and date, the shop's name when the
  // description is still empty, and the currency when the app supports it.
  function handleScan({ total, date, merchant, currency: scanned }) {
    if (total != null) setAmount(String(total))
    if (date) changeDate(date)
    if (merchant && !description.trim()) setDescription(merchant)
    if (scanned && CURRENCIES.includes(scanned)) setCurrency(scanned)
  }

  function pickKind(k) {
    setKind(k)
    setCategoryId('') // categories are per kind
  }

  // After the entry is saved: its rule. Never fails the save — the entry is
  // already in, so a failure here is a warning.
  async function saveRepeat(entry) {
    const plan = planRepeat({ rule, repeat, draft, before: transaction, entry })
    try {
      if (plan.action === 'create') await saveRecurring(plan.fields)
      else if (plan.action === 'update') await saveRecurring({ id: plan.id, ...plan.fields })
      else if (plan.action === 'delete') await deleteRecurring(plan.id)
    } catch (err) {
      toast({
        title: rule ? 'Saved, but its repeat couldn’t be updated' : 'Saved, but it couldn’t be set to repeat',
        description: err.message, status: 'warning',
      })
    }
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
    // Capture the FX rate at entry time so historical balances never shift.
    const fields = {
      kind,
      category_id: categoryId || null,
      amount_minor: toMinor(amount, currency),
      currency,
      exchange_rate: rate,
      description: description || null,
      notes: notes || null,
      spent_at: spentAt,
    }
    setBusy(true)
    try {
      if (isEdit) await updateTransaction(transaction.id, fields)
      else await insertTransaction({ ...fields, client_uuid: clientUuid.current })
    } catch (err) {
      setBusy(false)
      toast(saveErrorToast(err))
      return
    }
    // A new entry is linked to its rule through its client_uuid.
    await saveRepeat(isEdit
      ? { ...fields, id: transaction.id, account_id: transaction.account_id }
      : { ...fields, client_uuid: clientUuid.current })
    setBusy(false)
    toast({ title: isEdit ? 'Saved' : `${kind === 'income' ? 'Income' : 'Expense'} saved`, status: 'success' })
    onSaved?.()
  }

  const firstNext = !rule && repeat
  const nextHelp = firstNext
    ? `This entry is the first; the next is on ${shortDate(draft.nextRun)}.${
      draft.nextRun < today() ? ' Any missed since then are added tonight.' : ''}`
    : undefined

  return (
    <Stack as="form" spacing={5} onSubmit={submit}>
      <Panel>
        <Stack spacing={4}>
          <SegmentedControl label="Kind" options={KINDS} value={kind} onChange={pickKind}
            size="sm" isFitted />
          {kind === 'expense' && !isEdit && <ReceiptScanner onScan={handleScan} />}

          <HStack align="start">
            <FormControl isRequired>
              <FormLabel>Amount</FormLabel>
              <MoneyInput value={amount} onChange={setAmount} />
            </FormControl>
            <FormControl maxW="110px">
              <FormLabel>Currency</FormLabel>
              <Select value={currency} onChange={(e) => setCurrency(e.target.value)}>
                {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </Select>
            </FormControl>
          </HStack>
          {needsFx && (
            <FxPreview from={currency} to={baseCurrency} amountMinor={amountMinor}
              fx={fx} captured={keepCaptured ? captured : null} rate={rate}
              manual={manualRate} onManual={setManualRate} />
          )}

          <FormControl>
            <FormLabel>Category</FormLabel>
            <Select placeholder="Uncategorized" value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
            <FormHelperText>
              <Link as={RouterLink} to="/settings/categories" color="accent.fg">Manage categories</Link>
            </FormHelperText>
          </FormControl>

          <FormControl>
            <FormLabel>Description</FormLabel>
            <Input value={description} onChange={(e) => setDescription(e.target.value)}
              placeholder={kind === 'income' ? 'Paycheck' : 'Coffee'} />
          </FormControl>

          <FormControl isRequired>
            <FormLabel>Date</FormLabel>
            <Input type="date" value={spentAt} onChange={(e) => changeDate(e.target.value)} />
          </FormControl>

          <FormControl>
            <FormLabel>Notes</FormLabel>
            <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </FormControl>
        </Stack>
      </Panel>

      <Panel icon={Repeat} title="Repeat"
        subtitle={rule ? 'Part of a recurring series' : 'Log it again on a schedule'}
        action={
          <Switch id="repeat-switch" isChecked={repeat} onChange={(e) => setRepeat(e.target.checked)}
            aria-label="Repeat" />
        }>
        {repeat ? (
          <Stack spacing={3}>
            {rule && (
              <Text fontSize="sm" color="text.muted">
                Changes to the amount, category or description here apply to its future charges too.
              </Text>
            )}
            <RepeatFields value={draft} onChange={(c) => setDraft((d) => editRepeat(d, c, spentAt || today()))}
              nextHelp={nextHelp} pausable={!!rule}
              kind={kind} currency={currency} amountMinor={amountMinor} />
          </Stack>
        ) : rule ? (
          <Text fontSize="sm" color="text.muted">
            Saving stops this from repeating. Entries it already added stay.
          </Text>
        ) : null}
      </Panel>

      <Stack direction={{ base: 'column-reverse', sm: 'row' }} spacing={3}>
        {onDelete && (
          <Button variant="outline" colorScheme="red" leftIcon={<Trash2 size={16} />} onClick={onDelete}>
            Delete
          </Button>
        )}
        <Button type="submit" flex="1" isLoading={busy} isDisabled={!rate}>
          {isEdit ? 'Save changes' : `Add ${kind === 'income' ? 'income' : 'expense'}`}
        </Button>
      </Stack>
    </Stack>
  )
}
