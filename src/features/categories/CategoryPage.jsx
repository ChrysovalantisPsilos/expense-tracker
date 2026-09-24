import { useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useParams, useSearchParams } from 'react-router-dom'
import {
  Box, Button, Divider, Flex, FormControl, FormHelperText, FormLabel, HStack, Select,
  Stack, Text, useToast,
} from '@chakra-ui/react'
import { Archive, ArchiveRestore, Pencil, ReceiptText, Target, X } from 'lucide-react'
import PageHeader, { PageAction } from '../../shared/ui/PageHeader.jsx'
import BackButton from '../../shared/ui/BackButton.jsx'
import CategoryBadge from '../../shared/ui/CategoryBadge.jsx'
import MoneyInput from '../../shared/ui/MoneyInput.jsx'
import QueryError from '../../shared/ui/QueryError.jsx'
import {
  SkeletonFigure, SkeletonProgressRow, SkeletonRegion, SkeletonRows,
} from '../../shared/ui/Skeleton.jsx'
import Paginator from '../../shared/ui/Paginator.jsx'
import { usePaged } from '../../shared/ui/usePaged.js'
import Panel from '../../shared/ui/kit/Panel.jsx'
import Figure from '../../shared/ui/kit/Figure.jsx'
import ProgressRow from '../../shared/ui/kit/ProgressRow.jsx'
import { useProfile } from '../../shared/lib/ProfileProvider.jsx'
import { formatMoney, fromMinor } from '../../shared/lib/currency.js'
import { monthRange } from '../../shared/lib/dates.js'
import { useAsyncSubmit } from '../../shared/lib/useAsyncSubmit.js'
import TransactionList from '../transactions/TransactionList.jsx'
import { listHeading } from '../transactions/listHeading.js'
import { useTransactions, oldestTransactionDate } from '../transactions/useData.js'
import { buildPeriods, isMonthPeriod, withPeriod } from '../transactions/periods.js'
import { NO_CATEGORY } from '../transactions/txnFilter.js'
import { useMonthBudgets, editBudget, deleteBudget } from '../budgets/budgets.js'
import { budgetChange, budgetPercent, budgetTone, carriedLabel } from '../budgets/budgetMath.js'
import { useAllCategories, updateCategory } from './categories.js'
import { categoryPatch, categoryPeriod, sameKindOthers } from './categoryMath.js'
import { parseCategoryRoute } from './categoryLinks.js'
import CategoryFields, { useCategoryDraft } from './CategoryFields.jsx'

