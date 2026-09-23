import { Stack, HStack, Button } from '@chakra-ui/react'
import { ArrowRightLeft, HandCoins } from 'lucide-react'
import { settlePlan, pluralise, memberBalances, balanceHighlight } from './groupFormat.js'
import { formatMoney } from '../../shared/lib/currency.js'
import Panel from '../../shared/ui/kit/Panel.jsx'
import Figure from '../../shared/ui/kit/Figure.jsx'
import SectionLabel from '../../shared/ui/kit/SectionLabel.jsx'
import HighlightPill from '../../shared/ui/kit/HighlightPill.jsx'
import TransferRow from '../../shared/ui/kit/TransferRow.jsx'
import { BalanceGrid, BalanceTile } from '../../shared/ui/kit/Balances.jsx'
import { signedAmount } from '../../shared/ui/kit/kitMath.js'

// Where the group stands: your balance (with Settle up), everyone's net, the
// line that matters most to you, then the whole group's settle-up plan
// (fewest payments) when anyone still owes.
export default function GroupBalances({ group, members, balances, myMember, myUserId, onSettle }) {
  const money = (minor) => formatMoney(minor, group.currency)
  const plan = settlePlan(balances, members, myMember?.id)
  const highlight = balanceHighlight(plan)
  const memberNets = memberBalances(balances, members, myUserId)
  const avatarOf = (mid) => members.find((m) => m.id === mid)?.avatar_url
  const mine = signedAmount(myMember ? (balances.get(myMember.id) ?? 0) : 0, money)

  return (
    <>
      <Panel>
        <HStack align="center" spacing={3}>
          <Figure label="Your balance" value={mine.text} tone={mine.tone} size="xl" flex="1" />
          <Button size="sm" variant="outline" leftIcon={<HandCoins size={16} />} flexShrink={0}
            onClick={onSettle}>Settle up</Button>
        </HStack>
        {memberNets.length > 1 && (
          <>
            <SectionLabel mt={4} mb={2}>Balances</SectionLabel>
            <BalanceGrid>
              {memberNets.map((b) => {
                const { text, tone } = signedAmount(b.net, money)
                return <BalanceTile key={b.id} label={b.label} value={text} tone={tone} />
              })}
            </BalanceGrid>
          </>
        )}
        <HighlightPill mt={3} amount={highlight ? money(highlight.amount) : undefined}
          amountTone={highlight?.tone}>
          {highlight ? highlight.text : 'You’re all settled up'}
        </HighlightPill>
      </Panel>

      {plan.length > 0 && (
        <Panel icon={ArrowRightLeft} title="Who owes whom"
          subtitle={`${pluralise(plan.length, 'payment')} to settle everyone up`}>
          <Stack spacing={2}>
            {plan.map((t) => (
              <TransferRow key={`${t.from}-${t.to}`} amount={money(t.amount)} amountTone={t.tone}
                from={{ name: t.fromName, src: avatarOf(t.from), highlight: t.from === myMember?.id }}
                to={{ name: t.toName, src: avatarOf(t.to), highlight: t.to === myMember?.id }} />
            ))}
          </Stack>
        </Panel>
      )}
    </>
  )
}
