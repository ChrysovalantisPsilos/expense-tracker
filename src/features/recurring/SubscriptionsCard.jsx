import { useMemo } from 'react'
import { Link as RouterLink } from 'react-router-dom'
import { Box, Button, Text } from '@chakra-ui/react'
import { Repeat } from 'lucide-react'
import Panel from '../../shared/ui/kit/Panel.jsx'
import Figure from '../../shared/ui/kit/Figure.jsx'
import { CardEmptyState } from '../../shared/ui/EmptyState.jsx'
import ItemRow from '../../shared/ui/kit/ItemRow.jsx'
import SectionLabel from '../../shared/ui/kit/SectionLabel.jsx'
import CategoryBadge from '../../shared/ui/CategoryBadge.jsx'
import { formatMoney } from '../../shared/lib/currency.js'
import { shortDate, today } from '../../shared/lib/dates.js'
import { paidInWindow } from '../../shared/lib/spread.js'
import { useProfile } from '../../shared/lib/ProfileProvider.jsx'
import { usePaged } from '../../shared/ui/usePaged.js'
import Paginator from '../../shared/ui/Paginator.jsx'
import { SkeletonRegion, SkeletonRows } from '../../shared/ui/Skeleton.jsx'
import QueryError from '../../shared/ui/QueryError.jsx'
import { isPastPeriod, isMonthPeriod } from '../../shared/lib/periods.js'
import { chargedGroups, chargedWording, frequencyLabel, subscriptionGroups } from './recurringMath.js'
import { GroupTabs, GroupTotal, baseHint } from './SubscriptionGroups.jsx'
import { useT } from '../../shared/lib/i18n/I18nProvider.jsx'
import { entryName } from '../../shared/lib/categoryName.js'

// Home's "Recurring" card, following Home's `period` (periods.js):
//  * this month (and next month, once its salary is in): today's view — the
//    active recurring expenses by how often they charge (Weekly · Monthly ·
//    Quarterly · Yearly, only the groups the user has), each with its total
//    per period, about how much a month, and the next few charges. `rules`
//    are the useRecurring() rows; `loading` while they're on their way;
//    `error` (with `onRetry`) when they couldn't be read — never shown as
//    "No subscriptions yet". Foreign rules count in the totals at `fx` =
//    useRuleRates() ({ rates, loading }).
//  * any other (past) period: what was actually charged in it
//    (recurringMath.chargedGroups), from Home's own rows for the period —
//    `charges` = { rows, loading, error, onRetry } — so it costs no query.
// Informational either way: it never feeds Home's totals, whichever way the
// yearly-subscription setting is set (the Yearly tab just says how those count).
export default function SubscriptionsCard({ rules, fx, loading, error, onRetry, baseCurrency, period, charges }) {
  const t = useT('recurring')
  const upcoming = !period || (isMonthPeriod(period) && !isPastPeriod(period, today()))
  return (
    <Panel data-tour="subscriptions" icon={Repeat} title={t('list.title')}
      subtitle={upcoming ? undefined : chargedWording(period).subtitle}
      action={<Button as={RouterLink} to="/recurring" size="xs" variant="ghost">{t('card.manage')}</Button>}>
      {upcoming
        ? <Upcoming rules={rules} rates={fx.rates} loading={loading || fx.loading} error={error} onRetry={onRetry}
          baseCurrency={baseCurrency} />
        : <Charged period={period} {...charges} baseCurrency={baseCurrency} />}
    </Panel>
  )
}

// The yearly-subscriptions note under the Yearly tab's total.
function YearlyNote() {
  const t = useT('recurring')
  const { separateYearly } = useProfile()
  return (
    <Text fontSize="xs" color="text.muted" mt={1}>
      {t(separateYearly ? 'card.yearlySeparate' : 'card.yearlySpread')}
    </Text>
  )
}

function Upcoming({ rules, rates, loading, error, onRetry, baseCurrency }) {
  const t = useT('recurring')
  const groups = useMemo(
    () => subscriptionGroups(rules, baseCurrency, { upcomingOnly: true, rates }), [rules, baseCurrency, rates])
  if (error) return <QueryError error={error} onRetry={onRetry} what={t('card.whatUpcoming')} />
  if (loading) return <SkeletonRegion><SkeletonRows count={3} /></SkeletonRegion>
  if (groups.length === 0) {
    return (
      <CardEmptyState text={t('card.empty')}
        action={<Button as={RouterLink} to="/recurring/new" size="sm" variant="outline">{t('card.add')}</Button>} />
    )
  }
  return (
    <GroupTabs groups={groups} label={t('card.upcomingByFrequency')}>
      {(g) => (
        <>
          <GroupTotal group={g} baseCurrency={baseCurrency} />
          {g.key === 'yearly' && <YearlyNote />}
          <SectionLabel mt={4} mb={1}>{t('card.nextCharges')}</SectionLabel>
          <Box as="ul" listStyleType="none">
            {g.next.map((r) => (
              <ItemRow as="li" key={r.id} py={2.5}
                media={<CategoryBadge category={r.categories} kind={r.kind} size={32} />}
                title={entryName(r, t('kinds.expense'))}
                meta={`${shortDate(r.next_run)} · ${frequencyLabel(r)}`}
                amount={formatMoney(r.amount_minor, r.currency)} amountMeta={baseHint(r, baseCurrency, rates)} />
            ))}
          </Box>
        </>
      )}
    </GroupTabs>
  )
}

function Charged({ period, rows = [], loading, error, onRetry, baseCurrency }) {
  const t = useT('recurring')
  const groups = useMemo(
    () => chargedGroups(paidInWindow(rows, period.from, period.to), baseCurrency),
    [rows, period.from, period.to, baseCurrency])
  if (error) return <QueryError error={error} onRetry={onRetry} what={t('card.whatCharged')} />
  if (loading) return <SkeletonRegion><SkeletonRows count={3} /></SkeletonRegion>
  if (groups.length === 0) return <CardEmptyState text={chargedWording(period).empty} />
  return (
    <GroupTabs groups={groups} label={t('card.chargedByFrequency')}>
      {(g) => (
        <>
          <Figure label={t(`groups.charged.${g.key}`)} size="lg" value={formatMoney(g.total, baseCurrency)} />
          {g.key === 'yearly' && <YearlyNote />}
          <SectionLabel mt={4} mb={1}>{t('card.charges', { count: g.charges.length })}</SectionLabel>
          <ChargeList charges={g.charges} resetKey={`${period.value}|${g.key}`} />
        </>
      )}
    </GroupTabs>
  )
}

// A group's charges (date, name, amount as paid), 10 a page.
function ChargeList({ charges, resetKey }) {
  const t = useT('recurring')
  const { page, setPage, count, pageItems } = usePaged(charges, 10, resetKey)
  return (
    <>
      <Box as="ul" listStyleType="none">
        {pageItems.map((r) => (
          <ItemRow as="li" key={r.id} py={2.5}
            media={<CategoryBadge category={r.categories} kind={r.kind} size={32} />}
            title={entryName(r, t('kinds.expense'))}
            meta={`${shortDate(r.spent_at)} · ${frequencyLabel(r.recurring ?? { frequency: 'monthly' })}`}
            amount={formatMoney(r.amount_minor, r.currency)} />
        ))}
      </Box>
      <Paginator page={page} count={count} onPage={setPage} />
    </>
  )
}