// One category's page (/categories/:id?period=…) — where Home's category
// bars, Insights' legend, budget rows and the Categories list drill down to.
// The period's spend (and its budget, for a month), the entries paid in it,
// and an Edit panel for the budget and the category's name/icon/colour.
// `none` is the Uncategorized bucket (read-only: there's no row to edit).
//
// Totals follow the app's spread rule (a yearly subscription counts its
// monthly share, or nothing when kept separate); the list shows real payments.
export default function CategoryPage() {
  const { id } = useParams()
  const [params, setParams] = useSearchParams()
  const location = useLocation()
  const { baseCurrency = 'EUR', separateYearly } = useProfile()
  const { categoryId, period } = parseCategoryRoute(id, params)
  const uncategorised = categoryId === NO_CATEGORY

  const cats = useAllCategories()
  const category = uncategorised ? null : cats.rows.find((c) => c.id === categoryId) ?? null
  const kind = uncategorised ? 'expense' : category?.kind
  const missing = !categoryId || (!uncategorised && !cats.loading && !cats.error && !category)

  const [oldest, setOldest] = useState(null)
  useEffect(() => { oldestTransactionDate().then(setOldest) }, [])
  const periods = useMemo(() => withPeriod(buildPeriods(oldest), period), [oldest, period])

  // A real category is filtered server-side (and has one kind); the
  // uncategorised bucket is refined by categoryPeriod.
  const txns = useTransactions({
    kind: uncategorised ? 'expense' : undefined,
    categoryId: uncategorised ? undefined : categoryId ?? undefined,
    from: period.from ?? undefined, to: period.to ?? undefined, spread: true,
  })
  const { listed, total } = useMemo(() => categoryPeriod(txns.rows, {
    categoryId, from: period.from, to: period.to, baseCurrency, separateYearly,
  }), [txns.rows, categoryId, period.from, period.to, baseCurrency, separateYearly])
  const paged = usePaged(listed, 10, period.value)
  const listHead = listHeading({ kind: kind ?? 'expense', periodLabel: period.label, count: listed.length, loading: txns.loading })

  // Budgets are monthly and expense-only. Past months are shown as they
  // were; only this month's cap can be changed (edit_budget's carry-over
  // copies it forward, so editing an old month would rewrite later ones).
  const thisMonth = monthRange().from
  const month = isMonthPeriod(period)
  const hasBudgets = !uncategorised && kind === 'expense'
  const budgets = useMonthBudgets(month ? period.from : thisMonth)
  const budget = hasBudgets && month ? budgets.rows.find((b) => b.category_id === categoryId) ?? null : null
  const canEditBudget = hasBudgets && period.from === thisMonth

  const [editing, setEditing] = useState(() => !!location.state?.edit)
  const [focusBudget, setFocusBudget] = useState(false)
  const openEdit = (withBudget) => { setFocusBudget(withBudget); setEditing(true) }

  const name = uncategorised ? 'Uncategorized' : category?.name ?? ''
  const pickPeriod = (value) => setParams({ period: value }, { replace: true })

  if (missing) {
    return (
      <Stack spacing={5}>
        <PageHeader title="Category not found" leading={<BackButton />} />
        <Panel><Text color="text.muted">This category doesn’t exist or was deleted.</Text></Panel>
      </Stack>
    )
  }

  return (
    <Stack spacing={5}>
      <PageHeader title={name || '…'}
        eyebrow={category?.is_archived ? 'Archived category' : kind === 'income' ? 'Income category' : 'Category'}
        leading={(
          <HStack spacing={3} flexShrink={0}>
            <BackButton />
            <CategoryBadge category={category ?? ''} kind={kind} size={40} />
          </HStack>
        )}
        action={category && (
          <PageAction h="44px" minW="44px" aria-expanded={editing}
            icon={editing ? <X size={18} /> : <Pencil size={18} />}
            label={editing ? 'Close' : 'Edit'} variant={editing ? 'outline' : 'solid'}
            onClick={() => (editing ? setEditing(false) : openEdit(false))} />
        )} />

      {editing && category && (
        <EditPanel key={`${category.id}:${budget?.amount_minor ?? ''}`} category={category}
          all={cats.rows} budget={budget} canEditBudget={canEditBudget} periodStart={thisMonth}
          baseCurrency={baseCurrency} focusBudget={focusBudget}
          onClose={() => setEditing(false)}
          onSaved={() => Promise.all([cats.reload(), budgets.reload()])} />
      )}

      <Panel>
        <Flex gap={3} align="start" justify="space-between" wrap="wrap">
          {txns.loading ? (
            <SkeletonRegion flex="1"><SkeletonFigure size="xl" w="160px" /></SkeletonRegion>
          ) : (
            <Figure label={kind === 'income' ? 'Earned' : 'Spent'} size="xl"
              value={formatMoney(total, baseCurrency)} />
          )}
          <Select w={{ base: '150px', sm: '200px' }} size="md" borderRadius="lg" aria-label="Period"
            value={period.value} onChange={(e) => pickPeriod(e.target.value)}>
            {periods.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
          </Select>
        </Flex>
        {hasBudgets && (
          <Box mt={4}>
            <BudgetSummary budget={budget} spent={total} month={month} canEdit={canEditBudget}
              period={period} loading={budgets.loading || txns.loading} baseCurrency={baseCurrency}
              onSetBudget={() => openEdit(true)} />
          </Box>
        )}
      </Panel>

      <Panel icon={ReceiptText} title={listHead.title} subtitle={listHead.subtitle} divider>
        {txns.error ? <QueryError error={txns.error} onRetry={txns.reload} what="these entries" /> : txns.loading ? (
          <SkeletonRegion><SkeletonRows count={6} py={2.5} /></SkeletonRegion>
        ) : listed.length === 0 ? (
          <Text color="text.muted" fontSize="sm">Nothing here for this period.</Text>
        ) : (
          <>
            <TransactionList rows={paged.pageItems} kind={kind} baseCurrency={baseCurrency}
              mutate={txns.mutate} reload={txns.reload} />
            <Paginator page={paged.page} count={paged.count} onPage={paged.setPage} />
          </>
        )}
      </Panel>
    </Stack>
  )
}

// The period's budget: a progress bar against the cap, or a way to set one.
function BudgetSummary({ budget, spent, month, canEdit, period, loading, baseCurrency, onSetBudget }) {
  if (!month) {
    return <Text color="text.muted" fontSize="sm">Budgets are monthly — pick a month to see one.</Text>
  }
  if (loading) return <SkeletonRegion><SkeletonProgressRow /></SkeletonRegion>
  if (budget) {
    const carried = budget.period_start < period.from ? carriedLabel(budget.period_start, period.from) : null
    return (
      <>
        <ProgressRow icon={Target} title="Budget"
          meta={`${formatMoney(spent, baseCurrency)} of ${formatMoney(budget.amount_minor, baseCurrency)}`}
          percent={budgetPercent(spent, budget.amount_minor)}
          tone={budgetTone(spent, budget.amount_minor)} over={spent > budget.amount_minor} />
        {carried && <Text color="text.muted" fontSize="xs" mt={2}>{carried}</Text>}
      </>
    )
  }
  return canEdit ? (
    <Button variant="outline" h="44px" leftIcon={<Target size={16} />} onClick={onSetBudget}>
      Set a budget
    </Button>
  ) : (
    <Text color="text.muted" fontSize="sm">No budget in {period.label}.</Text>
  )
}

// The in-page Edit panel: this month's cap, then the category's name, icon
// and colour, and archiving. One Save applies whatever changed.
function EditPanel({ category, all, budget, canEditBudget, periodStart, baseCurrency, focusBudget, onClose, onSaved }) {
  const toast = useToast()
  const draft = useCategoryDraft(category, sameKindOthers(all, category))
  const current = budget?.amount_minor ?? null
  const [amount, setAmount] = useState(current == null ? '' : String(fromMinor(current, baseCurrency)))
  const amountRef = useRef(null)
  const { busy, run } = useAsyncSubmit()

  useEffect(() => { if (focusBudget) amountRef.current?.focus() }, [focusBudget])

  async function save(e) {
    e.preventDefault()
    draft.setTouched(true)
    if (draft.nameError) return
    await run(async () => {
      const patch = categoryPatch(category, draft.values)
      if (patch) await updateCategory(category.id, patch)
      const change = canEditBudget ? budgetChange(current, amount, baseCurrency) : null
      if (change?.set != null) {
        await editBudget({ categoryId: category.id, amountMinor: change.set, currency: baseCurrency, periodStart })
      } else if (change?.remove) {
        await deleteBudget({ categoryId: category.id, periodStart })
      }
      toast({ title: patch || change ? 'Saved' : 'Nothing to save', status: patch || change ? 'success' : 'info' })
      await onSaved()
      onClose()
    })
  }

  async function toggleArchive() {
    await run(async () => {
      await updateCategory(category.id, { is_archived: !category.is_archived })
      toast({
        title: category.is_archived ? `${category.name} is back in your pickers` : `${category.name} archived`,
        status: 'success',
      })
      await onSaved()
    })
  }

  return (
    <Panel icon={Pencil} title={`Edit ${category.name}`}>
      <form onSubmit={save}>
        <Stack spacing={5}>
          {category.kind === 'expense' && (
            canEditBudget ? (
              <FormControl>
                <FormLabel>Monthly budget</FormLabel>
                <MoneyInput ref={amountRef} value={amount} onChange={setAmount} placeholder="No budget" />
                <FormHelperText>
                  {current == null ? 'A monthly cap for this category, from this month on.'
                    : 'Changes this month’s cap and the months after it. Clear it to remove the budget.'}
                </FormHelperText>
              </FormControl>
            ) : (
              <Text color="text.muted" fontSize="sm">
                Budgets can be changed from this month’s view.
              </Text>
            )
          )}
          <Divider />
          <CategoryFields draft={draft} kind={category.kind} />
          <Flex gap={2} wrap="wrap" justify="space-between">
            <Button variant="ghost" h="44px" isDisabled={busy} onClick={toggleArchive}
              leftIcon={category.is_archived ? <ArchiveRestore size={16} /> : <Archive size={16} />}>
              {category.is_archived ? 'Unarchive' : 'Archive'}
            </Button>
            <HStack spacing={2}>
              <Button variant="ghost" h="44px" onClick={onClose}>Cancel</Button>
              <Button type="submit" h="44px" isLoading={busy}>Save</Button>
            </HStack>
          </Flex>
        </Stack>
      </form>
    </Panel>
  )
}
