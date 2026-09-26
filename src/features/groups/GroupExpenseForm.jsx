import { useEffect, useId, useMemo, useRef, useState } from 'react'
import {
  Button, Stack, HStack, FormControl, FormErrorMessage, FormLabel, Input, Select, Checkbox,
  Text, Divider, useToast, ButtonGroup,
  InputGroup, InputRightAddon, Box, SimpleGrid, Switch,
} from '@chakra-ui/react'
import { Trash2 } from 'lucide-react'
import { toMinor, formatMoney, parseManualRate, CURRENCIES, minorToInput } from '../../shared/lib/currency.js'
import { useFxRate } from '../../shared/lib/fx.js'
import { today } from '../../shared/lib/dates.js'
import {
  splitEqually, expenseGroupAmount, computeSplit, prefillSplitValues, evenPercents,
} from './splitMath.js'
import { viewerName } from './groupFormat.js'
import { splitCountLabel } from './quickAddMath.js'
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
import { amountError, fieldErrors, firstInvalid, requiredError } from '../../shared/lib/formChecks.js'
import { intlLocale } from '../../shared/lib/i18n/i18n.js'
import { useT } from '../../shared/lib/i18n/I18nProvider.jsx'

const FIELDS = ['description', 'amount', 'paidBy']
const checkFields = ({ description, amount, paidBy }, t) => fieldErrors({
  description: requiredError(description, t('form.errors.description')),
  amount: amountError(amount),
  paidBy: requiredError(paidBy, t('form.errors.paidBy')),
})

