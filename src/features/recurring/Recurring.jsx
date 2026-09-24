import { useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  Stack, Text, Button, List, ListItem, Switch, Tag, Flex, Box, Modal, ModalOverlay,
  ModalContent, ModalHeader, ModalBody, ModalFooter, Tabs, TabList, Tab, TabPanels, TabPanel, useToast,
  SimpleGrid,
} from '@chakra-ui/react'
import { Plus, Pencil, Trash2, Bell, Pause, Play } from 'lucide-react'
import CategoryBadge from '../../shared/ui/CategoryBadge.jsx'
import Panel from '../../shared/ui/kit/Panel.jsx'
import Figure from '../../shared/ui/kit/Figure.jsx'
import ItemRow from '../../shared/ui/kit/ItemRow.jsx'
import EmptyState from '../../shared/ui/EmptyState.jsx'
import PageHeader, { PageAction } from '../../shared/ui/PageHeader.jsx'
import { useProfile } from '../../shared/lib/ProfileProvider.jsx'
import { formatMoney } from '../../shared/lib/currency.js'
import { shortDate } from '../../shared/lib/dates.js'
import { useRecurring, setRecurringActive, deleteRecurring } from './recurring.js'
import {
  frequencyLabel, incomePerMonth, monthlyBudgetShare, subscriptionGroups,
} from './recurringMath.js'
import { GroupTabs, GroupTotal } from './SubscriptionGroups.jsx'
import QueryError from '../../shared/ui/QueryError.jsx'
import { userMessage } from '../../shared/lib/errors.js'
import { SkeletonBlock, SkeletonRegion, SkeletonRows } from '../../shared/ui/Skeleton.jsx'

const TABS = ['expense', 'income']
const INCOME_INTRO = 'Money that comes in on a schedule, like your salary — it’s added to your income on each date.'

