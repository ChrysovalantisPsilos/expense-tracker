import { useMemo, useState } from 'react'
import {
  Stack, HStack, Text, FormControl, FormLabel, Input, Select, Button, useToast,
  Box, IconButton, Tooltip,
} from '@chakra-ui/react'
import { ArrowRight, Wand2, BellRing } from 'lucide-react'
import { addSettlement, nudgeMember } from './groups.js'
import { toMinor, formatMoney, minorToInput } from '../../shared/lib/currency.js'
import { today } from '../../shared/lib/dates.js'
import { useAsyncSubmit } from '../../shared/lib/useAsyncSubmit.js'
import { userMessage } from '../../shared/lib/errors.js'
import { memberName, mySettleSuggestions } from './groupFormat.js'
import MoneyInput from '../../shared/ui/MoneyInput.jsx'
import { PageForm } from '../../shared/ui/FormPage.jsx'
import Panel from '../../shared/ui/kit/Panel.jsx'
import useGoBack from '../../shared/ui/useGoBack.js'
import PayShortcuts from './PayShortcuts.jsx'
import PaymentDetailsAsk from './PaymentDetailsAsk.jsx'
import GroupFormPage from './GroupFormPage.jsx'
import { Trans, useT } from '../../shared/lib/i18n/I18nProvider.jsx'

// /groups/:id/settle — record a payment between you and another member.
export default function SettleUpPage() {
  const t = useT('groups')
  return (
    <GroupFormPage title={t('settle.title')}>
      {(ctx) => (ctx.myMember ? <SettleUpForm {...ctx} /> : (
        <Panel><Text color="text.muted">{t('settle.onlyMembers')}</Text></Panel>
      ))}
    </GroupFormPage>
  )
}

