// "What-if in your own words" in Plan mode — pure rules (unit-tested in
// test/planWhatIf.test.js). The ai-helper edge function answers a typed line
// with proposals (_shared/aiHelper.normaliseWhatIf: changes to the caller's
// own payments by id, new items); here they become preview rows the user can
// untick or edit, then ordinary plan edits (planMath.setChange/upsertAdd),
// and Undo takes exactly those edits back out again. Nothing here is saved or
// applied: the plan is still only a sandbox until its own Apply.
import { choiceToRule } from '../recurring/recurringMath.js'
import { NAME_MAX, removeAdd, resetChange, setChange, upsertAdd } from './planMath.js'

// The server's proposals → preview rows, in the order it gave them:
//   { id, type: 'cancel' | 'change' | 'add', kind ('expense' | 'income' |
//     'savings'), name, ruleId (null for an add), before (the row's fields
//     today, null for an add), after (the fields it would have: null once
//     cancelled), edited: false }
// A change whose payment isn't in the plan's rows any more (paused or deleted
// meanwhile) is left out; a change to a row the plan already edits starts
// from the plan's version. A new savings item needs a savings category
// (`savingsCategoryId`, where it would go): with none it's left out.
export function whatIfRows(whatif, items, savingsCategoryId = null) {
  const byRule = new Map(items.filter((i) => i.ruleId && !i.added).map((i) => [i.ruleId, i]))
  const rows = []
  for (const c of whatif?.changes ?? []) {
    const item = byRule.get(c.rule_id)
    if (!item) continue
    const base = item.after ?? item.before
    rows.push({
      id: `c:${item.ruleId}`, type: c.cancel ? 'cancel' : 'change', kind: item.kind, name: item.name, ruleId: item.ruleId,
      item, before: item.before,
      after: c.cancel ? null : {
        ...base,
        ...(c.amount_minor ? { amount_minor: c.amount_minor } : {}),
        ...(c.repeat ? choiceToRule(c.repeat) : {}),
      },
      edited: false,
    })
  }
  ;(whatif?.adds ?? []).forEach((a, n) => {
    if (a.kind === 'savings' && !savingsCategoryId) return
    rows.push({
      id: `a:${n}`, type: 'add', kind: a.kind, name: a.name, ruleId: null, item: null, before: null,
      after: { amount_minor: a.amount_minor, currency: a.currency, ...choiceToRule(a.repeat) },
      edited: false,
    })
  })
  return rows
}

// One row edited in the preview: `patch` is any of { cancel (true | false),
// amount_minor, frequency, interval_n, name }. Cancelling keeps the fields to
// go back to; the row loses its "Suggested" mark.
export function editRow(row, patch) {
  const fields = row.after ?? row.kept ?? row.before
  const next = { ...row, edited: true }
  if ('name' in patch && row.type === 'add') next.name = String(patch.name).slice(0, NAME_MAX)
  if (patch.cancel === true && row.type !== 'add') return { ...next, type: 'cancel', after: null, kept: fields }
  const edits = Object.fromEntries(['amount_minor', 'frequency', 'interval_n'].filter((k) => k in patch).map((k) => [k, patch[k]]))
  const type = patch.cancel === false || row.type === 'change' ? 'change' : row.type
  if (type === 'cancel') return next
  return { ...next, type, after: { ...fields, ...edits } }
}

// Whether a row can go into the plan as it stands: a positive amount, and a
// name for a new item.
export const rowReady = (row) =>
  row.type === 'cancel' || (row.after?.amount_minor > 0 && (row.type !== 'add' || !!String(row.name).trim()))

// "Add to plan": the ticked rows (`pickedIds`) as plan edits. `rules` are the
// real rules (by id), `todayISO` the date an added item starts, `newId` makes
// an added item's id, `savingsCategoryId` is a new savings item's category.
// Returns { plan, added: { ruleIds, addIds, before } } — `added` is what Undo
// needs (undoWhatIf).
export function applyWhatIf(plan, rows, pickedIds, { rules, todayISO, newId, savingsCategoryId = null }) {
  const byId = new Map(rules.map((r) => [r.id, r]))
  const ruleIds = []
  const addIds = []
  let next = plan
  for (const row of rows) {
    if (!pickedIds.has(row.id) || !rowReady(row)) continue
    if (row.type === 'add') {
      const id = newId()
      next = upsertAdd(next, {
        id, kind: row.kind, name: String(row.name).trim(), ...row.after, start: todayISO,
        category_id: row.kind === 'savings' ? savingsCategoryId : null,
      })
      if (next.adds.some((a) => a.id === id)) addIds.push(id)
      continue
    }
    const rule = byId.get(row.ruleId)
    if (!rule) continue
    next = setChange(next, rule, row.type === 'cancel' ? { cancel: true }
      : { cancel: false, amount_minor: row.after.amount_minor, frequency: row.after.frequency, interval_n: row.after.interval_n })
    ruleIds.push(row.ruleId)
  }
  return { plan: next, added: { ruleIds, addIds, before: plan.changes.filter((c) => ruleIds.includes(c.rule_id)) } }
}

// Undo "Add to plan": the added items leave, and each changed payment goes
// back to what the plan had for it before (its earlier change, or none).
// Other edits made since stay.
export function undoWhatIf(plan, added) {
  let next = added.addIds.reduce(removeAdd, plan)
  for (const id of added.ruleIds) {
    next = resetChange(next, id)
    const was = added.before.find((c) => c.rule_id === id)
    if (was) next = { ...next, changes: [...next.changes, was] }
  }
  return next
}
