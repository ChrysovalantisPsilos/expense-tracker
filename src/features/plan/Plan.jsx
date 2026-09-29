import { useMemo, useState } from 'react'
import { Link as RouterLink } from 'react-router-dom'
import { addEntryLink } from '../../shared/lib/addLinks.js'
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
  planGroups, planIdeas, planRules, planSummary, priceRises, reconcile, removeAdd, resetChange, resetDerived, rowTag,
  setChange, setDerived, signalsFor, startOver, tryIdea, undoState, upsertAdd,
} from './planMath.js'
import {
  ChangesPanel, IdeasStrip, ImpactHeader, PlanHint, PlanRow, SavedNote, WhatIfRow, changeKey,
} from './PlanParts.jsx'
import { itemName } from './planText.js'
import { ApplySheet } from './PlanSheets.jsx'
import { AddForm, EditForm, PickPanel } from './PlanEditors.jsx'
import { AppliedBanner, AppliedNote, ClearDialog, RealityBanner, UndoDialog } from './PlanBanners.jsx'
import PlanWhatIf, { WHAT_IF_KEY } from './PlanWhatIf.jsx'
import { useAiHelpers } from '../ai/ai.js'

// Plan mode (/plan): a sandbox over the user's recurring payments and income.
// Every edit shows at once how the monthly net moves, before → after; the plan
// is saved to the account by itself, and nothing real changes until the user
// applies it (then Undo for 24 hours). Money set aside as savings from income
// has its own Savings group and lowers what's left, like Home's net. A salary
// (or savings) logged as entries shows as a derived Salary (Savings) row,
// with plan-only edits; with no recurring income at all the card shows the
// payments instead.
export default function Plan() {
  const t = useT('plan')
  const toast = useToast()
  const d = usePlanData()
  const { planWhatIf } = useAiHelpers()
  const [view, setView] = useState('month')
  // The one editor open in place on the whole page: { key, at }, `key` naming
  // what opened it (PlanParts.openerId: a row's id, changeKey(id) for its
  // entry in "Your changes", 'new' for "What if I add…", an overlap idea's id,
  // WHAT_IF_KEY for the "Type a what-if" preview);
  // `at` reopens it, scrolled into view, when asked again. The real
  // confirmations are dialogs: 'apply' | 'clear' | 'undo'.
  const [open, setOpen] = useState(null)
  const [dialog, setDialog] = useState(null)
  const [busy, setBusy] = useState(false)
  const plan = d.plan ?? emptyPlan()
  const currency = d.baseCurrency

  const categoriesById = useMemo(() => new Map(d.categories.map((c) => [c.id, c])), [d.categories])
  const items = useMemo(() => buildItems({
    rules: d.rules, plan, savingsIds: d.savingsIds, baseCurrency: currency, rates: d.rates, categoriesById,
    salary: d.salary, savings: d.savings,
  }), [d.rules, plan, d.savingsIds, currency, d.rates, categoriesById, d.salary, d.savings])
  const sum = useMemo(() => planSummary(items), [items])
  const reality = useMemo(() => reconcile(plan, d.rules, d.savingsIds, d.salary, d.savings),
    [plan, d.rules, d.savingsIds, d.salary, d.savings])
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

  // "Plan saved" only once there is something in it to keep (or a save
  // failed and needs a retry).
  const saved = sum.changes.length > 0 || d.status === 'error'
  const header = <PageHeader title={t('title')} meta={saved ? <SavedNote status={d.status} onRetry={d.retry} /> : undefined} />
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
              <Button as={RouterLink} to={addEntryLink({ repeat: true })} leftIcon={<Plus size={18} />}>{t('empty.add')}</Button>
              <Button as={RouterLink} to="/recurring" variant="outline">{t('empty.go')}</Button>
            </>} />
        </Panel>
      </Stack>
    )
  }

  const ruleOf = (id) => d.rules.find((r) => r.id === id)
  const edit = (item, patch) => d.setPlan((p) => (item.derived
    ? setDerived(p, item.id, patch, item.before.amount_minor)
    : setChange(p, ruleOf(item.id), patch, itemName(item))))
  const toggle = (item) => {
    if (item.added) d.setPlan((p) => removeAdd(p, item.id))
    else edit(item, { cancel: !item.cancelled })
  }
  const isOpen = (key) => open?.key === key
  const openEditor = (key) => setOpen({ key, at: Date.now() })
  const toggleOpen = (key) => (isOpen(key) ? setOpen(null) : openEditor(key))
  const onTry = (idea) => {
    if (idea.kind === 'overlap') toggleOpen(idea.id)
    // A price rise on an essential: open the payment to try a lower price.
    else if (idea.kind === 'compare') openEditor(idea.ruleIds[0])
    else d.setPlan((p) => tryIdea(p, idea, [ruleOf(idea.ruleIds[0])]))
  }
  const closeEditor = () => setOpen(null)
  const close = () => setDialog(null)
  // Drop one change from the plan: an edit or cancel goes back to the real
  // payment, an added one leaves.
  const drop = (it) => d.setPlan((p) => (it.added ? removeAdd(p, it.id) : it.derived ? resetDerived(p, it.id) : resetChange(p, it.id)))
  const addForm = (add, key) => (
    <AddForm key={`${key}-${open.at}`} add={add} opener={key} categories={d.categories} todayISO={d.todayISO}
      currency={currency} rates={d.rates} onSave={(a) => d.setPlan((p) => upsertAdd(p, a))} onClose={closeEditor} />
  )
  // A row's editor, under the row (`key` its id) or its change (changeKey).
  const editor = (it, key = it.id) => {
    if (!isOpen(key)) return null
    if (it.added) return addForm(it.add, key)
    return (
      <EditForm key={`${key}-${open.at}`} item={it} opener={key} signal={signals.get(it.id)} currency={currency}
        onChange={(patch) => edit(it, patch)} onReset={() => drop(it)} onClose={closeEditor} />
    )
  }

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

  const pickIdea = open && ideas.find((i) => i.kind === 'overlap' && i.id === open.key)
  return (
    <Stack spacing={4}>
      {header}
      {applied?.canUndo && (
        <AppliedBanner state={applied} amount={monthOf(headline(sum).before)} mode={sum.mode} currency={currency}
          onUndo={() => setDialog('undo')} />
      )}
      {applied && !applied.canUndo && <AppliedNote state={applied} todayISO={d.todayISO} />}
      {(reality.dropped.length > 0 || reality.stale.length > 0) && (
        <RealityBanner dropped={reality.dropped} stale={reality.stale}
          onOk={() => d.setPlan((p) => acknowledge(p, d.rules, d.savingsIds, d.salary, d.savings))} />
      )}
      <ImpactHeader sum={sum} items={items} view={view} onView={setView} currency={currency} rates={rates} />
      <IdeasStrip ideas={ideas} view={view} currency={currency} picking={pickIdea?.id} onTry={onTry}
        onDismiss={(idea) => d.setPlan((p) => dismissIdea(p, idea.id))} />
      {pickIdea && (
        <PickPanel key={`${pickIdea.id}-${open.at}`} idea={pickIdea} items={items} currency={currency} onClose={closeEditor}
          onAdd={(rows) => d.setPlan((p) => tryIdea(p, pickIdea, rows.map((r) => ruleOf(r.id))))} />
      )}
      {planGroups(items).map((g) => (
        <Panel key={g.key} p={4} pb={2} as="section" aria-label={t(`groups.${g.key}`)}>
          <SectionLabel mb={1} aside={formatMoney(inView(g.total, view), currency)}>{t(`groups.${g.key}`)}</SectionLabel>
          <Box as="ul">
            {g.items.map((it) => (
              <PlanRow key={it.id} item={it} view={view} currency={currency} tag={rowTag(it, signals)}
                open={isOpen(it.id)} editor={editor(it)} onOpen={() => toggleOpen(it.id)} onToggle={() => toggle(it)} />
            ))}
          </Box>
        </Panel>
      ))}
      <WhatIfRow open={isOpen('new')} form={isOpen('new') && addForm(null, 'new')} onClick={() => toggleOpen('new')} />
      {planWhatIf && (
        <PlanWhatIf open={isOpen(WHAT_IF_KEY)} onOpen={() => openEditor(WHAT_IF_KEY)} onClose={closeEditor} plan={plan}
          setPlan={d.setPlan} items={items} rules={d.rules} categories={d.categories} todayISO={d.todayISO} />
      )}
      {sum.changes.length > 0
        ? <ChangesPanel sum={sum} currency={currency} isOpen={(it) => isOpen(changeKey(it.id))}
            editor={(it) => editor(it, changeKey(it.id))} onOpen={(it) => toggleOpen(changeKey(it.id))} onDrop={drop}
            onApply={() => setDialog('apply')} onClear={() => setDialog('clear')} />
        : <PlanHint />}

      {dialog === 'apply' && sum.changes.length > 0 && (
        <ApplySheet sum={sum} currency={currency} busy={busy} onApply={apply} onClose={close} />
      )}
      {dialog === 'clear' && (
        <ClearDialog onClear={() => { d.setPlan(startOver); close() }} onClose={close} />
      )}
      {dialog === 'undo' && applied?.canUndo && (
        <UndoDialog count={applied.count} busy={busy} onUndo={undo} onClose={close} />
      )}
    </Stack>
  )
}

