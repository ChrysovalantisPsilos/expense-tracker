import { useMemo } from 'react'
import { Link as RouterLink } from 'react-router-dom'
import { Box, Button, Text } from '@chakra-ui/react'
import { Repeat } from 'lucide-react'
import Panel from '../../shared/ui/kit/Panel.jsx'
import ItemRow from '../../shared/ui/kit/ItemRow.jsx'
import SectionLabel from '../../shared/ui/kit/SectionLabel.jsx'
import CategoryBadge from '../../shared/ui/CategoryBadge.jsx'
import { formatMoney } from '../../shared/lib/currency.js'
import { shortDate } from '../../shared/lib/dates.js'
import { useProfile } from '../../shared/lib/ProfileProvider.jsx'
import { SkeletonRegion, SkeletonRows } from '../../shared/ui/Skeleton.jsx'
import QueryError from '../../shared/ui/QueryError.jsx'
import { frequencyLabel, subscriptionGroups } from './recurringMath.js'
import { GroupTabs, GroupTotal } from './SubscriptionGroups.jsx'

// Home's "Subscriptions" card: the active recurring expenses by how often they
// charge (Weekly · Monthly · Quarterly · Yearly — only the groups the user
// has), each with its total per period, about how much a month, and the next
// few charges. Informational: it ignores the period picker and never feeds
// Home's totals, whichever way the yearly-subscription setting is set (the
// Yearly tab just says how those count). `rules` are the useRecurring() rows;
// `loading` while they're on their way; `error` (with `onRetry`) when they
// couldn't be read — never shown as "No subscriptions yet".
export default function SubscriptionsCard({ rules, loading, error, onRetry, baseCurrency }) {
  const { separateYearly } = useProfile()
  const groups = useMemo(
    () => subscriptionGroups(rules, baseCurrency, { upcomingOnly: true }), [rules, baseCurrency])

  return (
    <Panel data-tour="subscriptions" icon={Repeat} title="Subscriptions"
      action={<Button as={RouterLink} to="/recurring" size="xs" variant="ghost">Manage</Button>}>
      {error ? (
        <QueryError error={error} onRetry={onRetry} what="your subscriptions" />
      ) : loading ? (
        <SkeletonRegion><SkeletonRows count={3} /></SkeletonRegion>
      ) : groups.length === 0 ? (
        <Text color="text.muted" fontSize="sm">
          No subscriptions yet. Set an expense to repeat, or add bills and subscriptions in Recurring.
        </Text>
      ) : (
        <GroupTabs groups={groups} label="Subscriptions by frequency">
          {(g) => (
            <>
              <GroupTotal group={g} baseCurrency={baseCurrency} />
              {g.key === 'yearly' && (
                <Text fontSize="xs" color="text.muted" mt={1}>
                  {separateYearly
                    ? 'Kept out of your monthly spending (Settings › Monthly spending).'
                    : 'Each counts in your monthly spending a twelfth at a time.'}
                </Text>
              )}
              <SectionLabel mt={4} mb={1}>Next charges</SectionLabel>
              <Box as="ul" listStyleType="none">
                {g.next.map((r) => (
                  <ItemRow as="li" key={r.id} py={2.5}
                    media={<CategoryBadge category={r.categories} kind={r.kind} size={32} />}
                    title={r.description || r.categories?.name || 'Expense'}
                    meta={`${shortDate(r.next_run)} · ${frequencyLabel(r)}`}
                    amount={formatMoney(r.amount_minor, r.currency)} />
                ))}
              </Box>
            </>
          )}
        </GroupTabs>
      )}
    </Panel>
  )
}
