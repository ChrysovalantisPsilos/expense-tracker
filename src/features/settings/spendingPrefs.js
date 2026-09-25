// Pure helpers behind Settings › Monthly spending (no React/supabase).

// The salary shift's default start day (0081): salary paid from the 25th to
// the month's end counts toward the next month.
export const SALARY_SHIFT_DEFAULT_DAY = 25

// The days the "from day" picker offers. 29–31 clamp to shorter months'
// last day (salaryShift.ts), so each still means "to the month's end".
export const SALARY_SHIFT_DAYS = Array.from({ length: 31 }, (_, i) => i + 1)

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