// Settle-up is always framed from the current user: they are one side of every
// settlement (payer or receiver), and pick the other member. Prevents
// arbitrary member-to-member entries. The form opens on the top suggestion
// (the biggest payment you're part of), worked out from the live balances —
// so it's the same whether the page was opened from the group or reloaded —
// and recording it is one tap on Record.
function SettleUpForm({ group, members, myMember, balances, groupPath }) {
  const toast = useToast()
  const t = useT('groups')
  const back = useGoBack(groupPath)
  const others = members.filter((m) => m.id !== myMember.id)
  // Minimal set of transfers that settles the whole group; surface only the
  // ones the current user is part of, one tap to pre-fill the form.
  const myPlan = useMemo(() => mySettleSuggestions(balances, myMember.id), [balances, myMember])
  // Only on opening: later balance updates must not overwrite what's typed.
  const [top] = useState(() => myPlan[0] ?? null)
  const [direction, setDirection] = useState(top?.direction ?? 'out') // 'out' = I paid, 'in' = they paid me
  const [otherId, setOtherId] = useState(top?.otherId ?? others[0]?.id ?? '')
  const [amount, setAmount] = useState(top ? minorToInput(top.amount, group.currency) : '')
  const [settledAt, setSettledAt] = useState(() => today())
  const [picked, setPicked] = useState(top ? 0 : -1) // the suggestion the form holds
  const { busy, run } = useAsyncSubmit()

  const otherNet = balances?.get(otherId) ?? 0
  const otherName = others.find((m) => m.id === otherId)?.display_name ?? ''
  const nameOf = (id) => memberName(members, id)

  function applySuggestion(s, i) {
    setDirection(s.direction)
    setOtherId(s.otherId)
    setAmount(minorToInput(s.amount, group.currency))
    setPicked(i)
  }

  // Editing a field by hand means the form no longer matches a suggestion.
  const edited = (fn) => (v) => { fn(v); setPicked(-1) }

  async function nudge(memberId) {
    try {
      await nudgeMember(group.id, memberId)
      toast({ title: t('settle.reminderSent'), status: 'success' })
    } catch (e) {
      console.error('[groups] reminder failed:', e)
      toast({ title: userMessage(e, t('settle.reminderFailed')), status: 'info' })
    }
  }

  async function submit() {
    if (!otherId) return toast({ title: t('settle.pickPerson'), status: 'warning' })
    if (!amount || Number(amount) <= 0) return toast({ title: t('settle.enterAmount'), status: 'warning' })
    const from = direction === 'out' ? myMember.id : otherId
    const to = direction === 'out' ? otherId : myMember.id
    await run(async () => {
      await addSettlement({
        groupId: group.id, fromMember: from, toMember: to,
        amountMinor: toMinor(amount, group.currency), currency: group.currency, settledAt,
      })
      toast({ title: t('settle.recorded'), status: 'success' })
      back()
    })
  }

  if (others.length === 0) {
    return <Panel><Text color="text.muted">{t('settle.addMemberFirst')}</Text></Panel>
  }

  return (
    <PageForm onSubmit={submit} busy={busy} submitLabel={t('settle.record')}>
      <Stack spacing={4}>
        {myPlan.length > 0 && (
          <Box borderWidth="1px" borderColor="border.default" borderRadius="lg" p={3}>
            <HStack mb={2} color="accent.fg">
              <Wand2 size={15} />
              <Text fontSize="sm" fontWeight="600">{t('settle.suggested')}</Text>
            </HStack>
            <Stack spacing={1}>
              {myPlan.map((s, i) => {
                const iPay = s.direction === 'out'
                const on = picked === i
                return (
                  <HStack key={i} spacing={1}>
                    {/* The whole row fills the form with this payment. */}
                    <Button variant="ghost" flex="1" minW={0} h="auto" minH="44px" py={2} px={2}
                      justifyContent="flex-start" textAlign="left" whiteSpace="normal"
                      fontWeight="400" fontSize="sm" color="text.primary"
                      bg={on ? 'bg.subtle' : undefined} aria-pressed={on}
                      onClick={() => applySuggestion(s, i)}>
                      <Text as="span" overflowWrap="anywhere">
                        <Trans t={t} k={iPay ? 'settle.payOut' : 'settle.payIn'} components={{ b: <b /> }}
                          values={{ name: nameOf(iPay ? s.to : s.from), amount: formatMoney(s.amount, group.currency) }} />
                      </Text>
                    </Button>
                    {!iPay && members.find((m) => m.id === s.from)?.user_id && (
                      <Tooltip label={t('settle.remindTip')}>
                        <IconButton aria-label={t('settle.remind', { name: nameOf(s.from) })} size="md" variant="ghost"
                          icon={<BellRing size={18} />} onClick={() => nudge(s.from)} />
                      </Tooltip>
                    )}
                  </HStack>
                )
              })}
            </Stack>
          </Box>
        )}
        <HStack spacing={2}>
          <Button flex="1" variant={direction === 'out' ? 'solid' : 'outline'}
            colorScheme={direction === 'out' ? 'brand' : 'gray'} aria-pressed={direction === 'out'}
            onClick={() => edited(setDirection)('out')}>{t('settle.iPaid')}</Button>
          <Button flex="1" variant={direction === 'in' ? 'solid' : 'outline'}
            colorScheme={direction === 'in' ? 'brand' : 'gray'} aria-pressed={direction === 'in'}
            onClick={() => edited(setDirection)('in')}>{t('settle.iReceived')}</Button>
        </HStack>

        <FormControl isRequired>
          <FormLabel>{t(direction === 'out' ? 'settle.paidTo' : 'settle.receivedFrom')}</FormLabel>
          <Select value={otherId} onChange={(e) => edited(setOtherId)(e.target.value)}>
            {others.map((m) => <option key={m.id} value={m.id}>{m.display_name}</option>)}
          </Select>
          {otherId && (
            <Text fontSize="xs" color="text.muted" mt={1}>
              {otherNet === 0 ? t('settle.otherSettled', { name: otherName })
                : t(otherNet > 0 ? 'settle.otherOwed' : 'settle.otherOwes',
                  { name: otherName, amount: formatMoney(Math.abs(otherNet), group.currency) })}
            </Text>
          )}
        </FormControl>

        <HStack align="end" justify="center" color="text.muted" fontSize="sm">
          <Text fontWeight="600" color="text.primary">
            {direction === 'out' ? t('you') : otherName || '—'}
          </Text>
          <ArrowRight size={16} />
          <Text fontWeight="600" color="text.primary">
            {direction === 'out' ? otherName || '—' : t('you')}
          </Text>
        </HStack>

        <HStack>
          <FormControl isRequired>
            <FormLabel>{t('settle.amount', { currency: group.currency })}</FormLabel>
            <MoneyInput currency={group.currency} value={amount} onChange={edited(setAmount)} />
          </FormControl>
          <FormControl maxW="160px">
            <FormLabel>{t('settle.date')}</FormLabel>
            <Input type="date" value={settledAt} onChange={(e) => setSettledAt(e.target.value)} />
          </FormControl>
        </HStack>

        <PaymentDetailsAsk direction={direction} />

        {direction === 'out' && otherId && Number(amount) > 0 && (
          <PayShortcuts
            member={others.find((m) => m.id === otherId)}
            amountMinor={toMinor(amount, group.currency)}
            currency={group.currency}
            groupName={group.name}
          />
        )}
      </Stack>
    </PageForm>
  )
}
