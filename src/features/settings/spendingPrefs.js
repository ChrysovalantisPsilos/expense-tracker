// Pure helpers behind Settings › Monthly spending (no React/supabase).

// The salary setting's default from-day (0081): a salary paid from the 25th
// to the month's end starts the next month (pay months, payCalendar.ts).
export const SALARY_SHIFT_DEFAULT_DAY = 25

// The days the "from day" picker offers: the 15th to the 31st (a salary
// earlier in the month starts its own month). 29–31 clamp to shorter months'
// last day (payCalendar.ts), so each still means "to the month's end".
export const SALARY_SHIFT_DAYS = Array.from({ length: 17 }, (_, i) => i + 15)

// The income category the switch picks when it's turned on: the user's
// current choice while it's still one of their (unarchived) income
// categories, else the one called "Salary", else the first income category
// (by name), else null.
export function defaultSalaryCategoryId(categories, current = null) {
  const income = (categories ?? []).filter((c) => c.kind === 'income' && !c.is_archived)
  if (current && income.some((c) => c.id === current)) return current
  const salary = income.find((c) => String(c.name).trim().toLowerCase() === 'salary')
  const first = [...income].sort((a, b) => String(a.name).localeCompare(String(b.name)))[0]
  return (salary ?? first)?.id ?? null
}

// The profile patch that turns the shift on or off. Off clears only the day
// (null = off) and keeps the category, so turning it back on remembers it.
export function salaryShiftPatch(on, { fromDay, categoryId, categories }) {
  if (!on) return { salary_shift_from_day: null }
  return {
    salary_shift_from_day: fromDay ?? SALARY_SHIFT_DEFAULT_DAY,
    salary_category_id: defaultSalaryCategoryId(categories, categoryId),
  }
}

// What the salary-shift preference shows (Settings › Monthly spending, on the
// web and in the app): whether it is on, whether the switch is held off (it
// can't be turned on without an income category to count), the hint under
// it (a settings: key), whether the ⓘ has more, and the "shorter months"
// note for a start day past the 28th, and the days the "from day" picker
// offers (with a day stored before the picker started at the 15th, which
// keeps working). `incomeCount` is how many active income categories there
// are; `loading` is true while they are read.
export function salaryShiftView({ fromDay, incomeCount, loading = false }) {
  const on = fromDay != null
  const blocked = !loading && incomeCount === 0 && !on
  return {
    on,
    disabled: blocked,
    hint: blocked ? 'settings:spending.salary.needsIncome' : 'settings:spending.salary.hint',
    more: !blocked,
    shortMonths: on && fromDay > 28,
    days: on && !SALARY_SHIFT_DAYS.includes(fromDay) ? [fromDay, ...SALARY_SHIFT_DAYS] : SALARY_SHIFT_DAYS,
  }
}
