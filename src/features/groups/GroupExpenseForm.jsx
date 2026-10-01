import { useEffect, useId, useMemo, useRef, useState } from 'react'
import {
  Button, Stack, HStack, FormControl, FormErrorMessage, FormLabel, Input, Checkbox, Text,
  Divider, useToast, ButtonGroup, InputGroup, InputRightAddon, Box, SimpleGrid, Switch,
} from '@chakra-ui/react'
import { Trash2 } from 'lucide-react'
import { keptRate, effectiveRate, minorToInput, toMinor } from '../../shared/lib/currency.js'
import { useFxRate } from '../../shared/lib/fx.js'
import { today } from '../../shared/lib/dates.js'
import { evenPercents } from './splitMath.js'
import { viewerName } from './groupFormat.js'
import {
  EXPENSE_FIELDS, expenseFieldErrors, expenseFormStart, expenseSaveArgs, expenseSaveProblem,
  expenseSavedToast, includedIds, includedMembers, paidMinorOf, shareUnit, splitCardParts, splitModes, splitPreview, splitTotal,
} from './groupExpenseForm.js'
import { addSharedExpense, updateSharedExpense } from './groups.js'
import ReceiptScanner from '../../shared/ui/ReceiptScanner.jsx'
import MoneyInput from '../../shared/ui/MoneyInput.jsx'
import FxPreview from '../../shared/ui/FxPreview.jsx'
import { PageForm } from '../../shared/ui/FormPage.jsx'
import Panel from '../../shared/ui/kit/Panel.jsx'
import { useShellHeader } from '../../shared/ui/ShellHeader.jsx'
import AvatarStack from './AvatarStack.jsx'
import MemberSelect from './MemberSelect.jsx'
import UserAvatar from '../../shared/ui/UserAvatar.jsx'
import { useAsyncSubmit } from '../../shared/lib/useAsyncSubmit.js'
import { firstInvalid } from '../../shared/lib/formChecks.js'
import { useT } from '../../shared/lib/i18n/I18nProvider.jsx'
import CurrencySelect from '../../shared/ui/CurrencySelect.jsx'

