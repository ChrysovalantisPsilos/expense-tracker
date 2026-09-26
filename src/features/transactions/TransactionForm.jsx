import { useEffect, useRef, useState } from 'react'
import { Link as RouterLink } from 'react-router-dom'
import {
  Button, FormControl, FormErrorMessage, FormHelperText, FormLabel, HStack, Input, Link, Select, Stack,
  SimpleGrid, Switch, Text, Textarea, useToast,
} from '@chakra-ui/react'
import { Repeat, Trash2 } from 'lucide-react'
import { useCategories } from './useData.js'
import { useSavingsIds } from '../categories/categories.js'
import { presetCategoryId } from '../categories/categoryMath.js'
import { PaidFromSavingsSwitch, SavingsSourceSwitch } from '../../shared/ui/SavingsSwitches.jsx'
import { toMinor, minorToInput, parseManualRate, CURRENCIES } from '../../shared/lib/currency.js'
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
import { PageForm } from '../../shared/ui/FormPage.jsx'
import { useShellHeader } from '../../shared/ui/ShellHeader.jsx'
import CategoryGrid from './CategoryGrid.jsx'
import { userMessage } from '../../shared/lib/errors.js'
import { amountError, fieldErrors, firstInvalid, requiredError } from '../../shared/lib/formChecks.js'
import { useT } from '../../shared/lib/i18n/I18nProvider.jsx'

// The Expense / Income switch's options; `t` is useT('transactions').
export const kindOptions = (t) => ['expense', 'income'].map((k) => [k, t(`kinds.${k}`)])
const FIELDS = ['amount', 'date']
const checkFields = ({ amount, spentAt }, t) => fieldErrors({
  amount: amountError(amount),
  date: requiredError(spentAt, t('form.pickDate')),
})

