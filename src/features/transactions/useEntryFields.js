import { useRef, useState } from 'react'
import { useCategories, useSavingsIds } from '../../shared/lib/categories.js'
import { presetCategoryId } from '../../shared/lib/categoryName.js'
import { useMealVouchers } from '../vouchers/vouchers.js'
import { useAiHelpers } from '../ai/ai.js'
import { fillPlan, settlePendingCategory } from '../ai/aiMath.js'
import { firstInvalid } from '../../shared/lib/formChecks.js'
import { ENTRY_FIELDS, entryDerived, entryErrors } from './entryForm.js'

// The state behind EntryFields — the fields Add and a recurring rule's page
// share — started from a form state (entryForm.js: newForm, formFromRow).
// Returns the values, their setters and what the fields show; `values()` is
// the form state again, for entryColumns/ruleFromForm to save, and
// `validate()` checks it before a save: false (the inline errors shown from
// then on, the first bad field focused) when something's missing.
//   isEdit          a saved entry or rule: no Type it
//   allowVouchers   whether "Paid from" offers meal vouchers (not for a rule,
//                   nor an entry set to repeat: a rule can't pay with them)
//   preset          a category id from the link, picked once the categories
//                   load if it's one of the user's own of this kind
//   onKind(kind)    the kind was switched
//   onDate(date)    the date was changed (Add's Repeat follows it)
// Income in a savings category (0084) asks "Taken from my income"; an expense
// asks "Paid from" (Bank · Savings · Meal vouchers, the ones this user has;
// one the entry was saved with stays offered). "Type it" (Settings → AI
// helpers, new entries only) marks the fields it filled until edited; Undo
// restores what was there. Its category waits for that kind's categories to
// load (settlePendingCategory).
export function useEntryFields(start, { isEdit = false, allowVouchers = true, preset: link = '', onKind, onDate } = {}) {
  const [kind, setKind] = useState(start.kind)
  const { categories, loading: categoriesLoading } = useCategories(kind)
  const [amount, setAmount] = useState(start.amount)
  const [currency, setCurrency] = useState(start.currency)
  const [currencyPicked, setCurrencyPicked] = useState(start.currencyPicked)
  const [categoryId, setCategoryId] = useState(start.categoryId)
  const [preset, setPreset] = useState(link ?? '')
  if (preset && !categoriesLoading) {
    setPreset('')
    const id = presetCategoryId(preset, categories, kind)
    if (id) setCategoryId(id)
  }
  const [description, setDescription] = useState(start.description)
  const [date, setDate] = useState(start.date)
  const { savingsIds, loading: savingsLoading } = useSavingsIds()
  const [fromIncome, setFromIncome] = useState(start.fromIncome)
  const { settings: vouchers } = useMealVouchers()
  const [paidFrom, setPaidFrom] = useState(start.paidFrom)
  const { isSavings, sources, from, amountMinor } = entryDerived(
    { kind, amount, currency, categoryId, paidFrom },
    { savingsIds, vouchersOn: !!vouchers, allowVouchers, startPaidFrom: start.paidFrom })

  const quickOn = useAiHelpers().quickEntry && !isEdit
  const [marks, setMarks] = useState(() => new Set())
  const [pendingCat, setPendingCat] = useState(null)
  const beforeFill = useRef(null)
  if (pendingCat) {
    const settled = settlePendingCategory(pendingCat, categories, categoriesLoading)
    if (settled.done) {
      setPendingCat(null)
      if (settled.pick !== null) setCategoryId(settled.pick)
    }
  }
  const unmark = (field) => setMarks((m) => (m.has(field) ? new Set([...m].filter((f) => f !== field)) : m))

  // Inline field errors, shown from the first submit on.
  const [tried, setTried] = useState(false)
  const amountRef = useRef(null)
  const dateRef = useRef(null)
  function validate() {
    const first = firstInvalid(entryErrors({ amount, date }), ENTRY_FIELDS)
    if (!first) return true
    setTried(true)
    const field = first === 'amount' ? amountRef : dateRef
    field.current?.focus()
    return false
  }

  function pickKind(k) {
    setKind(k)
    onKind?.(k)
    setPreset('')
    setCategoryId('') // categories are per kind
  }
  function pickCurrency(c) {
    setCurrency(c)
    setCurrencyPicked(true)
  }
  function changeDate(v) {
    setDate(v)
    onDate?.(v)
  }

  // Put a form state in place: Type it's fill, or Undo's way back.
  function putFields(f) {
    if (f.kind !== kind) pickKind(f.kind)
    setAmount(f.amount)
    setCurrency(f.currency)
    setCurrencyPicked(f.currencyPicked)
    changeDate(f.spentAt)
    setDescription(f.description)
    setPaidFrom(f.paidFrom)
    setPendingCat({ id: f.categoryId, kind: f.kind })
  }
  function applyFill(entry) {
    const current = { kind, amount, currency, currencyPicked, categoryId, description, spentAt: date, paidFrom: from }
    const { next, marked } = fillPlan(entry, current)
    beforeFill.current ??= current
    putFields({ ...next, currencyPicked: currencyPicked || next.currency !== currency })
    setMarks(new Set(marked))
  }
  function undoFill() {
    if (beforeFill.current) putFields(beforeFill.current)
    beforeFill.current = null
    setMarks(new Set())
  }

  return {
    kind, pickKind, categories, amount, setAmount, currency, currencyPicked, pickCurrency,
    categoryId, setCategoryId, description, setDescription, date, changeDate,
    isSavings, fromIncome, setFromIncome, sources, from, setPaidFrom, savingsLoading,
    quickOn, marks, unmark, applyFill, undoFill,
    errors: tried ? entryErrors({ amount, date }) : {}, amountRef, dateRef, validate,
    amountMinor,
    values: () => ({
      kind, amount, currency, currencyPicked, categoryId, description, date, fromIncome, paidFrom: from,
    }),
  }
}