// The split modes; each one's button reads groups:form.modes.<mode>.
const MODES = ['equal', 'exact', 'percent', 'shares']

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

  const initialMode = ['exact', 'percent', 'shares'].includes(expense?.split_type)
    ? expense.split_type
    : expense?.split_type === 'items' ? 'exact' : 'equal'

  const [description, setDescription] = useState(expense?.description ?? initial?.description ?? '')
  const [paidCurrency, setPaidCurrency] = useState(expense?.currency ?? initial?.currency ?? cur)
  const [currencyPicked, setCurrencyPicked] = useState(!!initial?.currencyPicked)
  const [amount, setAmount] = useState(
    expense ? minorToInput(expense.amount_minor, expense.currency ?? cur) : initial?.amount ?? '')
  const [manualRate, setManualRate] = useState('')
  const [paidBy, setPaidBy] = useState(expense?.paid_by ?? defaultPayer ?? members[0]?.id ?? '')
  const [spentAt, setSpentAt] = useState(expense?.spent_at ?? initial?.spentAt ?? today)
  const [splitWith, setSplitWith] = useState(
    expense ? (expense.expense_splits ?? []).map((s) => s.member_id) : members.map((m) => m.id))
  const [mode, setMode] = useState(initialMode)
  const [values, setValues] = useState(() => (isEdit ? prefillSplitValues(expense, initialMode, cur) : {}))
  const { busy, run } = useAsyncSubmit()
  // Inline errors for the required fields, shown from the first submit on.
  const [tried, setTried] = useState(false)
  const refs = { description: useRef(null), amount: useRef(null), paidBy: useRef(null) }
  const errors = tried ? checkFields({ description, amount, paidBy }, t) : {}
  const [adjust, setAdjust] = useState(false)
  const adjustId = useId()
  const sideways = !!useShellHeader()

  // What the user typed, for the Add form to carry to the other side.
  useEffect(() => {
    onDraft?.({ amount, currency: paidCurrency, currencyPicked, description, spentAt })
  }, [onDraft, amount, paidCurrency, currencyPicked, description, spentAt])

  // Rate paid currency → group currency. Editing keeps the saved rate unless
  // the currency or date changes.
  const needsFx = paidCurrency !== cur
  const captured = Number(expense?.exchange_rate)
  const keepCaptured = isEdit && needsFx && paidCurrency === expense.currency &&
    spentAt === expense.spent_at && captured > 0
  const fx = useFxRate(paidCurrency, cur, spentAt, { skip: keepCaptured })
  const rate = !needsFx ? 1
    : keepCaptured ? captured
      : fx.status === 'ok' ? fx.rate
        : fx.status === 'missing' ? parseManualRate(manualRate) : null

  const includedIds = members.filter((m) => splitWith.includes(m.id)).map((m) => m.id)
  const paidMinor = amount && Number(amount) > 0 ? toMinor(amount, paidCurrency) : 0
  // What the split must add up to: the amount in the group currency.
  const totalMinor = expenseGroupAmount(paidMinor, paidCurrency, rate, cur) ?? 0
  const setVal = (id, v) => setValues((s) => ({ ...s, [id]: v }))

  // Switching to Percent starts from an even split of whoever is included.
  function pickMode(next) {
    if (next === 'percent' && mode !== 'percent') setValues(evenPercents(includedIds))
    setMode(next)
  }

  function toggle(id) {
    setSplitWith((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]))
  }

  function handleScan({ total, date }) {
    if (total != null) setAmount(minorToInput(toMinor(total, paidCurrency), paidCurrency))
    if (date) setSpentAt(date)
  }

  // Live-compute each included member's share (minor) for the current mode.
  const computed = useMemo(
    () => computeSplit(mode, totalMinor, includedIds, values, cur),
    [mode, includedIds, values, totalMinor, cur])

  const shareOf = (id) => {
    const i = includedIds.indexOf(id)
    return i >= 0 ? computed.shares[i] ?? 0 : 0
  }

  async function submit() {
    const first = firstInvalid(checkFields({ description, amount, paidBy }, t), FIELDS)
    if (first) {
      setTried(true)
      refs[first].current?.focus()
      return
    }
    // Never split a foreign amount without a real rate (no silent 1:1).
    if (!rate) {
      return toast({
        title: t(fx.status === 'loading' ? 'form.toast.fxLoading' : 'form.toast.fxMissing'),
        status: 'warning',
      })
    }
    if (includedIds.length === 0) return toast({ title: t('form.toast.nobody'), status: 'warning' })

    if (mode === 'exact' && computed.assigned !== totalMinor) {
      const diff = totalMinor - computed.assigned
      return toast({
        title: t('form.toast.exactTitle'),
        description: t(diff > 0 ? 'form.toast.missing' : 'form.toast.overBy', { amount: formatMoney(Math.abs(diff), cur) }),
        status: 'warning',
      })
    }
    if (mode === 'percent' && !computed.ok) {
      return toast({ title: t('form.toast.percent'), status: 'warning' })
    }
    if (mode === 'shares' && !computed.ok) {
      return toast({ title: t('form.toast.shares'), status: 'warning' })
    }

    const shares = mode === 'equal' ? null : includedIds.map((id) => shareOf(id))
    const myShare = shareOf(myMemberId)
    await run(async () => {
      if (isEdit) {
        await updateSharedExpense({
          expenseId: expense.id, description, amountMinor: paidMinor, currency: paidCurrency,
          exchangeRate: needsFx ? rate : null,
          paidBy, spentAt, memberIds: includedIds, shares, splitType: mode,
        })
        toast({ title: t('form.toast.updated'), status: 'success' })
      } else {
        await addSharedExpense({
          groupId: group.id, description, amountMinor: paidMinor, currency: paidCurrency,
          exchangeRate: needsFx ? rate : null,
          paidBy, spentAt, memberIds: includedIds, shares, splitType: mode,
        })
        toast(quick ? {
          title: t('form.toast.addedTo', { name: group.name }),
          description: myShare > 0
            ? t('form.toast.yourShare', { amount: formatMoney(myShare, cur) })
            : t('form.toast.notYours'),
          status: 'success',
        } : { title: t('form.toast.added'), status: 'success' })
      }
      onSaved?.()
    })
  }

  const remaining = totalMinor - computed.assigned
  const pctSum = mode === 'percent' ? (computed.wsum ?? 0) : 0

  function summary() {
    if (includedIds.length === 0) return t('form.summary.pickOne')
    if (needsFx && paidMinor && !rate) return t('form.summary.needsRate')
    if (!totalMinor) return t('form.summary.enterAmount')
    if (mode === 'equal') return t('form.summary.each', { amount: formatMoney(splitEqually(totalMinor, includedIds.length)[0], cur) })
    if (mode === 'exact') {
      if (remaining === 0) return t('form.summary.addsUp')
      return t(remaining > 0 ? 'form.summary.left' : 'form.summary.over', { amount: formatMoney(Math.abs(remaining), cur) })
    }
    if (mode === 'percent') {
      const r = Math.round((pctSum) * 10) / 10
      // English keeps its plain "33.3"; Greek writes "33,3".
      const pct = intlLocale() ? r.toLocaleString(intlLocale()) : String(r)
      return r === 100 ? t('form.summary.pctOk') : t('form.summary.pctPartial', { pct })
    }
    return t(computed.wsum > 0 ? 'form.summary.byShares' : 'form.summary.giveShare')
  }
  const summaryOk = includedIds.length > 0 && totalMinor > 0 &&
    (mode === 'equal' || computed.ok)

  const addon = mode === 'percent' ? '%' : mode === 'shares' ? '×' : cur

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
          <Select value={paidCurrency} aria-label={t('form.currencyPaid')}
            onChange={(e) => { setPaidCurrency(e.target.value); setCurrencyPicked(true) }}>
            {(CURRENCIES.includes(cur) ? CURRENCIES : [cur, ...CURRENCIES]).map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </Select>
        </FormControl>
      </HStack>
      {needsFx && (
        <FxPreview from={paidCurrency} to={cur} amountMinor={paidMinor}
          fx={fx} captured={keepCaptured ? captured : null} rate={rate}
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
        {MODES.map((m) => (
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
                  {formatMoney(shareOf(m.id), cur)}
                </Text>
              )}
            </HStack>
          )
        })}
      </Stack>

      <Text fontSize="sm" mt={2} fontWeight="600"
        color={summaryOk ? 'status.positive' : 'text.muted'}>
        {summary()}
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
  const splitCard = (
    <>
      <HStack spacing={3}>
        <AvatarStack members={members.filter((m) => splitWith.includes(m.id))} myUserId={myUserId}
          ring="bg.surface" />
        <Box flex="1" minW={0}>
          <Text fontSize="sm" fontWeight="600">{t(mode === 'equal' ? 'form.splitEqually' : 'form.customSplit')}</Text>
          <Text fontSize="xs" color="text.muted">
            {splitCountLabel(includedIds.length, members.length)} · {summary()}
          </Text>
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