// The Recurring page (/recurring): "Subscriptions" (money going out, by
// frequency — the same groups as Home's card, each with its total) and
// "Income" (money coming in on a schedule). Pause and delete here; adding and
// editing open a rule's own page (RecurringPage). The open tab is kept in the
// address (?tab=income), so coming back from a rule's page lands on it.
export default function Recurring() {
  const { baseCurrency = 'EUR' } = useProfile()
  const { rules, loading, error, reload } = useRecurring()
  const toast = useToast()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const tab = params.get('tab') === 'income' ? 1 : 0
  const setTab = (i) => setParams(TABS[i] === 'income' ? { tab: 'income' } : {}, { replace: true })
  const [removing, setRemoving] = useState(null)

  const groups = useMemo(() => subscriptionGroups(rules, baseCurrency), [rules, baseCurrency])
  const income = useMemo(() => rules.filter((r) => r.kind === 'income'), [rules])
  const incomeMonthly = useMemo(() => incomePerMonth(rules), [rules])

  const openNew = () => navigate(`/recurring/new?kind=${TABS[tab]}`)
  const openEdit = (r) => navigate(`/recurring/${r.id}`, { state: { rule: r } })

  async function toggle(r) {
    try { await setRecurringActive(r.id, !r.is_active); reload() }
    catch (e) {
      console.error('[recurring] pause/resume failed:', e)
      toast({ title: userMessage(e, 'Couldn’t update the recurring entry. Please try again.'), status: 'error' })
    }
  }
  async function confirmRemove() {
    try {
      await deleteRecurring(removing.id)
      toast({ title: 'Recurring entry removed', status: 'success' })
      setRemoving(null); reload()
    } catch (e) {
      console.error('[recurring] remove failed:', e)
      toast({ title: userMessage(e, 'Couldn’t remove the recurring entry. Please try again.'), status: 'error' })
    }
  }

  const list = (rows) => (
    <List spacing={0}>
      {rows.map((r) => (
        <ListItem key={r.id}>
          <RuleRow rule={r} onToggle={() => toggle(r)} onEdit={() => openEdit(r)} onRemove={() => setRemoving(r)} />
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
      <PageHeader title="Recurring"
        action={<PageAction icon={<Plus size={16} />} label="Add" onClick={openNew} />} />

      <Panel>
        {error ? <QueryError error={error} onRetry={reload} what="recurring payments" /> : loading ? (
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
              <Tab fontWeight="600">Subscriptions</Tab>
              <Tab fontWeight="600">Income</Tab>
            </TabList>
            <TabPanels>
              <TabPanel px={0} pb={0}>
                {groups.length === 0 ? empty('No subscriptions or bills yet',
                  'Add the bills and subscriptions that repeat, like rent or streaming, and Budgeer logs each one on its date.',
                  'Add a subscription or bill') : (
                  <GroupTabs groups={groups} label="Subscriptions by frequency">
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
                {income.length === 0 ? empty('No recurring income yet',
                  INCOME_INTRO,
                  'Add recurring income') : (
                  <>
                    <Text fontSize="sm" color="text.muted" mb={4}>{INCOME_INTRO}</Text>
                    <Figure label="Recurring income" size="lg" tone="positive" mb={3}
                      value={`≈ ${formatMoney(incomeMonthly, baseCurrency)}/month`} />
                    {list(income)}
                  </>
                )}
              </TabPanel>
            </TabPanels>
          </Tabs>
        )}
      </Panel>

      <Modal isOpen={!!removing} onClose={() => setRemoving(null)} isCentered>
        <ModalOverlay />
        <ModalContent mx={4}>
          <ModalHeader>Remove recurring entry?</ModalHeader>
          <ModalBody>
            <Text color="text.muted">
              “{removing?.description || removing?.categories?.name || 'This entry'}” will stop repeating.
              Transactions it already created stay.
            </Text>
          </ModalBody>
          <ModalFooter gap={2}>
            <Button variant="ghost" onClick={() => setRemoving(null)}>Cancel</Button>
            <Button colorScheme="red" onClick={confirmRemove}>Remove</Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </Stack>
  )
}

// One rule: what it charges, how often and when next, with pause/edit/delete.
function RuleRow({ rule: r, onToggle, onEdit, onRemove }) {
  return (
    <ItemRow py={2.5} dimmed={!r.is_active}
      media={<CategoryBadge category={r.categories} kind={r.kind} size={32} />}
      title={r.description || r.categories?.name || (r.kind === 'income' ? 'Income' : 'Expense')}
      meta={<RuleMeta rule={r} />}
      amount={formatMoney(r.amount_minor, r.currency)}
      amountTone={r.kind === 'income' ? 'positive' : 'default'}
      trailing={
        <Box display={{ base: 'none', sm: 'block' }} flexShrink={0}>
          <Switch isChecked={r.is_active} onChange={onToggle} aria-label={r.is_active ? 'Pause' : 'Resume'} />
        </Box>
      }
      actionSlots={2} actions={[
        { label: r.is_active ? 'Pause' : 'Resume', icon: r.is_active ? Pause : Play, menuOnly: true, onClick: onToggle },
        { label: 'Edit', icon: Pencil, onClick: onEdit },
        { label: 'Delete', icon: Trash2, danger: true, onClick: onRemove },
      ]} />
  )
}

// The muted line under a rule's title: frequency · next date, what a yearly
// expense counts per month in budgets (unless the user keeps yearly
// subscriptions out of monthly spending), plus reminder/paused tags.
function RuleMeta({ rule: r }) {
  const { separateYearly } = useProfile()
  const share = separateYearly ? null : monthlyBudgetShare(r)
  return (
    <Flex wrap="wrap" align="center" columnGap={1.5} rowGap={1} mt={0.5} fontSize="xs" color="text.muted">
      <Text whiteSpace="nowrap">{frequencyLabel(r)}</Text>
      <Text whiteSpace="nowrap">· next {shortDate(r.next_run)}</Text>
      {share && (
        <Text whiteSpace="nowrap">
          · {share.exact ? '' : '≈ '}{formatMoney(share.perMonth, r.currency)}/mo in budgets
        </Text>
      )}
      {r.remind_days_before != null && (
        <Tag size="sm" colorScheme="brand" borderRadius="full" px={2}>
          <Bell size={10} style={{ marginRight: 3 }} /> {r.remind_days_before}d
        </Tag>
      )}
      {!r.is_active && <Tag size="sm" borderRadius="full">Paused</Tag>}
    </Flex>
  )
}
