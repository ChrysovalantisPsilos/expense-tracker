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
import { formatMoney, minorToInput } from '../../shared/lib/currency.js'
import { monthRange } from '../../shared/lib/dates.js'
import { useAsyncSubmit } from '../../shared/lib/useAsyncSubmit.js'
import { useUnsavedForm } from '../../shared/lib/useUnsavedForm.js'
import TransactionList from '../transactions/TransactionList.jsx'
import { listHeading } from '../transactions/listHeading.js'
import { useTransactions, useOldestTransactionDate, useNewestCountedDate } from '../../shared/lib/transactions.js'
import { buildPeriods, isMonthPeriod, withPeriod } from '../../shared/lib/periods.js'
import { NO_CATEGORY, categoryDisplayName } from '../../shared/lib/categoryName.js'
import { useMonthBudgets, editBudget, deleteBudget } from '../budgets/budgets.js'
import { budgetChange } from '../budgets/budgetMath.js'
import { useAllCategories, updateCategory } from '../../shared/lib/categories.js'
import { categoryBudget, categoryPageHead, categoryPatch, categoryPeriod, sameKindOthers } from './categoryMath.js'
import { parseCategoryRoute } from '../../shared/lib/categoryLinks.js'
import CategoryFields, { useCategoryDraft } from './CategoryFields.jsx'
import { useT } from '../../shared/lib/i18n/I18nProvider.jsx'

