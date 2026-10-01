import { Stack, HStack, Button } from '@chakra-ui/react'
import { ArrowRightLeft, HandCoins } from 'lucide-react'
import { balancesParts } from './groupFormat.js'
import Panel from '../../shared/ui/kit/Panel.jsx'
import Figure from '../../shared/ui/kit/Figure.jsx'
import SectionLabel from '../../shared/ui/kit/SectionLabel.jsx'
import HighlightPill from '../../shared/ui/kit/HighlightPill.jsx'
import TransferRow from '../../shared/ui/kit/TransferRow.jsx'
import { BalanceGrid, BalanceTile } from '../../shared/ui/kit/Balances.jsx'
import { useShortLandscape } from '../../shared/ui/useShortLandscape.js'
import { useT } from '../../shared/lib/i18n/I18nProvider.jsx'

// Where the group stands: your balance (with Settle up), everyone's net, the
// line that matters most to you, then the whole group's settle-up plan
// (fewest payments) when anyone still owes. On a phone held sideways the
// card is compact — a smaller balance, everyone's tiles on one row (up to
// four) — so it doesn't fill the screen. The figures and words are
// balancesParts' (the native app's too).
export default function GroupBalances({ group, members, balances, myMember, myUserId, onSettle }) {
  const parts = balancesParts({ balances, members, myMember, myUserId, currency: group.currency })
  const sideways = useShortLandscape()
  const t = useT('groups')

  return (
    <>
      <Panel>
        <HStack align="center" spacing={3}>
          <Figure label={t('balances.yours')} value={parts.mine.text} tone={parts.mine.tone} size={sideways ? 'lg' : 'xl'} flex="1" />
          <Button size="sm" variant="outline" leftIcon={<HandCoins size={16} />} flexShrink={0}
            onClick={onSettle}>{t('balances.settleUp')}</Button>
        </HStack>
        {parts.tiles.length > 0 && (
          <>
            <SectionLabel mt={sideways ? 3 : 4} mb={2}>{t('balances.title')}</SectionLabel>
            <BalanceGrid columns={sideways ? Math.min(parts.tiles.length, 4) : undefined}>
              {parts.tiles.map((b) => <BalanceTile key={b.id} label={b.label} value={b.text} tone={b.tone} />)}
            </BalanceGrid>
          </>
        )}
        <HighlightPill mt={3} amount={parts.highlight.amount ?? undefined}
          amountTone={parts.highlight.tone ?? undefined}>
          {parts.highlight.text}
        </HighlightPill>
      </Panel>

      {parts.plan.length > 0 && (
        <Panel icon={ArrowRightLeft} title={t('balances.whoOwes')} subtitle={parts.planSubtitle}>
          <Stack spacing={2}>
            {parts.plan.map((p) => (
              <TransferRow key={p.key} amount={p.amount} amountTone={p.tone} from={p.from} to={p.to} />
            ))}
          </Stack>
        </Panel>
      )}
    </>
  )
}
