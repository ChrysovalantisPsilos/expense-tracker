import { useEffect, useRef, useState } from 'react'
import { Button, Stack, Text, useToast } from '@chakra-ui/react'
import { Trash2 } from 'lucide-react'
import { toMinor, minorToInput, keptRate, effectiveRate, CURRENCIES } from '../../shared/lib/currency.js'
import { useFxRate } from '../../shared/lib/fx.js'
import { today, shortDate } from '../../shared/lib/dates.js'
import { insertTransaction, updateTransaction } from '../../shared/lib/transactions.js'
import { saveRecurring, deleteRecurring } from '../recurring/recurring.js'
import { editRepeat, planRepeat, repeatDraft } from '../recurring/recurringMath.js'
import { saveErrorToast } from '../../shared/lib/saveError.js'
import RepeatFields, { RepeatPanel } from '../recurring/RepeatFields.jsx'
import ReceiptScanner from '../../shared/ui/ReceiptScanner.jsx'
import FxPreview from '../../shared/ui/FxPreview.jsx'
import { PageForm } from '../../shared/ui/FormPage.jsx'
import { userMessage } from '../../shared/lib/errors.js'
import { useT } from '../../shared/lib/i18n/I18nProvider.jsx'
import EntryFields from './EntryFields.jsx'
import { useEntryFields } from './useEntryFields.js'
import { entryColumns, formFromRow, newForm } from './entryForm.js'

// The body of the transaction page: one expense or income, new or
// (`transaction`) existing — the entry form every page shares (EntryFields) —
// and its Repeat section. `rule` is the recurring rule the entry belongs to
// (transactions.recurring_rule_id), whose schedule the Repeat section then
// edits; switching Repeat on for an entry without one makes a rule whose
// first occurrence is this entry. That's the one way to add a recurring
// expense or income: `repeat` opens a new entry with it on (the link's
// ?repeat=1). Saving writes the entry, then creates/updates/removes the rule
// (planRepeat). While Repeat is on, "Paid from" leaves out meal vouchers: a
// rule can't pay with them. `onDelete` (existing entries) shows a Delete
// button; the page confirms it. A saved entry's kind is fixed (the server
// rejects a change, 0077), so editing shows it as a label and never sends it.
// A new entry can open on a category (`initialCategory`, from the link's
// ?category=): it's picked once the categories load, and only if it's one of
// the user's own of this kind. A new entry on the Add page can also start
// from `initial` (what the user typed in a group's form: { amount, currency,
// currencyPicked, description, spentAt }), reports the same through
// `onDraft`, and its kind through `onKind`; `who` (the "Who's it for?" row)
// sits under the kind switch while it's an expense.
export default function TransactionForm({
  kind: initialKind = 'expense', baseCurrency = 'EUR', transaction = null, rule = null, onSaved, onDelete,
  initialCategory = null, initial = null, repeat: startRepeat = false, onDraft, onKind, who = null,
}) {
  const t = useT('transactions')
  const isEdit = !!transaction
  const toast = useToast()
  const start = isEdit ? formFromRow(transaction, transaction.spent_at)
    : newForm({ kind: initialKind, baseCurrency, date: today(), initial })
  const [repeat, setRepeat] = useState(!!rule || (!isEdit && startRepeat))
  const [draft, setDraft] = useState(() => repeatDraft(rule, { fromDate: start.date }))
  // The next charge follows the entry's date until the user picks one.
  const f = useEntryFields(start, {
    isEdit, allowVouchers: !repeat, preset: isEdit ? '' : initialCategory, onKind,
    onDate: (v) => setDraft((d) => editRepeat(d, {}, v || today())),
  })
  const { kind, amount, currency, currencyPicked, description, date: spentAt } = f
  const [notes, setNotes] = useState(transaction?.notes ?? '')
  const [busy, setBusy] = useState(false)
  const [manualRate, setManualRate] = useState('')

  // Exchange rate: the ECB rate for the expense's date. Editing keeps the rate
  // the row was saved with unless its currency or date changes (keptRate).
  const needsFx = currency !== baseCurrency
  const kept = keptRate(transaction, { currency, date: spentAt, base: baseCurrency })
  const fx = useFxRate(currency, baseCurrency, spentAt, { skip: kept != null })
  const rate = effectiveRate({ needsFx, kept, fx, manual: manualRate })
  // Stable across retries of one submit so a lost-response retry can't
  // duplicate.
  const clientUuid = useRef(crypto.randomUUID())

  // What the user typed, for the Add page to carry into a group's form.
  useEffect(() => {
    onDraft?.({ amount, currency, currencyPicked, description, spentAt })
  }, [onDraft, amount, currency, currencyPicked, description, spentAt])

  // A confirmed receipt fills the amount and date, the shop's name when the
  // description is still empty, and the currency when the app supports it.
  function handleScan({ total, date, merchant, currency: scanned }) {
    const cur = scanned && CURRENCIES.includes(scanned) ? scanned : currency
    if (total != null) f.setAmount(minorToInput(toMinor(total, cur), cur))
    if (date) f.changeDate(date)
    if (merchant && !description.trim()) f.setDescription(merchant)
    if (cur !== currency) f.pickCurrency(cur)
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

  async function submit() {
    if (!f.validate()) return
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
      ...entryColumns(f.values(), { isSavings: f.isSavings }),
      exchange_rate: rate,
      notes: notes || null,
      spent_at: spentAt,
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

  return (
    <PageForm bare onSubmit={submit} noValidate busy={busy} submitProps={{ isDisabled: !rate || f.savingsLoading }}
      submitLabel={t(isEdit ? 'form.saveChanges' : `form.submit.${kind}`)}
      secondary={onDelete && (
        <Button variant="outline" colorScheme="red" leftIcon={<Trash2 size={16} />} onClick={onDelete}>
          {t('common:actions.delete')}
        </Button>
      )}>
      <EntryFields f={f} kindFixed={isEdit} who={who}
        beforeAmount={kind === 'expense' && !isEdit && <ReceiptScanner onScan={handleScan} />}
        afterAmount={needsFx && (
          <FxPreview from={currency} to={baseCurrency} amountMinor={f.amountMinor}
            fx={fx} captured={kept} rate={rate}
            manual={manualRate} onManual={setManualRate} />
        )}
        notes={{ value: notes, onChange: setNotes }} />

      <RepeatPanel subtitle={t(rule ? 'form.repeat.inSeries' : 'form.repeat.offer')}
        isOn={repeat} onToggle={setRepeat}>
        {repeat ? (
          <Stack spacing={3}>
            {rule && (
              <Text fontSize="sm" color="text.muted">{t('form.repeat.appliesToFuture')}</Text>
            )}
            <RepeatFields value={draft} onChange={(c) => setDraft((d) => editRepeat(d, c, spentAt || today()))}
              nextHelp={nextHelp} pausable={!!rule}
              kind={kind} currency={currency} amountMinor={f.amountMinor} />
          </Stack>
        ) : rule ? (
          <Text fontSize="sm" color="text.muted">{t('form.repeat.stops')}</Text>
        ) : null}
      </RepeatPanel>
    </PageForm>
  )
}
