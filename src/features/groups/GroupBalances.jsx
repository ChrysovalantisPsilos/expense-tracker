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
import { useShortLandscape } from '../../shared/ui/useShortLandscape.js'
import { useT } from '../../shared/lib/i18n/I18nProvider.jsx'

// Where the group stands: your balance (with Settle up), everyone's net, the
// line that matters most to you, then the whole group's settle-up plan
// (fewest payments) when anyone still owes. On a phone held sideways the
// card is compact — a smaller balance, everyone's tiles on one row (up to
// four) — so it doesn't fill the screen.
export default function GroupBalances({ group, members, balances, myMember, myUserId, onSettle }) {
  const money = (minor) => formatMoney(minor, group.currency)
  const plan = settlePlan(balances, members, myMember?.id)
  const highlight = balanceHighlight(plan)
  const memberNets = memberBalances(balances, members, myUserId)
  const avatarOf = (mid) => members.find((m) => m.id === mid)?.avatar_url
  const mine = signedAmount(myMember ? (balances.get(myMember.id) ?? 0) : 0, money)
  const sideways = useShortLandscape()
  const t = useT('groups')

  return (
    <>
      <Panel>
        <HStack align="center" spacing={3}>
          <Figure label={t('balances.yours')} value={mine.text} tone={mine.tone} size={sideways ? 'lg' : 'xl'} flex="1" />
          <Button size="sm" variant="outline" leftIcon={<HandCoins size={16} />} flexShrink={0}
            onClick={onSettle}>{t('balances.settleUp')}</Button>
        </HStack>
        {memberNets.length > 1 && (
          <>
            <SectionLabel mt={sideways ? 3 : 4} mb={2}>{t('balances.title')}</SectionLabel>
            <BalanceGrid columns={sideways ? Math.min(memberNets.length, 4) : undefined}>
              {memberNets.map((b) => {
                const { text, tone } = signedAmount(b.net, money)
                return <BalanceTile key={b.id} label={b.label} value={text} tone={tone} />
              })}
            </BalanceGrid>
          </>
        )}
        <HighlightPill mt={3} amount={highlight ? money(highlight.amount) : undefined}
          amountTone={highlight?.tone}>
          {highlight ? highlight.text : t('balances.allSettled')}
        </HighlightPill>
      </Panel>

      {plan.length > 0 && (
        <Panel icon={ArrowRightLeft} title={t('balances.whoOwes')}
          subtitle={t('balances.plan', { payments: pluralise(plan.length, 'payment') })}>
          <Stack spacing={2}>
            {plan.map((p) => (
              <TransferRow key={`${p.from}-${p.to}`} amount={money(p.amount)} amountTone={p.tone}
                from={{ name: p.fromName, src: avatarOf(p.from), highlight: p.from === myMember?.id }}
                to={{ name: p.toName, src: avatarOf(p.to), highlight: p.to === myMember?.id }} />
            ))}
          </Stack>
        </Panel>
      )}
    </>
  )
}