// One category's page (/categories/:id?period=…) — where Home's category
// bars, Insights' legend, budget rows and the Categories list drill down to.
// The period's spend (and its budget, for a month), the entries paid in it,
// and an Edit panel for the budget and the category's name/icon/colour.
// `none` is the Uncategorized bucket (read-only: there's no row to edit).
//
// Totals follow the app's spread rule (a yearly subscription counts its
// monthly share, or nothing when kept separate); the list shows real payments.
// A savings category's total is what was saved (0084), never "Earned", and
// its list is headed "Savings", never "Income".
export default function CategoryPage() {
  const t = useT('categories')
  const { id } = useParams()
  const [params, setParams] = useSearchParams()
  const location = useLocation()
  const { baseCurrency = 'EUR', separateYearly, salaryShift } = useProfile()
  const { categoryId, period } = parseCategoryRoute(id, params)
  const uncategorised = categoryId === NO_CATEGORY

  const cats = useAllCategories()
  const category = uncategorised ? null : cats.rows.find((c) => c.id === categoryId) ?? null
  const head = categoryPageHead(category, uncategorised)
  const { kind } = head
  const missing = !categoryId || (!uncategorised && !cats.loading && !cats.error && !category)

  const [oldest, recheckOldest] = useOldestTransactionDate()
  useEffect(recheckOldest, [recheckOldest])
  const newest = useNewestCountedDate()
  const periods = useMemo(
    () => withPeriod(buildPeriods(oldest, new Date(), { newestISO: newest }), period), [oldest, newest, period])

  // A real category is filtered server-side (and has one kind); the
  // uncategorised bucket is refined by categoryPeriod.
  const txns = useTransactions({
    kind: uncategorised ? 'expense' : undefined,
    categoryId: uncategorised ? undefined : categoryId ?? undefined,
    from: period.from ?? undefined, to: period.to ?? undefined, spread: true,
  })
  const { listed, total } = useMemo(() => categoryPeriod(txns.rows, {
    categoryId, from: period.from, to: period.to, baseCurrency, separateYearly, salaryShift,
  }), [txns.rows, categoryId, period.from, period.to, baseCurrency, separateYearly, salaryShift])
  const paged = usePaged(listed, 10, period.value)
  const listHead = listHeading({
    kind: kind ?? 'expense', savings: !!category?.is_savings,
    periodLabel: period.label, count: listed.length, loading: txns.loading,
  })

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

  const { name } = head
  const pickPeriod = (value) => setParams({ period: value }, { replace: true })

  if (missing) {
    return (
      <Stack spacing={5}>
        <PageHeader title={t('page.notFound')} leading={<BackButton />} />
        <Panel><Text color="text.muted">{t('page.notFoundText')}</Text></Panel>
      </Stack>
    )
  }

  return (
    <Stack spacing={5}>
      <PageHeader title={name || '…'} eyebrow={head.eyebrow}
        leading={(
          <HStack spacing={3} flexShrink={0}>
            <BackButton />
            <CategoryBadge category={category ?? ''} kind={kind} size={40} />
          </HStack>
        )}
        action={category && (
          <PageAction h="44px" minW="44px" aria-expanded={editing}
            icon={editing ? <X size={18} /> : <Pencil size={18} />}
            label={t(editing ? 'common:actions.close' : 'common:actions.edit')} variant={editing ? 'outline' : 'solid'}
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
            <Figure label={head.totalLabel} size="xl" value={formatMoney(total, baseCurrency)} />
          )}
          <Select w={{ base: '180px', sm: '200px' }} size="md" borderRadius="lg" aria-label={t('page.period')}
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
        {txns.error ? <QueryError error={txns.error} onRetry={txns.reload} what={t('page.what')} /> : txns.loading ? (
          <SkeletonRegion><SkeletonRows count={6} py={2.5} /></SkeletonRegion>
        ) : listed.length === 0 ? (
          <Text color="text.muted" fontSize="sm">{t('page.empty')}</Text>
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

// The period's budget (categoryBudget): a progress bar against the cap, or a
// way to set one.
function BudgetSummary({ budget, spent, month, canEdit, period, loading, baseCurrency, onSetBudget }) {
  const line = categoryBudget({ budget, spent, month, canEdit, period, baseCurrency })
  if (line.state === 'monthly') return <Text color="text.muted" fontSize="sm">{line.text}</Text>
  if (loading) return <SkeletonRegion><SkeletonProgressRow /></SkeletonRegion>
  if (line.state === 'bar') {
    return (
      <>
        <ProgressRow icon={Target} title={line.title} meta={line.meta} percent={line.percent}
          tone={line.tone ?? undefined} over={line.over} />
        {line.carried && <Text color="text.muted" fontSize="xs" mt={2}>{line.carried}</Text>}
      </>
    )
  }
  return line.state === 'set' ? (
    <Button variant="outline" h="44px" leftIcon={<Target size={16} />} onClick={onSetBudget}>
      {line.text}
    </Button>
  ) : (
    <Text color="text.muted" fontSize="sm">{line.text}</Text>
  )
}

// The in-page Edit panel: this month's cap, then the category's name, icon
// and colour, and archiving. One Save applies whatever changed.
function EditPanel({ category, all, budget, canEditBudget, periodStart, baseCurrency, focusBudget, onClose, onSaved }) {
  const t = useT('categories')
  const toast = useToast()
  const draft = useCategoryDraft(category, sameKindOthers(all, category))
  const current = budget?.amount_minor ?? null
  const [amount, setAmount] = useState(current == null ? '' : minorToInput(current, baseCurrency))
  const amountRef = useRef(null)
  const { busy, run } = useAsyncSubmit()
  const unsaved = useUnsavedForm()

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
      toast({ title: t(patch || change ? 'toasts.saved' : 'toasts.nothingToSave'), status: patch || change ? 'success' : 'info' })
      await onSaved()
      onClose()
    })
  }

  async function toggleArchive() {
    await run(async () => {
      await updateCategory(category.id, { is_archived: !category.is_archived })
      toast({
        title: t(category.is_archived ? 'toasts.unarchived' : 'toasts.archived', { name: categoryDisplayName(category) }),
        status: 'success',
      })
      await onSaved()
    })
  }

  return (
    <Panel icon={Pencil} title={t('page.editTitle', { name: categoryDisplayName(category) })}>
      <form onSubmit={save} {...unsaved}>
        <Stack spacing={5}>
          {category.kind === 'expense' && (
            canEditBudget ? (
              <FormControl>
                <FormLabel>{t('page.monthlyBudget')}</FormLabel>
                <MoneyInput ref={amountRef} currency={baseCurrency} value={amount} onChange={setAmount}
                  placeholder={t('page.noBudgetPlaceholder')} />
                <FormHelperText>{t(current == null ? 'page.budgetNew' : 'page.budgetChange')}</FormHelperText>
              </FormControl>
            ) : (
              <Text color="text.muted" fontSize="sm">{t('page.budgetPast')}</Text>
            )
          )}
          <Divider />
          <CategoryFields draft={draft} kind={category.kind} />
          <Flex gap={2} wrap="wrap" justify="space-between">
            <Button variant="ghost" h="44px" isDisabled={busy} onClick={toggleArchive}
              leftIcon={category.is_archived ? <ArchiveRestore size={16} /> : <Archive size={16} />}>
              {t(category.is_archived ? 'actions.unarchive' : 'actions.archive')}
            </Button>
            <HStack spacing={2}>
              <Button variant="ghost" h="44px" onClick={onClose}>{t('common:actions.cancel')}</Button>
              <Button type="submit" h="44px" isLoading={busy}>{t('common:actions.save')}</Button>
            </HStack>
          </Flex>
        </Stack>
      </form>
    </Panel>
  )
}
