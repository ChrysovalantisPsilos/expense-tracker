import { Link as RouterLink } from 'react-router-dom'
import {
  FormControl, FormErrorMessage, FormHelperText, FormLabel, HStack, Input, Link, Select, SimpleGrid, Stack, Text,
  Textarea,
} from '@chakra-ui/react'
import { categoryDisplayName } from '../../shared/lib/categoryName.js'
import { PaidFromChoice, SavingsSourceSwitch } from '../../shared/ui/SavingsSwitches.jsx'
import MoneyInput from '../../shared/ui/MoneyInput.jsx'
import SegmentedControl from '../../shared/ui/SegmentedControl.jsx'
import CurrencySelect from '../../shared/ui/CurrencySelect.jsx'
import Panel from '../../shared/ui/kit/Panel.jsx'
import { useShellHeader } from '../../shared/ui/ShellHeader.jsx'
import { InfoNote } from '../../shared/ui/InfoToggle.jsx'
import { useT } from '../../shared/lib/i18n/I18nProvider.jsx'
import QuickEntry from '../ai/QuickEntry.jsx'
import SuggestedMark from '../ai/SuggestedMark.jsx'
import CategoryGrid from './CategoryGrid.jsx'

// The Expense / Income switch's options; `t` is useT('transactions').
export const kindOptions = (t) => ['expense', 'income'].map((k) => [k, t(`kinds.${k}`)])

// The fields of one expense or income, in one order and one look wherever an
// entry is filled in: Add/Edit (TransactionForm) and a recurring rule's page
// (RecurringForm). `f` is useEntryFields' state. In order: Type it (when on),
// the kind, `who` (Add's "Who's it for?", expenses only), `beforeAmount` (the
// receipt scanner), amount + currency, `afterAmount` (what a foreign amount
// converts at), category with Manage categories, the savings choices,
// description, the date (`dateLabel`, `dateHelp` under it) and — when `notes`
// ({ value, onChange }) is given — notes. `kindFixed` shows the kind as a label
// (a saved entry keeps it, 0077). The inline errors come with `f`. On a
// phone held sideways the fields take the left column and the categories a
// grid of tiles on the right (CategoryGrid).
export default function EntryFields({
  f, kindFixed = false, who = null, beforeAmount = null, afterAmount = null, dateLabel, dateHelp, notes = null,
}) {
  const t = useT('transactions')
  const sideways = !!useShellHeader()
  const { kind, marks, unmark, errors } = f

  // A field's label, with the mark while Type it's value is still in it.
  const label = (field, text) => (marks.has(field) ? (
    <HStack justify="space-between" align="baseline" mb={2} spacing={2}>
      <FormLabel mb={0}>{text}</FormLabel>
      <SuggestedMark />
    </HStack>
  ) : <FormLabel>{text}</FormLabel>)

  const kindField = kindFixed ? (
    <FormControl>
      <FormLabel>{t('form.type')}</FormLabel>
      <InfoNote textProps={{ fontSize: 'md', fontWeight: 600, color: 'text.primary' }}
        more={t(`form.kindFixed.${kind}`)} label={t('form.kindFixed.label')}>
        {t(`kinds.${kind}`)}
      </InfoNote>
    </FormControl>
  ) : (
    <SegmentedControl label={t('form.kind')} options={kindOptions(t)} value={kind} onChange={f.pickKind}
      size="sm" isFitted />
  )
  const top = (
    <>
      {f.quickOn && <QuickEntry onFill={f.applyFill} onUndo={f.undoFill} />}
      {kindField}
      {kind === 'expense' && who}
      {beforeAmount}
      <HStack align="start">
        <FormControl isRequired isInvalid={!!errors.amount}>
          {label('amount', t('form.amount'))}
          <MoneyInput ref={f.amountRef} currency={f.currency} value={f.amount}
            onChange={(v) => { f.setAmount(v); unmark('amount') }} />
          <FormErrorMessage>{errors.amount}</FormErrorMessage>
        </FormControl>
        <FormControl maxW="110px">
          <FormLabel>{t('form.currency')}</FormLabel>
          <CurrencySelect value={f.currency} onChange={f.pickCurrency} />
        </FormControl>
      </HStack>
      {afterAmount}
    </>
  )
  const pickCategory = (id) => { f.setCategoryId(id); unmark('category') }
  const manageCategories = (
    <Link as={RouterLink} to="/settings/categories" color="accent.fg">{t('form.manageCategories')}</Link>
  )
  const rest = (
    <>
      {f.isSavings && <SavingsSourceSwitch value={f.fromIncome} onChange={f.setFromIncome} />}
      {f.sources.length > 0 && (
        <PaidFromChoice sources={f.sources} value={f.from} mark={marks.has('paidFrom') && <SuggestedMark />}
          onChange={(v) => { f.setPaidFrom(v); unmark('paidFrom') }} />
      )}

      <FormControl>
        {label('description', t('form.description'))}
        <Input value={f.description} onChange={(e) => { f.setDescription(e.target.value); unmark('description') }}
          placeholder={t(`form.placeholder.${kind}`)} />
      </FormControl>

      <FormControl isRequired isInvalid={!!errors.date}>
        {label('date', dateLabel ?? t('form.date'))}
        <Input ref={f.dateRef} type="date" value={f.date}
          onChange={(e) => { f.changeDate(e.target.value); unmark('date') }} />
        {dateHelp && !errors.date && <FormHelperText>{dateHelp}</FormHelperText>}
        <FormErrorMessage>{errors.date}</FormErrorMessage>
      </FormControl>

      {notes && (
        <FormControl>
          <FormLabel>{t('form.notes')}</FormLabel>
          <Textarea rows={2} value={notes.value} onChange={(e) => notes.onChange(e.target.value)} />
        </FormControl>
      )}
    </>
  )

  if (sideways) {
    // A phone held sideways: the amount and the fields on the left, the
    // categories as a grid of tiles on the right.
    return (
      <SimpleGrid columns={2} spacing={3} alignItems="start">
        <Panel>
          <Stack spacing={4}>
            {top}
            {rest}
          </Stack>
        </Panel>
        <Panel>
          <HStack justify="space-between" mb={3} spacing={2}>
            <Text fontSize="sm" fontWeight="600" color="text.muted">{t('form.category')}</Text>
            {marks.has('category') && <SuggestedMark />}
          </HStack>
          <CategoryGrid categories={f.categories} value={f.categoryId} kind={kind} onChange={pickCategory} />
          <Text fontSize="sm" mt={3}>{manageCategories}</Text>
        </Panel>
      </SimpleGrid>
    )
  }
  return (
    <Panel>
      <Stack spacing={4}>
        {top}
        <FormControl>
          {label('category', t('form.category'))}
          <Select placeholder={t('uncategorized')} value={f.categoryId} onChange={(e) => pickCategory(e.target.value)}>
            {f.categories.map((c) => <option key={c.id} value={c.id}>{categoryDisplayName(c)}</option>)}
          </Select>
          <FormHelperText>{manageCategories}</FormHelperText>
        </FormControl>
        {rest}
      </Stack>
    </Panel>
  )
}
