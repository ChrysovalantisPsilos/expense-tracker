import { useMemo, useState } from 'react'
import { Link as RouterLink } from 'react-router-dom'
import { Box, Button, Stack, useToast } from '@chakra-ui/react'
import { Plus } from 'lucide-react'
import Panel from '../../shared/ui/kit/Panel.jsx'
import SectionLabel from '../../shared/ui/kit/SectionLabel.jsx'
import EmptyState from '../../shared/ui/EmptyState.jsx'
import PageHeader from '../../shared/ui/PageHeader.jsx'
import QueryError from '../../shared/ui/QueryError.jsx'
import { SkeletonRegion, SkeletonRows } from '../../shared/ui/Skeleton.jsx'
import { formatMoney } from '../../shared/lib/currency.js'
import { userMessage } from '../../shared/lib/errors.js'
import { rulesInBase } from '../../shared/lib/ruleFx.js'
import { useT } from '../../shared/lib/i18n/I18nProvider.jsx'
import { applyPlan, undoLastApply, usePlanData } from './plan.js'
import {
  acknowledge, applySelection, buildItems, dismissIdea, emptyPlan, headline, inView, monthOf, overBudgetMonths,
  planGroups, planIdeas, planRules, planSummary, priceRises, reconcile, removeAdd, resetChange, resetSalary, rowTag,
  setChange, setSalary, signalsFor, startOver, tryIdea, undoState, upsertAdd,
} from './planMath.js'
import {
  ChangesPanel, IdeasStrip, ImpactHeader, PlanHint, PlanRow, SavedNote, WhatIfRow, itemName,
} from './PlanParts.jsx'
import { AddSheet, ApplySheet, EditSheet, PickSheet } from './PlanSheets.jsx'
import { AppliedBanner, AppliedNote, ClearDialog, RealityBanner, UndoDialog } from './PlanBanners.jsx'

