import { useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { addEntryLink } from '../../shared/lib/addLinks.js'
import {
  Stack, Text, Button, List, ListItem, Switch, Tag, Box, Tabs, TabList, Tab, TabPanels, TabPanel,
  useToast, SimpleGrid,
} from '@chakra-ui/react'
import { Plus, Pencil, Trash2, Bell, Pause, Play } from 'lucide-react'
import CategoryBadge from '../../shared/ui/CategoryBadge.jsx'
import Panel from '../../shared/ui/kit/Panel.jsx'
import Figure from '../../shared/ui/kit/Figure.jsx'
import ItemRow from '../../shared/ui/kit/ItemRow.jsx'
import MetaLine from '../../shared/ui/MetaLine.jsx'
import EmptyState from '../../shared/ui/EmptyState.jsx'
import PageHeader from '../../shared/ui/PageHeader.jsx'
import { useProfile } from '../../shared/lib/ProfileProvider.jsx'
import { useRecurring, useRuleRates, setRecurringActive, deleteRecurring } from './recurring.js'
import { useSavingsIds } from '../../shared/lib/categories.js'
import {
  incomePerMonth, incomeRules, incomeTotalParts, ruleRowParts, subscriptionGroups,
} from './recurringMath.js'
import { GroupTabs, GroupTotal, RatesNote } from './SubscriptionGroups.jsx'
import QueryError from '../../shared/ui/QueryError.jsx'
import { userMessage } from '../../shared/lib/errors.js'
import { SkeletonBlock, SkeletonRegion, SkeletonRows } from '../../shared/ui/Skeleton.jsx'
import { useT } from '../../shared/lib/i18n/I18nProvider.jsx'
import { entryName } from '../../shared/lib/categoryName.js'
import ConfirmDialog from '../../shared/ui/ConfirmDialog.jsx'
import MoreBackButton from '../../shared/ui/MoreBackButton.jsx'

const TABS = ['expense', 'income']

// The Recurring page (/recurring): "Subscriptions" (money going out, by
// frequency — the same groups as Home's card, each with its total) and
// "Income" (money coming in on a schedule). Pause and delete here; editing
// opens a rule's own page (RecurringPage). There's no Add here: a recurring
// entry is added from Add with Repeat on, where an empty tab's button leads.
// The open tab is kept in the address (?tab=income), so coming back from a
// rule's page lands on it.
export default function Recurring() {
  const t = useT('recurring')
  const { baseCurrency = 'EUR', separateYearly } = useProfile()
  const { rules, loading: rulesLoading, error, reload } = useRecurring()
  // Totals count foreign rules at today's ECB rate; rows keep their currency.
  const { rates, loading: ratesLoading } = useRuleRates(rules, baseCurrency)
  const loading = rulesLoading || ratesLoading
  const toast = useToast()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const tab = params.get('tab') === 'income' ? 1 : 0
  const setTab = (i) => setParams(TABS[i] === 'income' ? { tab: 'income' } : {}, { replace: true })
  const [removing, setRemoving] = useState(null)

  const groups = useMemo(() => subscriptionGroups(rules, baseCurrency, { rates }), [rules, baseCurrency, rates])
  const income = useMemo(() => incomeRules(rules), [rules])
  // Recurring savings are listed with the income rules but not summed as income.
  const { savingsIds } = useSavingsIds()
  const incomeMonthly = useMemo(
    () => incomePerMonth(rules, savingsIds, baseCurrency, rates), [rules, savingsIds, baseCurrency, rates])

  const openNew = () => navigate(addEntryLink({ kind: TABS[tab], repeat: true }))
  const openEdit = (r) => navigate(`/recurring/${r.id}`, { state: { rule: r } })

  async function toggle(r) {
    try { await setRecurringActive(r.id, !r.is_active); reload() }
    catch (e) {
      console.error('[recurring] pause/resume failed:', e)
      toast({ title: userMessage(e, t('list.updateFailed')), status: 'error' })
    }
  }
  async function confirmRemove() {
    try {
      await deleteRecurring(removing.id)
      toast({ title: t('list.removed'), status: 'success' })
      setRemoving(null); reload()
    } catch (e) {
      console.error('[recurring] remove failed:', e)
      toast({ title: userMessage(e, t('list.removeFailed')), status: 'error' })
    }
  }

  const list = (rows) => (
    <List spacing={0}>
      {rows.map((r) => (
        <ListItem key={r.id}>
          <RuleRow rule={r} parts={ruleRowParts(r, { baseCurrency, rates, separateYearly })} onToggle={() => toggle(r)} onEdit={() => openEdit(r)} onRemove={() => setRemoving(r)} />
        </ListItem>
      ))}
    </List>
  )
  const empty = (title, text, add) => (
    <EmptyState title={title} text={text}
      actions={<Button leftIcon={<Plus size={18} />} onClick={openNew}>{add}</Button>} />
  )

  return (
    <Stack spacing={5}>
      <PageHeader leading={<MoreBackButton />} title={t('list.title')} />

      <Panel>
        {error ? <QueryError error={error} onRetry={reload} what={t('list.what')} /> : loading ? (
          <SkeletonRegion>
            <SimpleGrid columns={2} spacing={6} px={6} pb={4} mb={2} borderBottomWidth="2px" borderColor="border.default">
              <SkeletonBlock h="14px" />
              <SkeletonBlock h="14px" />
            </SimpleGrid>
            <SkeletonRows count={5} />
          </SkeletonRegion>
        ) : (
          <Tabs colorScheme="brand" index={tab} onChange={setTab} isFitted>
            <TabList>
              <Tab fontWeight="600">{t('list.tabs.subscriptions')}</Tab>
              <Tab fontWeight="600">{t('list.tabs.income')}</Tab>
            </TabList>
            <TabPanels>
              <TabPanel px={0} pb={0}>
                {groups.length === 0 ? empty(t('list.emptySubscriptions.title'),
                  t('list.emptySubscriptions.text'), t('list.emptySubscriptions.add')) : (
                  <GroupTabs groups={groups} label={t('list.byFrequency')}>
                    {(g) => (
                      <>
                        <GroupTotal group={g} baseCurrency={baseCurrency} mb={3} />
                        {list(g.rules)}
                      </>
                    )}
                  </GroupTabs>
                )}
              </TabPanel>
              <TabPanel px={0} pb={0}>
                {income.length === 0 ? empty(t('list.emptyIncome.title'),
                  t('list.incomeIntro'), t('list.emptyIncome.add')) : (
                  <>
                    <Text fontSize="sm" color="text.muted" mb={4}>{t('list.incomeIntro')}</Text>
                    <Box mb={3}>
                      <Figure label={t('list.recurringIncome')} size="lg" tone="positive"
                        value={incomeTotalParts(incomeMonthly, baseCurrency).value} />
                      <RatesNote converted={incomeMonthly.converted} missing={incomeMonthly.missing} mt={1} />
                    </Box>
                    {list(income)}
                  </>
                )}
              </TabPanel>
            </TabPanels>
          </Tabs>
        )}
      </Panel>

      <ConfirmDialog isOpen={!!removing} onClose={() => setRemoving(null)} onConfirm={confirmRemove} danger
        title={t('list.remove.title')} confirmLabel={t('list.remove.confirm')}
        body={t('list.remove.body', { name: entryName(removing, t('list.remove.thisEntry')) })} />
    </Stack>
  )
}

// One rule: what it charges, how often and when next, with pause/edit/delete.
// `parts` is ruleRowParts (the hint: a foreign rule's charge in the base
// currency at today's rate).
function RuleRow({ rule: r, parts: p, onToggle, onEdit, onRemove }) {
  const t = useT('recurring')
  return (
    <ItemRow py={2.5} dimmed={!r.is_active} onClick={onEdit}
      media={<CategoryBadge category={r.categories} kind={r.kind} size={32} />}
      title={p.title}
      meta={<RuleMeta parts={p} />}
      amount={p.amount} amountMeta={p.hint ?? undefined}
      amountTone={p.tone}
      trailing={
        <Box display={{ base: 'none', sm: 'block' }} flexShrink={0}>
          <Switch isChecked={r.is_active} onChange={onToggle} aria-label={t(r.is_active ? 'row.pause' : 'row.resume')} />
        </Box>
      }
      actionSlots={2} actions={[
        { label: t(r.is_active ? 'row.pause' : 'row.resume'), icon: r.is_active ? Pause : Play, menuOnly: true, onClick: onToggle },
        { label: t('common:actions.edit'), icon: Pencil, onClick: onEdit },
        { label: t('common:actions.delete'), icon: Trash2, danger: true, onClick: onRemove },
      ]} />
  )
}

// The muted line under a rule's title (ruleRowParts): frequency · next date,
// what a yearly expense counts per month in budgets (unless the user keeps
// yearly subscriptions out of monthly spending), plus reminder/paused tags.
function RuleMeta({ parts: p }) {
  return (
    <MetaLine>
      {p.meta.map((part) => <Text key={part} whiteSpace="nowrap">{part}</Text>)}
      {p.remind && (
        <MetaLine.Bare>
          <Tag size="sm" colorScheme="brand" borderRadius="full" px={2}>
            <Bell size={10} style={{ marginRight: 3 }} /> {p.remind}
          </Tag>
        </MetaLine.Bare>
      )}
      {p.paused && <MetaLine.Bare><Tag size="sm" borderRadius="full">{p.paused}</Tag></MetaLine.Bare>}
    </MetaLine>
  )
}
