// Salary history's data layer: the salary and bonus entries, the user's
// corrections (one encrypted document per account, 0102), saving them, and
// the report the page and the Insights card show. The maths is all in
// salaryMath.js.
import { useMemo } from 'react'
import { supabase } from '../../shared/lib/supabase.js'
import { useLiveQuery } from '../../shared/lib/db.js'
import { dbError } from '../../shared/lib/errors.js'
import { useAuth } from '../../shared/auth/AuthProvider.jsx'
import { useProfile } from '../../shared/lib/ProfileProvider.jsx'
import { useLanguage } from '../../shared/lib/i18n/I18nProvider.jsx'
import { today } from '../../shared/lib/dates.js'
import { payMonthOf } from '../../shared/lib/payCalendar.js'
import { useTransactions } from '../../shared/lib/transactions.js'
import { useAllCategories } from '../../shared/lib/categories.js'
import { salaryCategoryId } from '../plan/planMath.js'
import { useMealVouchers } from '../vouchers/vouchers.js'
import {
  bonusCategoryId, defaultCountry, normaliseNotes, salaryEntryIds, salaryReport, withFix,
} from './salaryMath.js'
import { bonusChoices } from './salaryText.js'

// The signed-in user's corrections, or null when they have none.
export async function readSalaryNotes() {
  const { data, error } = await supabase.rpc('my_salary_history')
  if (error) throw dbError(error)
  return data ?? null
}

// Save the corrections (null deletes them).
export async function saveSalaryNotes(notes) {
  const { error } = await supabase.rpc('save_salary_history', { p: notes })
  if (error) throw dbError(error)
}

function useSalaryNotes() {
  const { user } = useAuth()
  const uid = user?.id ?? null
  return useLiveQuery(readSalaryNotes, {
    deps: [uid], enabled: !!uid, initial: null, cacheKey: uid ? `salary:${uid}` : null,
  })
}

// Everything the salary page and card need:
//   report      salaryReport's answer (null: no salary entries yet)
//   salaryId    the salary category (null: none — the page says how to set one)
//   bonusId     the Bonus category (null: none — the page offers a picker)
//   income      the Bonus picker's choices ([{ id, label }]: salaryText.bonusChoices)
//   country     prices compared against (picked, vouchers, language)
//   setFix(id, kind), setCountry(c), setBonusCategory(id): save a correction;
//   each resolves once saved and throws when it couldn't be (the caller
//   shows the error), putting the old value back.
export function useSalary() {
  const { profile, baseCurrency = 'EUR', payCalendar: cal } = useProfile()
  const { lang } = useLanguage()
  const { rows: categories, loading: catsLoading, error: catsError, reload: reloadCats } = useAllCategories()
  const income = useTransactions({ kind: 'income' })
  const notesQ = useSalaryNotes()
  const vouchers = useMealVouchers()
  const notes = useMemo(() => normaliseNotes(notesQ.data), [notesQ.data])
  const nowKey = payMonthOf(today(), cal)

  const salaryId = salaryCategoryId(profile, categories)
  const bonusId = bonusCategoryId(categories, notes)
  const country = defaultCountry({ picked: notes.country, voucherCountry: vouchers.settings?.country, language: lang })
  const report = useMemo(() => salaryReport(income.rows, {
    salaryId, bonusId, currency: baseCurrency, notes, cal, nowKey,
  }), [income.rows, salaryId, bonusId, baseCurrency, notes, cal, nowKey])
  const entryIds = useMemo(() => salaryEntryIds(income.rows, salaryId, bonusId), [income.rows, salaryId, bonusId])

  async function save(next) {
    const before = notesQ.data
    notesQ.mutate(next)
    try { await saveSalaryNotes(next) } catch (e) { notesQ.mutate(before); throw e }
  }

  return {
    report, salaryId, bonusId, country, nowKey, currency: baseCurrency,
    income: bonusChoices(categories, salaryId),
    loading: income.loading || catsLoading || notesQ.loading,
    error: income.error ?? catsError ?? notesQ.error,
    reload: () => Promise.all([income.reload(), reloadCats(), notesQ.reload()]),
    setFix: (id, kind) => save(withFix(notes, id, kind, entryIds)),
    setCountry: (c) => save({ ...withFix(notes, null, null, entryIds), country: c }),
    setBonusCategory: (id) => save({ ...withFix(notes, null, null, entryIds), bonus_category_id: id }),
  }
}
