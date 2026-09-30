import { useState } from 'react'
import { Text, useToast } from '@chakra-ui/react'
import { PageForm } from '../../shared/ui/FormPage.jsx'
import { today } from '../../shared/lib/dates.js'
import { useAsyncSubmit } from '../../shared/lib/useAsyncSubmit.js'
import { useT } from '../../shared/lib/i18n/I18nProvider.jsx'
import EntryFields from '../transactions/EntryFields.jsx'
import { useEntryFields } from '../transactions/useEntryFields.js'
import { saveRecurring } from './recurring.js'
import { editRepeat } from './recurringMath.js'
import { nextChargeHelp, ruleFromForm, ruleToForm } from './ruleForm.js'
import RepeatFields, { RepeatPanel } from './RepeatFields.jsx'

// The body of a recurring rule's page (RecurringPage): the rule in Add's own
// form — the same entry fields (EntryFields), then the Repeat section, which
// is always on here (the entry is the rule) and has no switch. The differences
// from Add, each because a rule isn't one entry: the date field is the next
// charge (and Repeat has no second one), there are no notes (rules don't keep
// them), no exchange rate is captured (each charge gets its own day's rate),
// "Paid from" has no meal vouchers (vouchers pay as you go), and the kind can
// still be switched (the server moves the savings flags with it). Paused sits
// in Repeat, as on Add for an entry in a series. `onSaved` runs after a
// successful save.
export default function RecurringForm({ rule, baseCurrency, onSaved }) {
  const t = useT('recurring')
  const toast = useToast()
  const [start] = useState(() => ruleToForm(rule))
  const [draft, setDraft] = useState(start.draft)
  const f = useEntryFields(start.form, { isEdit: true, allowVouchers: false })
  const { busy, run } = useAsyncSubmit()

  async function submit() {
    if (!f.validate()) return
    await run(async () => {
      await saveRecurring({ id: rule.id, ...ruleFromForm(f.values(), draft, { isSavings: f.isSavings }) })
      toast({ title: t('form.updated'), status: 'success' })
      onSaved()
    })
  }

  return (
    <PageForm bare onSubmit={submit} noValidate busy={busy} submitLabel={t('form.saveChanges')}
      submitProps={{ isDisabled: f.savingsLoading }}>
      <EntryFields f={f} dateLabel={t('repeat.nextCharge')}
        dateHelp={nextChargeHelp(f.date, today()) ?? undefined}
        afterAmount={f.currency !== baseCurrency && (
          <Text fontSize="sm" color="text.muted" mt={-2}>{t('form.eachChargeRate')}</Text>
        )} />

      <RepeatPanel subtitle={t('form.repeatSubtitle')}>
        <RepeatFields value={draft} onChange={(c) => setDraft((d) => editRepeat(d, c))}
          showNext={false} pausable kind={f.kind} currency={f.currency} amountMinor={f.amountMinor} />
      </RepeatPanel>
    </PageForm>
  )
}
