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

// /groups/:id/settle — record a payment between you and another member.
export default function SettleUpPage() {
  return (
    <GroupFormPage title="Settle up">
      {(ctx) => (ctx.myMember ? <SettleUpForm {...ctx} /> : (
        <Panel><Text color="text.muted">Only the group’s members can settle up.</Text></Panel>
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

  function applySuggestion(t, i) {
    setDirection(t.direction)
    setOtherId(t.otherId)
    setAmount(minorToInput(t.amount, group.currency))
    setPicked(i)
  }

  // Editing a field by hand means the form no longer matches a suggestion.
  const edited = (fn) => (v) => { fn(v); setPicked(-1) }

  async function nudge(memberId) {
    try {
      await nudgeMember(group.id, memberId)
      toast({ title: 'Reminder sent', status: 'success' })
    } catch (e) {
      console.error('[groups] reminder failed:', e)
      toast({ title: userMessage(e, 'Couldn’t send the reminder. Please try again.'), status: 'info' })
    }
  }

  async function submit() {
    if (!otherId) return toast({ title: 'Pick a person', status: 'warning' })
    if (!amount || Number(amount) <= 0) return toast({ title: 'Enter an amount', status: 'warning' })
    const from = direction === 'out' ? myMember.id : otherId
    const to = direction === 'out' ? otherId : myMember.id
    await run(async () => {
      await addSettlement({
        groupId: group.id, fromMember: from, toMember: to,
        amountMinor: toMinor(amount, group.currency), currency: group.currency, settledAt,
      })
      toast({ title: 'Settlement recorded', status: 'success' })
      back()
    })
  }

  if (others.length === 0) {
    return <Panel><Text color="text.muted">Add another member first.</Text></Panel>
  }

  return (
    <PageForm onSubmit={submit} busy={busy} submitLabel="Record">
      <Stack spacing={4}>
        {myPlan.length > 0 && (
          <Box borderWidth="1px" borderColor="border.default" borderRadius="lg" p={3}>
            <HStack mb={2} color="accent.fg">
              <Wand2 size={15} />
              <Text fontSize="sm" fontWeight="600">Suggested to settle up</Text>
            </HStack>
            <Stack spacing={1}>
              {myPlan.map((t, i) => {
                const iPay = t.direction === 'out'
                const on = picked === i
                return (
                  <HStack key={i} spacing={1}>
                    {/* The whole row fills the form with this payment. */}
                    <Button variant="ghost" flex="1" minW={0} h="auto" minH="44px" py={2} px={2}
                      justifyContent="flex-start" textAlign="left" whiteSpace="normal"
                      fontWeight="400" fontSize="sm" color="text.primary"
                      bg={on ? 'bg.subtle' : undefined} aria-pressed={on}
                      onClick={() => applySuggestion(t, i)}>
                      <Text as="span" overflowWrap="anywhere">
                        {iPay
                          ? <>Pay <b>{nameOf(t.to)}</b> {formatMoney(t.amount, group.currency)}</>
                          : <><b>{nameOf(t.from)}</b> pays you {formatMoney(t.amount, group.currency)}</>}
                      </Text>
                    </Button>
                    {!iPay && members.find((m) => m.id === t.from)?.user_id && (
                      <Tooltip label="Send them a reminder">
                        <IconButton aria-label={`Remind ${nameOf(t.from)} to settle`} size="md" variant="ghost"
                          icon={<BellRing size={18} />} onClick={() => nudge(t.from)} />
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
            onClick={() => edited(setDirection)('out')}>I paid</Button>
          <Button flex="1" variant={direction === 'in' ? 'solid' : 'outline'}
            colorScheme={direction === 'in' ? 'brand' : 'gray'} aria-pressed={direction === 'in'}
            onClick={() => edited(setDirection)('in')}>I received</Button>
        </HStack>

        <FormControl isRequired>
          <FormLabel>{direction === 'out' ? 'Paid to' : 'Received from'}</FormLabel>
          <Select value={otherId} onChange={(e) => edited(setOtherId)(e.target.value)}>
            {others.map((m) => <option key={m.id} value={m.id}>{m.display_name}</option>)}
          </Select>
          {otherId && (
            <Text fontSize="xs" color="text.muted" mt={1}>
              {otherNet === 0 ? `${otherName} is settled up`
                : otherNet > 0 ? `${otherName} is owed ${formatMoney(otherNet, group.currency)} overall`
                : `${otherName} owes ${formatMoney(-otherNet, group.currency)} overall`}
            </Text>
          )}
        </FormControl>

        <HStack align="end" justify="center" color="text.muted" fontSize="sm">
          <Text fontWeight="600" color="text.primary">
            {direction === 'out' ? 'You' : otherName || '—'}
          </Text>
          <ArrowRight size={16} />
          <Text fontWeight="600" color="text.primary">
            {direction === 'out' ? otherName || '—' : 'You'}
          </Text>
        </HStack>

        <HStack>
          <FormControl isRequired>
            <FormLabel>Amount ({group.currency})</FormLabel>
            <MoneyInput currency={group.currency} value={amount} onChange={edited(setAmount)} />
          </FormControl>
          <FormControl maxW="160px">
            <FormLabel>Date</FormLabel>
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