// The body of a group expense's page (GroupExpensePage): a new expense, or
// (`expense`) an existing one, with a Delete button when `onDelete` is given
// (the page confirms it). `onSaved` runs after a successful save.
// An expense can be paid in any currency: the split is always worked out in
// the group currency, from the ECB rate for the expense's date (or a rate the
// user types when none can be fetched) — the same rules as a personal expense.
//
// `quick` is the layout the Add form uses when the user picks a group under
// "Who's it for?" (TransactionPage): `lead` (the Expense/Income switch and
// the chips) on top, the amount first, the date and payer side by side, and
// the split folded into one card ("Split equally · All 4 · €21.15 each")
// whose Adjust switch opens the split editor. It starts from `initial` (what
// the user typed on the other side: { amount, currency, currencyPicked,
// description, spentAt }), reports the same through `onDraft` as it changes,
// and its save toast names the group and the user's share. `myUserId`
// highlights the user in the card's avatars. On a phone held sideways the
// fields take the left column and the split the right.
export default function GroupExpenseForm({
  group, members, myMemberId, defaultPayer, expense, onSaved, onDelete,
  quick = false, lead = null, initial = null, onDraft, myUserId,
}) {
  const toast = useToast()
  const t = useT('groups')
  const isEdit = !!expense
  const cur = group.currency // shares and balances

  // Where the form opens (read once).
  const [start] = useState(() => expenseFormStart({
    expense, members, defaultPayer, groupCurrency: cur, initial, today: today(),
  }))
  const [description, setDescription] = useState(start.description)
  const [paidCurrency, setPaidCurrency] = useState(start.paidCurrency)
  const [currencyPicked, setCurrencyPicked] = useState(start.currencyPicked)
  const [amount, setAmount] = useState(start.amount)
  const [manualRate, setManualRate] = useState('')
  const [paidBy, setPaidBy] = useState(start.paidBy)
  const [spentAt, setSpentAt] = useState(start.spentAt)
  const [splitWith, setSplitWith] = useState(start.splitWith)
  const [mode, setMode] = useState(start.mode)
  const [values, setValues] = useState(start.values)
  const { busy, run } = useAsyncSubmit()
  // Inline errors for the required fields, shown from the first submit on.
  const [tried, setTried] = useState(false)
  const refs = { description: useRef(null), amount: useRef(null), paidBy: useRef(null) }
  const errors = tried ? expenseFieldErrors({ description, amount, paidBy }) : {}
  const [adjust, setAdjust] = useState(false)
  const adjustId = useId()
  const sideways = !!useShellHeader()

  // What the user typed, for the Add form to carry to the other side.
  useEffect(() => {
    onDraft?.({ amount, currency: paidCurrency, currencyPicked, description, spentAt })
  }, [onDraft, amount, paidCurrency, currencyPicked, description, spentAt])

  // Rate paid currency → group currency. Editing keeps the saved rate unless
  // the currency or date changes (keptRate).
  const needsFx = paidCurrency !== cur
  const kept = keptRate(expense, { currency: paidCurrency, date: spentAt, base: cur })
  const fx = useFxRate(paidCurrency, cur, spentAt, { skip: kept != null })
  const rate = effectiveRate({ needsFx, kept, fx, manual: manualRate })

  const ids = includedIds(members, splitWith)
  const paidMinor = paidMinorOf(amount, paidCurrency)
  // What the split must add up to: the amount in the group currency.
  const totalMinor = splitTotal({ paidMinor, paidCurrency, rate, groupCurrency: cur })
  const setVal = (id, v) => setValues((s) => ({ ...s, [id]: v }))

  // Switching to Percent starts from an even split of whoever is included.
  function pickMode(next) {
    if (next === 'percent' && mode !== 'percent') setValues(evenPercents(ids))
    setMode(next)
  }

  function toggle(id) {
    setSplitWith((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]))
  }

  function handleScan({ total, date }) {
    if (total != null) setAmount(minorToInput(toMinor(total, paidCurrency), paidCurrency))
    if (date) setSpentAt(date)
  }

  // Live-compute each included member's share (minor) for the current mode,
  // and the line under the split.
  const preview = useMemo(
    () => splitPreview({ mode, totalMinor, ids, values, currency: cur, needsFx, paidMinor, rate }),
    [mode, totalMinor, ids, values, cur, needsFx, paidMinor, rate])

  async function submit() {
    const first = firstInvalid(expenseFieldErrors({ description, amount, paidBy }), EXPENSE_FIELDS)
    if (first) {
      setTried(true)
      refs[first].current?.focus()
      return
    }
    const problem = expenseSaveProblem({
      rate, fxLoading: fx.status === 'loading', ids, mode, preview, totalMinor, currency: cur,
    })
    if (problem) return toast({ ...problem, status: 'warning' })

    const args = expenseSaveArgs({
      groupId: group.id, expenseId: expense?.id, description, paidMinor, paidCurrency, needsFx, rate,
      paidBy, spentAt, ids, mode, preview,
    })
    const done = expenseSavedToast({
      isEdit, quick, groupName: group.name, myShare: preview.byMember[myMemberId] ?? 0, currency: cur,
    })
    await run(async () => {
      await (isEdit ? updateSharedExpense(args) : addSharedExpense(args))
      toast({ ...done, status: 'success' })
      onSaved?.()
    })
  }

  const summary = preview.summary
  const summaryOk = preview.complete
  const addon = shareUnit(mode, cur)

  const scanner = !isEdit && <ReceiptScanner onScan={handleScan} />
  const descriptionField = (
    <FormControl isRequired isInvalid={!!errors.description}>
      <FormLabel>{t('form.description')}</FormLabel>
      <Input ref={refs.description} value={description} onChange={(e) => setDescription(e.target.value)}
        placeholder={t('form.descriptionHint')} />
      <FormErrorMessage>{errors.description}</FormErrorMessage>
    </FormControl>
  )
  const amountFields = (
    <>
      <HStack align="start">
        <FormControl isRequired isInvalid={!!errors.amount}>
          <FormLabel>{t('form.amount')}</FormLabel>
          <MoneyInput ref={refs.amount} currency={paidCurrency} value={amount} onChange={setAmount} />
          <FormErrorMessage>{errors.amount}</FormErrorMessage>
        </FormControl>
        <FormControl maxW="110px">
          <FormLabel>{t('form.currency')}</FormLabel>
          <CurrencySelect value={paidCurrency} include={cur} aria-label={t('form.currencyPaid')}
            onChange={(c) => { setPaidCurrency(c); setCurrencyPicked(true) }} />
        </FormControl>
      </HStack>
      {needsFx && (
        <FxPreview from={paidCurrency} to={cur} amountMinor={paidMinor}
          fx={fx} captured={kept} rate={rate}
          manual={manualRate} onManual={setManualRate} />
      )}
    </>
  )
  const dateField = (
    <FormControl maxW={quick ? undefined : '200px'}>
      <FormLabel>{t('form.date')}</FormLabel>
      <Input type="date" value={spentAt} onChange={(e) => setSpentAt(e.target.value)} />
    </FormControl>
  )
  const payerField = (
    <FormControl isRequired isInvalid={!!errors.paidBy}>
      <FormLabel>{t('form.paidBy')}</FormLabel>
      <MemberSelect ref={refs.paidBy} members={members} value={paidBy} onChange={setPaidBy}
        myMemberId={myMemberId} />
      <FormErrorMessage>{errors.paidBy}</FormErrorMessage>
    </FormControl>
  )
  const splitEditor = (
    <>
      <ButtonGroup size="sm" isAttached variant="outline" mb={3} flexWrap="wrap"
        aria-label={quick ? t('form.split') : undefined}>
        {splitModes().map((m) => (
          <Button key={m}
            onClick={() => pickMode(m)}
            variant={mode === m ? 'solid' : 'outline'}
            colorScheme={mode === m ? 'brand' : 'gray'}>
            {t(`form.modes.${m}`)}
          </Button>
        ))}
      </ButtonGroup>

      <Stack spacing={2}>
        {members.map((m) => {
          const on = splitWith.includes(m.id)
          return (
            <HStack key={m.id} spacing={3}>
              <Checkbox isChecked={on} onChange={() => toggle(m.id)} flex="1" minW={0}>
                <HStack spacing={2} minW={0}>
                  <UserAvatar size="xs" name={m.display_name} src={m.avatar_url} highlight={m.id === myMemberId}
                    aria-hidden />
                  <Text overflowWrap="anywhere">{viewerName(members, m.id, myMemberId)}</Text>
                </HStack>
              </Checkbox>
              {on && mode !== 'equal' && (
                <InputGroup size="sm" maxW="130px">
                  <MoneyInput textAlign="right" placeholder="0" borderEndRadius={0}
                    currency={mode === 'exact' ? cur : undefined}
                    aria-label={t(`form.shareInput.${mode}`, { name: m.display_name })}
                    value={values[m.id]} onChange={(v) => setVal(m.id, v)} />
                  <InputRightAddon>{addon}</InputRightAddon>
                </InputGroup>
              )}
              {on && (
                <Text fontSize="sm" color="text.muted" minW="72px" textAlign="right">
                  {preview.shareText[m.id]}
                </Text>
              )}
            </HStack>
          )
        })}
      </Stack>

      <Text fontSize="sm" mt={2} fontWeight="600"
        color={summaryOk ? 'status.positive' : 'text.muted'}>
        {summary}
      </Text>
    </>
  )

  const submitLabel = isEdit ? t('form.save') : quick ? t('form.addTo', { name: group.name }) : t('form.add')
  const deleteButton = onDelete && (
    <Button variant="outline" colorScheme="red" leftIcon={<Trash2 size={16} />} onClick={onDelete}>
      {t('common:actions.delete')}
    </Button>
  )

  if (!quick) {
    return (
      <PageForm onSubmit={submit} noValidate busy={busy} submitLabel={submitLabel} secondary={deleteButton}>
        <Stack spacing={4}>
          {scanner && <>{scanner}<Divider /></>}
          {descriptionField}
          {amountFields}
          {dateField}
          {payerField}
          <FormControl>
            <FormLabel mb={2}>{t('form.split')}</FormLabel>
            {splitEditor}
          </FormControl>
        </Stack>
      </PageForm>
    )
  }

  // The quick layout: the split folded to one line until the user adjusts it.
  const card = splitCardParts({ mode, included: ids.length, total: members.length, summary })
  const splitCard = (
    <>
      <HStack spacing={3}>
        <AvatarStack members={includedMembers(members, splitWith)} myUserId={myUserId}
          ring="bg.surface" />
        <Box flex="1" minW={0}>
          <Text fontSize="sm" fontWeight="600">{card.title}</Text>
          <Text fontSize="xs" color="text.muted">{card.line}</Text>
        </Box>
        <FormControl display="flex" alignItems="center" w="auto" flexShrink={0} minH="44px">
          <FormLabel htmlFor={adjustId} mb={0} mr={2} fontSize="sm" fontWeight="400" color="text.muted" cursor="pointer">
            {t('form.adjust')}
          </FormLabel>
          <Switch id={adjustId} isChecked={adjust} onChange={(e) => setAdjust(e.target.checked)} />
        </FormControl>
      </HStack>
      {adjust && <Box mt={4}>{splitEditor}</Box>}
    </>
  )
  const fields = (
    <Stack spacing={4}>
      {lead}
      {scanner}
      {amountFields}
      {descriptionField}
      <HStack align="start" spacing={3}>
        <Box flex="1" minW={0}>{dateField}</Box>
        <Box flex="1" minW={0}>{payerField}</Box>
      </HStack>
      {!sideways && (
        <Box borderWidth="1px" borderColor="border.default" borderRadius="xl" p={3}>{splitCard}</Box>
      )}
    </Stack>
  )
  return (
    <PageForm bare onSubmit={submit} noValidate busy={busy} submitLabel={submitLabel}>
      {sideways ? (
        // A phone held sideways: the fields on the left, the split on the right.
        <SimpleGrid columns={2} spacing={3} alignItems="start">
          <Panel>{fields}</Panel>
          <Panel>{splitCard}</Panel>
        </SimpleGrid>
      ) : <Panel>{fields}</Panel>}
    </PageForm>
  )
}
