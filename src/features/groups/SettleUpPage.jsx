import { useMemo, useState } from 'react'
import {
  Stack, HStack, Text, FormControl, FormLabel, Input, Select, Button, useToast,
  Box, IconButton, Tooltip,
} from '@chakra-ui/react'
import { ArrowRight, Wand2, BellRing } from 'lucide-react'
import { addSettlement, nudgeMember } from './groups.js'
import { toMinor } from '../../shared/lib/currency.js'
import { today } from '../../shared/lib/dates.js'
import { useAsyncSubmit } from '../../shared/lib/useAsyncSubmit.js'
import { userMessage } from '../../shared/lib/errors.js'
import {
  settleFormStart, settleOtherLine, settleOthers, settleParties, settleProblem, settleSuggestionParts, settlementArgs,
} from './settleForm.js'
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
  const cur = group.currency
  const others = settleOthers(members, myMember.id)
  // Minimal set of transfers that settles the whole group; surface only the
  // ones the current user is part of, one tap to pre-fill the form.
  const myPlan = useMemo(() => settleSuggestionParts({ balances, members, myMemberId: myMember.id, currency: cur }),
    [balances, members, myMember, cur])
  // Only on opening: later balance updates must not overwrite what's typed.
  const [start] = useState(() => settleFormStart({ balances, members, myMemberId: myMember.id, currency: cur, today: today() }))
  const [direction, setDirection] = useState(start.direction) // 'out' = I paid, 'in' = they paid me
  const [otherId, setOtherId] = useState(start.otherId)
  const [amount, setAmount] = useState(start.amount)
  const [settledAt, setSettledAt] = useState(start.settledAt)
  const [picked, setPicked] = useState(start.picked) // the suggestion the form holds
  const { busy, run } = useAsyncSubmit()

  const parties = settleParties({ direction, members, otherId })
  const otherLine = settleOtherLine({ balances, members, otherId, currency: cur })

  function applySuggestion(s) {
    setDirection(s.direction)
    setOtherId(s.otherId)
    setAmount(s.amount)
    setPicked(s.index)
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
    const problem = settleProblem({ otherId, amount })
    if (problem) return toast({ title: problem, status: 'warning' })
    await run(async () => {
      await addSettlement(settlementArgs({
        groupId: group.id, direction, myMemberId: myMember.id, otherId, amount, currency: cur, settledAt,
      }))
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
              {myPlan.map((s) => {
                const on = picked === s.index
                return (
                  <HStack key={s.index} spacing={1}>
                    {/* The whole row fills the form with this payment. */}
                    <Button variant="ghost" flex="1" minW={0} h="auto" minH="44px" py={2} px={2}
                      justifyContent="flex-start" textAlign="left" whiteSpace="normal"
                      fontWeight="400" fontSize="sm" color="text.primary"
                      bg={on ? 'bg.subtle' : undefined} aria-pressed={on}
                      onClick={() => applySuggestion(s)}>
                      <Text as="span" overflowWrap="anywhere">
                        <Trans t={t} k={s.key} components={{ b: <b /> }} values={s.values} />
                      </Text>
                    </Button>
                    {s.remind && (
                      <Tooltip label={t('settle.remindTip')}>
                        <IconButton aria-label={s.remind.label} size="md" variant="ghost"
                          icon={<BellRing size={18} />} onClick={() => nudge(s.remind.memberId)} />
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
          {otherLine && <Text fontSize="xs" color="text.muted" mt={1}>{otherLine}</Text>}
        </FormControl>

        <HStack align="end" justify="center" color="text.muted" fontSize="sm">
          <Text fontWeight="600" color="text.primary">{parties.from}</Text>
          <ArrowRight size={16} />
          <Text fontWeight="600" color="text.primary">{parties.to}</Text>
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