// The body of the transaction page: one expense or income, new or
// (`transaction`) existing, and its Repeat section. `rule` is the recurring
// rule the entry belongs to (transactions.recurring_rule_id), whose schedule
// the Repeat section then edits; switching Repeat on for an entry without one
// makes a rule whose first occurrence is this entry. Saving writes the entry,
// then creates/updates/removes the rule (planRepeat). `onDelete` (existing
// entries) shows a Delete button; the page confirms it. A saved entry's kind
// is fixed (the server rejects a change, 0077), so editing shows it as a
// label and never sends it. Income in a savings category (0084) asks whether
// it was "Taken from my income": on for a new entry, as stored when editing.
// An expense asks whether it was "Paid from savings" (0085: still spending,
// but not against the Net) once the user has a savings category — off for a
// new entry, as stored when editing (shown while it's on, whatever the
// categories). A new entry can open on a category (`initialCategory`, from
// the link's ?category=): it's picked once the categories load, and only if
// it's one of the user's own of this kind (presetCategoryId). On a phone held sideways the fields take the left column and
// the categories a grid of tiles on the right (CategoryGrid).
// A new entry on the Add page can also start from `initial` (what the user
// typed in a group's form: { amount, currency, currencyPicked, description,
// spentAt }), reports the same through `onDraft`, and its kind through
// `onKind`; `who` (the "Who's it for?" row) sits under the kind switch while
// it's an expense.
export default function TransactionForm({
  kind: initialKind = 'expense', baseCurrency = 'EUR', transaction = null, rule = null, onSaved, onDelete,
  initialCategory = null, initial = null, onDraft, onKind, who = null,
}) {
  const t = useT('transactions')
  const isEdit = !!transaction
  const [kind, setKind] = useState(transaction?.kind ?? initialKind) // fixed once saved
  const { categories, loading: categoriesLoading } = useCategories(kind)
  const toast = useToast()
  const [amount, setAmount] = useState(
    transaction ? minorToInput(transaction.amount_minor, transaction.currency) : initial?.amount ?? '')
  const [currency, setCurrency] = useState(transaction?.currency ?? initial?.currency ?? baseCurrency)
  const [currencyPicked, setCurrencyPicked] = useState(!!initial?.currencyPicked)
  const [categoryId, setCategoryId] = useState(transaction?.category_id ?? '')
  // The link's category, until the categories are known to check it against.
  const [preset, setPreset] = useState(transaction ? '' : initialCategory ?? '')
  if (preset && !categoriesLoading) {
    setPreset('')
    const id = presetCategoryId(preset, categories, kind)
    if (id) setCategoryId(id)
  }
  const [description, setDescription] = useState(transaction?.description ?? initial?.description ?? '')
  const [spentAt, setSpentAt] = useState(transaction?.spent_at ?? initial?.spentAt ?? today)
  const [notes, setNotes] = useState(transaction?.notes ?? '')
  const { savingsIds, loading: savingsLoading } = useSavingsIds()
  const isSavings = kind === 'income' && savingsIds.has(categoryId)
  const [fromIncome, setFromIncome] = useState(transaction ? !!transaction.savings_from_income : true)
  const [fromSavings, setFromSavings] = useState(!!transaction?.paid_from_savings)
  const showFromSavings = kind === 'expense' && (savingsIds.size > 0 || !!transaction?.paid_from_savings)
  const [busy, setBusy] = useState(false)
  // Inline field errors, shown from the first submit on.
  const [tried, setTried] = useState(false)
  const amountRef = useRef(null)
  const dateRef = useRef(null)
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

  // What the user typed, for the Add page to carry into a group's form.
  useEffect(() => {
    onDraft?.({ amount, currency, currencyPicked, description, spentAt })
  }, [onDraft, amount, currency, currencyPicked, description, spentAt])

  function pickCurrency(c) {
    setCurrency(c)
    setCurrencyPicked(true)
  }

  // The next charge follows the entry's date until the user picks one.
  function changeDate(v) {
    setSpentAt(v)
    setDraft((d) => editRepeat(d, {}, v || today()))
  }

  // A confirmed receipt fills the amount and date, the shop's name when the
  // description is still empty, and the currency when the app supports it.
  function handleScan({ total, date, merchant, currency: scanned }) {
    const cur = scanned && CURRENCIES.includes(scanned) ? scanned : currency
    if (total != null) setAmount(minorToInput(toMinor(total, cur), cur))
    if (date) changeDate(date)
    if (merchant && !description.trim()) setDescription(merchant)
    if (cur !== currency) pickCurrency(cur)
  }

  function pickKind(k) {
    setKind(k)
    onKind?.(k)
    setPreset('')
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
      console.error('[transactions] repeat not saved:', err)
      toast({
        title: t(rule ? 'form.repeatNotUpdated' : 'form.repeatNotSet'),
        description: userMessage(err), status: 'warning',
      })
    }
  }

  const errors = tried ? checkFields({ amount, spentAt }, t) : {}
  // A phone held sideways lays the form out in two columns.
  const sideways = !!useShellHeader()

  async function submit() {
    const first = firstInvalid(checkFields({ amount, spentAt }, t), FIELDS)
    if (first) {
      setTried(true)
      const field = first === 'amount' ? amountRef : dateRef
      field.current?.focus()
      return
    }
    // Never save a foreign amount without a real rate (no silent 1:1).
    if (!rate) {
      toast({
        title: t(fx.status === 'loading' ? 'form.fetchingRate' : 'form.enterRate'),
        status: 'warning',
      })
      return
    }
    // Capture the FX rate at entry time so historical balances never shift.
    const fields = {
      category_id: categoryId || null,
      amount_minor: toMinor(amount, currency),
      currency,
      exchange_rate: rate,
      description: description || null,
      notes: notes || null,
      spent_at: spentAt,
      savings_from_income: isSavings && fromIncome,
      paid_from_savings: showFromSavings && fromSavings,
    }
    setBusy(true)
    try {
      if (isEdit) await updateTransaction(transaction.id, fields)
      else await insertTransaction({ ...fields, kind, client_uuid: clientUuid.current })
    } catch (err) {
      setBusy(false)
      toast(saveErrorToast(err))
      return
    }
    // A new entry is linked to its rule through its client_uuid.
    await saveRepeat(isEdit
      ? { ...fields, kind, id: transaction.id, account_id: transaction.account_id }
      : { ...fields, kind, client_uuid: clientUuid.current })
    setBusy(false)
    toast({ title: t(isEdit ? 'form.saved' : `form.added.${kind}`), status: 'success' })
    onSaved?.()
  }

  const firstNext = !rule && repeat
  const nextHelp = firstNext
    ? t(draft.nextRun < today() ? 'form.nextHelpMissed' : 'form.nextHelp', { date: shortDate(draft.nextRun) })
    : undefined

  const kindField = isEdit ? (
    <FormControl>
      <FormLabel>{t('form.type')}</FormLabel>
      <Text fontWeight="600">{t(`kinds.${kind}`)}</Text>
      <FormHelperText>{t(`form.kindFixed.${kind}`)}</FormHelperText>
    </FormControl>
  ) : (
    <SegmentedControl label={t('form.kind')} options={kindOptions(t)} value={kind} onChange={pickKind}
      size="sm" isFitted />
  )
  const amountFields = (
    <>
      {kind === 'expense' && !isEdit && <ReceiptScanner onScan={handleScan} />}

      <HStack align="start">
        <FormControl isRequired isInvalid={!!errors.amount}>
          <FormLabel>{t('form.amount')}</FormLabel>
          <MoneyInput ref={amountRef} currency={currency} value={amount} onChange={setAmount} />
          <FormErrorMessage>{errors.amount}</FormErrorMessage>
        </FormControl>
        <FormControl maxW="110px">
          <FormLabel>{t('form.currency')}</FormLabel>
          <Select value={currency} onChange={(e) => pickCurrency(e.target.value)}>
            {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </Select>
        </FormControl>
      </HStack>
      {needsFx && (
        <FxPreview from={currency} to={baseCurrency} amountMinor={amountMinor}
          fx={fx} captured={keepCaptured ? captured : null} rate={rate}
          manual={manualRate} onManual={setManualRate} />
      )}
    </>
  )
  const manageCategories = (
    <Link as={RouterLink} to="/settings/categories" color="accent.fg">{t('form.manageCategories')}</Link>
  )
  const savingsSwitches = (
    <>
      {isSavings && <SavingsSourceSwitch value={fromIncome} onChange={setFromIncome} />}
      {showFromSavings && <PaidFromSavingsSwitch value={fromSavings} onChange={setFromSavings} />}
    </>
  )
  const otherFields = (
    <>
      <FormControl>
        <FormLabel>{t('form.description')}</FormLabel>
        <Input value={description} onChange={(e) => setDescription(e.target.value)}
          placeholder={t(`form.placeholder.${kind}`)} />
      </FormControl>

      <FormControl isRequired isInvalid={!!errors.date}>
        <FormLabel>{t('form.date')}</FormLabel>
        <Input ref={dateRef} type="date" value={spentAt} onChange={(e) => changeDate(e.target.value)} />
        <FormErrorMessage>{errors.date}</FormErrorMessage>
      </FormControl>

      <FormControl>
        <FormLabel>{t('form.notes')}</FormLabel>
        <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </FormControl>
    </>
  )

  return (
    <PageForm bare onSubmit={submit} noValidate busy={busy} submitProps={{ isDisabled: !rate || savingsLoading }}
      submitLabel={t(isEdit ? 'form.saveChanges' : `form.submit.${kind}`)}
      secondary={onDelete && (
        <Button variant="outline" colorScheme="red" leftIcon={<Trash2 size={16} />} onClick={onDelete}>
          {t('actions.delete')}
        </Button>
      )}>
      {sideways ? (
        // A phone held sideways: the amount and the fields on the left, the
        // categories as a grid of tiles on the right.
        <SimpleGrid columns={2} spacing={3} alignItems="start">
          <Panel>
            <Stack spacing={4}>
              {kindField}
              {kind === 'expense' && who}
              {amountFields}
              {savingsSwitches}
              {otherFields}
            </Stack>
          </Panel>
          <Panel>
            <Text fontSize="sm" fontWeight="600" color="text.muted" mb={3}>
              {t('form.category')}
            </Text>
            <CategoryGrid categories={categories} value={categoryId} onChange={setCategoryId} kind={kind} />
            <Text fontSize="sm" mt={3}>{manageCategories}</Text>
          </Panel>
        </SimpleGrid>
      ) : (
      <Panel>
        <Stack spacing={4}>
          {kindField}
          {kind === 'expense' && who}
          {amountFields}

          <FormControl>
            <FormLabel>{t('form.category')}</FormLabel>
            <Select placeholder={t('uncategorized')} value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
            <FormHelperText>{manageCategories}</FormHelperText>
          </FormControl>
          {savingsSwitches}
          {otherFields}
        </Stack>
      </Panel>
      )}

      <Panel icon={Repeat} title={t('form.repeat.title')}
        subtitle={t(rule ? 'form.repeat.inSeries' : 'form.repeat.offer')}
        action={
          <Switch id="repeat-switch" isChecked={repeat} onChange={(e) => setRepeat(e.target.checked)}
            aria-label={t('form.repeat.title')} />
        }>
        {repeat ? (
          <Stack spacing={3}>
            {rule && (
              <Text fontSize="sm" color="text.muted">{t('form.repeat.appliesToFuture')}</Text>
            )}
            <RepeatFields value={draft} onChange={(c) => setDraft((d) => editRepeat(d, c, spentAt || today()))}
              nextHelp={nextHelp} pausable={!!rule}
              kind={kind} currency={currency} amountMinor={amountMinor} />
          </Stack>
        ) : rule ? (
          <Text fontSize="sm" color="text.muted">{t('form.repeat.stops')}</Text>
        ) : null}
      </Panel>
    </PageForm>
  )
}