// Plan mode (/plan): a sandbox over the user's recurring payments and income.
// Every edit shows at once how the monthly net moves, before → after; the plan
// is saved to the account by itself, and nothing real changes until the user
// applies it (then Undo for 24 hours). Savings transfers are left out. A
// salary logged as entries shows as a derived Salary row (plan-only edits);
// with no recurring income at all the card shows the payments instead.
export default function Plan() {
  const t = useT('plan')
  const toast = useToast()
  const d = usePlanData()
  const [view, setView] = useState('month')
  const [sheet, setSheet] = useState(null) // { type: 'edit' | 'add' | 'pick' | 'apply' | 'undo', id? }
  const [busy, setBusy] = useState(false)
  const plan = d.plan ?? emptyPlan()
  const currency = d.baseCurrency

  const categoriesById = useMemo(() => new Map(d.categories.map((c) => [c.id, c])), [d.categories])
  const items = useMemo(() => buildItems({
    rules: d.rules, plan, savingsIds: d.savingsIds, baseCurrency: currency, rates: d.rates, categoriesById,
    salary: d.salary,
  }), [d.rules, plan, d.savingsIds, currency, d.rates, categoriesById, d.salary])
  const sum = useMemo(() => planSummary(items), [items])
  const reality = useMemo(() => reconcile(plan, d.rules, d.savingsIds, d.salary), [plan, d.rules, d.savingsIds, d.salary])
  const signals = useMemo(() => {
    const live = planRules(d.rules, d.savingsIds)
    return signalsFor(items, {
      rises: priceRises(d.charges, live),
      overCats: overBudgetMonths({
        sets: d.budgetSets, rows: d.charges, months: d.budgetMonths, baseCurrency: currency, separateYearly: d.separateYearly,
      }),
    })
  }, [items, d.rules, d.savingsIds, d.charges, d.budgetSets, d.budgetMonths, currency, d.separateYearly])
  const ideas = useMemo(() => planIdeas(items, signals, plan.dismissed), [items, signals, plan.dismissed])
  // Foreign rules with no rate right now, and whether any were converted.
  const rates = useMemo(() => {
    const fx = rulesInBase(planRules(d.rules, d.savingsIds), currency, d.rates)
    return { converted: fx.converted, missing: fx.missing }
  }, [d.rules, d.savingsIds, currency, d.rates])
  const applied = undoState(d.undo)

  const header = <PageHeader title={t('title')} meta={<SavedNote status={d.status} onRetry={d.retry} />} />
  if (d.error) {
    return <Stack spacing={5}>{header}<Panel><QueryError error={d.error} onRetry={d.reload} what={t('what')} /></Panel></Stack>
  }
  if (d.loading || !d.plan) {
    return <Stack spacing={5}>{header}<Panel><SkeletonRegion><SkeletonRows count={6} /></SkeletonRegion></Panel></Stack>
  }
  if (!items.length) {
    return (
      <Stack spacing={5}>
        <PageHeader title={t('title')} description={t('empty.lead')} />
        <Panel>
          <EmptyState title={t('empty.title')} text={t('empty.text')}
            actions={<>
              <Button as={RouterLink} to="/recurring/new" leftIcon={<Plus size={18} />}>{t('empty.add')}</Button>
              <Button as={RouterLink} to="/recurring" variant="outline">{t('empty.go')}</Button>
            </>} />
        </Panel>
      </Stack>
    )
  }

  const byId = new Map(items.map((i) => [i.id, i]))
  const ruleOf = (id) => d.rules.find((r) => r.id === id)
  const edit = (item, patch) => d.setPlan((p) => (item.salary
    ? setSalary(p, patch, item.before.amount_minor)
    : setChange(p, ruleOf(item.id), patch, itemName(item))))
  const toggle = (item) => {
    if (item.added) d.setPlan((p) => removeAdd(p, item.id))
    else edit(item, { cancel: !item.cancelled })
  }
  const open = (item) => setSheet({ type: item.added ? 'add' : 'edit', id: item.id })
  const onTry = (idea) => {
    if (idea.kind === 'overlap') setSheet({ type: 'pick', id: idea.id })
    else d.setPlan((p) => tryIdea(p, idea, [ruleOf(idea.ruleIds[0])]))
  }
  const close = () => setSheet(null)

  async function apply(pickedIds) {
    const sel = applySelection(items, plan, pickedIds)
    setBusy(true)
    try {
      await d.settle()
      await applyPlan(sel.apply, sel.remaining)
      d.replace(sel.remaining)
      await Promise.all([d.reloadRules(), d.reloadUndo()])
      toast({ title: t('apply.done', { count: sel.count }), status: 'success' })
      close()
    } catch (e) {
      console.error('[plan] apply failed:', e)
      toast({ title: userMessage(e, t('apply.failed')), status: 'error' })
      d.retry() // the save settle() held back, if any
    } finally {
      setBusy(false)
    }
  }
  async function undo() {
    setBusy(true)
    try {
      const n = await undoLastApply()
      await Promise.all([d.reloadRules(), d.reloadUndo()])
      toast({ title: t('undo.done', { count: n }), status: 'success' })
      close()
    } catch (e) {
      console.error('[plan] undo failed:', e)
      toast({ title: userMessage(e, t('undo.failed')), status: 'error' })
      await d.reloadUndo()
      close()
    } finally {
      setBusy(false)
    }
  }

  const sheetItem = sheet?.id && byId.get(sheet.id)
  const pickIdea = sheet?.type === 'pick' && ideas.find((i) => i.id === sheet.id)
  return (
    <Stack spacing={4}>
      {header}
      {applied?.canUndo && (
        <AppliedBanner state={applied} amount={monthOf(headline(sum).before)} mode={sum.mode} currency={currency}
          onUndo={() => setSheet({ type: 'undo' })} />
      )}
      {applied && !applied.canUndo && <AppliedNote state={applied} todayISO={d.todayISO} />}
      {(reality.dropped.length > 0 || reality.stale.length > 0) && (
        <RealityBanner dropped={reality.dropped} stale={reality.stale}
          onOk={() => d.setPlan((p) => acknowledge(p, d.rules, d.savingsIds, d.salary))} />
      )}
      <ImpactHeader sum={sum} view={view} onView={setView} currency={currency} rates={rates} />
      <IdeasStrip ideas={ideas} view={view} currency={currency} onTry={onTry}
        onDismiss={(idea) => d.setPlan((p) => dismissIdea(p, idea.id))} />
      {planGroups(items).map((g) => (
        <Panel key={g.key} p={4} pb={2} as="section" aria-label={t(`groups.${g.key}`)}>
          <SectionLabel mb={1} aside={formatMoney(inView(g.total, view), currency)}>{t(`groups.${g.key}`)}</SectionLabel>
          <Box as="ul">
            {g.items.map((it) => (
              <PlanRow key={it.id} item={it} view={view} currency={currency} tag={rowTag(it, signals)}
                onOpen={() => open(it)} onToggle={() => toggle(it)} />
            ))}
          </Box>
        </Panel>
      ))}
      <WhatIfRow onClick={() => setSheet({ type: 'add' })} />
      {sum.changes.length > 0
        ? <ChangesPanel sum={sum} currency={currency} onApply={() => setSheet({ type: 'apply' })}
            onClear={() => setSheet({ type: 'clear' })} />
        : <PlanHint />}

      {sheet?.type === 'edit' && sheetItem && (
        <EditSheet key={sheetItem.id} item={sheetItem} signal={signals.get(sheetItem.id)} currency={currency}
          onChange={(patch) => edit(sheetItem, patch)}
          onReset={() => d.setPlan((p) => (sheetItem.salary ? resetSalary(p) : resetChange(p, sheetItem.id)))}
          onClose={close} />
      )}
      {sheet?.type === 'add' && (
        <AddSheet add={sheetItem?.add} categories={d.categories} todayISO={d.todayISO} currency={currency}
          rates={d.rates}
          onSave={(add) => { d.setPlan((p) => upsertAdd(p, add)); close() }}
          onRemove={() => { d.setPlan((p) => removeAdd(p, sheet.id)); close() }} onClose={close} />
      )}
      {pickIdea && (
        <PickSheet idea={pickIdea} items={items} currency={currency} onClose={close}
          onAdd={(rows) => { d.setPlan((p) => tryIdea(p, pickIdea, rows.map((r) => ruleOf(r.id)))); close() }} />
      )}
      {sheet?.type === 'apply' && sum.changes.length > 0 && (
        <ApplySheet sum={sum} currency={currency} busy={busy} onApply={apply} onClose={close} />
      )}
      {sheet?.type === 'clear' && (
        <ClearDialog onClear={() => { d.setPlan(startOver); close() }} onClose={close} />
      )}
      {sheet?.type === 'undo' && applied?.canUndo && (
        <UndoDialog count={applied.count} busy={busy} onUndo={undo} onClose={close} />
      )}
    </Stack>
  )
}

