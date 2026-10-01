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
import { userMessage } from '../../shared/lib/errors.js'
import { useT } from '../../shared/lib/i18n/I18nProvider.jsx'
import { applyPlan, undoLastApply, usePlanData } from './plan.js'
import { applySelection, dismissIdea, emptyPlan, startOver, upsertAdd } from './planMath.js'
import {
  acknowledgePlan, dropItem, editItem, planPageParts, planState, toggleItem, tryIdeaWith,
} from './planPage.js'
import {
  ChangesPanel, IdeasStrip, ImpactHeader, PlanHint, PlanRow, SavedNote, WhatIfRow, changeKey,
} from './PlanParts.jsx'
import { ApplySheet } from './PlanSheets.jsx'
import { AddForm, EditForm, PickPanel } from './PlanEditors.jsx'
import { AppliedBanner, AppliedNote, ClearDialog, RealityBanner, UndoDialog } from './PlanBanners.jsx'
import PlanWhatIf, { WHAT_IF_KEY } from './PlanWhatIf.jsx'
import { useAiHelpers } from '../ai/ai.js'
import MoreBackButton from '../../shared/ui/MoreBackButton.jsx'

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

  const state = useMemo(() => planState({
    rules: d.rules, plan, savingsIds: d.savingsIds, baseCurrency: currency, rates: d.rates, categories: d.categories,
    salary: d.salary, savings: d.savings, charges: d.charges, budgetSets: d.budgetSets, budgetMonths: d.budgetMonths,
    separateYearly: d.separateYearly,
  }), [d.rules, plan, d.savingsIds, currency, d.rates, d.categories, d.salary, d.savings, d.charges, d.budgetSets,
    d.budgetMonths, d.separateYearly])
  const { items, sum, signals, ideas } = state
  const parts = planPageParts(state, { view, currency, undo: d.undo, categories: d.categories })

  // "Plan saved" only once there is something in it to keep (or a save
  // failed and needs a retry).
  const saved = parts.saved || d.status === 'error'
  const header = <PageHeader leading={<MoreBackButton />} title={t('title')} meta={saved ? <SavedNote status={d.status} onRetry={d.retry} /> : undefined} />
  if (d.error) {
    return <Stack spacing={5}>{header}<Panel><QueryError error={d.error} onRetry={d.reload} what={t('what')} /></Panel></Stack>
  }
  if (d.loading || !d.plan) {
    return <Stack spacing={5}>{header}<Panel><SkeletonRegion><SkeletonRows count={6} /></SkeletonRegion></Panel></Stack>
  }
  if (parts.empty) {
    return (
      <Stack spacing={5}>
        <PageHeader leading={<MoreBackButton />} title={t('title')} description={t('empty.lead')} />
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

  const edit = (item, patch) => d.setPlan((p) => editItem(p, item, d.rules, patch))
  const toggle = (item) => d.setPlan((p) => toggleItem(p, item, d.rules))
  const isOpen = (key) => open?.key === key
  const openEditor = (key) => setOpen({ key, at: Date.now() })
  const toggleOpen = (key) => (isOpen(key) ? setOpen(null) : openEditor(key))
  const onTry = (idea) => {
    if (idea.kind === 'overlap') toggleOpen(idea.id)
    // A price rise on an essential: open the payment to try a lower price.
    else if (idea.kind === 'compare') openEditor(idea.ruleIds[0])
    else d.setPlan((p) => tryIdeaWith(p, idea, d.rules))
  }
  const closeEditor = () => setOpen(null)
  const close = () => setDialog(null)
  // Drop one change from the plan: an edit or cancel goes back to the real
  // payment, an added one leaves.
  const drop = (it) => d.setPlan((p) => dropItem(p, it))
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
  const applied = parts.applied
  return (
    <Stack spacing={4}>
      {header}
      {applied?.canUndo && <AppliedBanner parts={applied} onUndo={() => setDialog('undo')} />}
      {applied && !applied.canUndo && <AppliedNote parts={applied} />}
      {parts.reality && (
        <RealityBanner parts={parts.reality}
          onOk={() => d.setPlan((p) => acknowledgePlan(p, d))} />
      )}
      <ImpactHeader parts={parts.header} view={view} onView={setView} />
      <IdeasStrip ideas={parts.ideas} picking={pickIdea?.id} onTry={onTry}
        onDismiss={(idea) => d.setPlan((p) => dismissIdea(p, idea.id))} />
      {pickIdea && (
        <PickPanel key={`${pickIdea.id}-${open.at}`} idea={pickIdea} items={items} currency={currency} onClose={closeEditor}
          onAdd={(ids) => d.setPlan((p) => tryIdeaWith(p, pickIdea, d.rules, ids))} />
      )}
      {parts.groups.map((g) => (
        <Panel key={g.key} p={4} pb={2} as="section" aria-label={g.title}>
          <SectionLabel mb={1} aside={g.total}>{g.title}</SectionLabel>
          <Box as="ul">
            {g.rows.map((row) => (
              <PlanRow key={row.id} row={row} open={isOpen(row.id)} editor={editor(row.item)}
                onOpen={() => toggleOpen(row.id)} onToggle={() => toggle(row.item)} />
            ))}
          </Box>
        </Panel>
      ))}
      <WhatIfRow open={isOpen('new')} form={isOpen('new') && addForm(null, 'new')} onClick={() => toggleOpen('new')} />
      {planWhatIf && (
        <PlanWhatIf open={isOpen(WHAT_IF_KEY)} onOpen={() => openEditor(WHAT_IF_KEY)} onClose={closeEditor} plan={plan}
          setPlan={d.setPlan} items={items} rules={d.rules} categories={d.categories} todayISO={d.todayISO} />
      )}
      {parts.changes
        ? <ChangesPanel parts={parts.changes} isOpen={(it) => isOpen(changeKey(it.id))}
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

