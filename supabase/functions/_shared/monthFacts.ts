// "Month in plain words" (ai-helper's month_summary): the facts about one
// month that go to the model, its instructions, and the checks its lines pass
// before they reach Home. Pure, no network (test/monthFacts.test.js).
//
// The facts are decided here, not by the model: which categories are notably
// different from a usual month, which budgets are nearly used or over, what's
// still due this month, and whether the salary is in. The model only words
// them. The rules, and why (a summary on 2 October said the salary hadn't
// arrived while Home showed it, and that a monthly card settlement equal to
// last month's had "jumped above usual"):
//   * The month is the one Home shows: with the salary setting on, a pay
//     month (0111: from the day its salary arrived to the day before the
//     next), and the server's totals count every row in its pay month. The
//     salary is mentioned once it's in (`salary_in`), never as missing.
//     Whether the month is still going, and the user's today, come from the
//     server with the totals (the user's own time zone).
//   * Like for like: what's in so far is set against whole months (the usual,
//     the six months' average, and last month), and a category stands out
//     only when it's already notably above BOTH. A monthly payment that's the
//     same as last month is never "above usual" however the six months
//     average out, and nothing is pro-rated. Below-usual is only said once
//     the month is over (early in a month everything is below a whole month).
//   * Budgets only when nearly used (BUDGET_NEAR) or over; never the rest.
//   * What's still due this month (coming_up) from the caller's recurring
//     rules, by category name (no descriptions leave the server), up to the
//     day before the next salary is expected (payCalendar.expectedEnd).
//   * No day counts. A first month, with nothing to compare, names its
//     biggest categories instead.
// The answer is checked (normaliseSummary): every amount must be one of the
// facts' own, exactly as formatted; a line naming a category the facts don't
// mention, or a filler line (little activity, days left, salary not in), is
// dropped; at most SUMMARY_LINES_MAX lines.

import { formatMinor, formatRoundedMinor, minorFactor } from './money.ts'
import { savingsIdsOf } from './savings.ts'
import { isPlanRule, planKindOf } from './planRules.ts'
import { type Cal, type Window, expectedEnd, opensMonth, paydayHints, salaryShiftOf } from './payCalendar.ts'
import { type Ask, type Category, type CategoryRow, DATA_ONLY, LABEL_MAX, cleanText, moneyInLine } from './aiHelper.ts'

// The month's totals as my_month_summary (0103, 0109, 0111) returns them.
export interface MonthTotals {
  currency: string
  month: string // YYYY-MM
  salary_category_id?: string | null
  salary_shift_from_day?: number | null
  window?: { from: string; to: string; open: boolean } // the month's window (a pay month with the setting on)
  current_month?: string // YYYY-MM: the month the user's today is in
  today?: string // the user's today, YYYY-MM-DD (their time zone)
  last_pay_day?: string | null // the newest payday (pay months)
  categories: { id: string | null; name: string | null; kind: string; totals: number[]; budget: number | null }[]
}

// The locale a summary's amounts are written in: its language's, the way the
// app shows money in that language (English "€1,030.00", Greek "1.030,00 €").
export const SUMMARY_LOCALES = { en: 'en', el: 'el-GR' } as const

export const SUMMARY_LINES_MAX = 3 // sentences on the card
const SUMMARY_LINE_MAX = 300       // characters in one (SQL checks it too)
const STAND_OUT_MAX = 4
const COMING_UP_MAX = 4
const BUDGET_NEAR = 0.8            // a budget this used is worth a line
const NOTABLE_SHARE = 0.15         // a difference worth a line: 15% of what it's set against,
const NOTABLE_UNITS = 10           // at least 10 whole units, and 1% of a usual month's spending

// What a summary's lines are checked against (normaliseSummary): the amounts
// it was given, already formatted, how to spot one in a line, and the names
// it may (`named`) and may not (`unnamed`) mention.
export interface FigureCheck {
  currency: string; locale: string; figures: string[]; named: string[]; unnamed: string[]
}

type Lang = 'en' | 'el'
type Row = MonthTotals['categories'][number]

const pad2 = (n: number) => String(n).padStart(2, '0')
function lastDayOf(month: string): string {
  const [y, m] = month.split('-').map(Number)
  return `${month}-${pad2(new Date(Date.UTC(y, m, 0)).getUTCDate())}`
}

export function monthFacts(o: {
  totals: MonthTotals; lang: Lang; categories: Category[]; today: string
  rules?: any[]; categoryRows?: CategoryRow[]
}): { facts: Record<string, unknown>; inProgress: boolean; check: FigureCheck } {
  const cur = o.totals.currency
  const locale = SUMMARY_LOCALES[o.lang]
  const unit = minorFactor(cur)
  // Every amount goes out formatted the way the app shows it, and is noted
  // for the check. A usual month (a six-month average) is rounded to whole
  // units, where cents would be noise; the rest are exact.
  const figures = new Set<string>()
  const money = (minor: number, rounded = false) => {
    const f = (rounded ? formatRoundedMinor : formatMinor)(minor, cur, locale)
    figures.add(f)
    return f
  }
  const usualOf = (before: number[]) => Math.round(before.reduce((a, v) => a + v, 0) / 6 / unit) * unit
  const labels = new Map(o.categories.map((c) => [c.id, c.name]))
  const noName = o.lang === 'el' ? 'Χωρίς κατηγορία' : 'Uncategorized'
  const nameOf = (c: Row) => (c.id && labels.get(c.id)) || cleanText(c.name, LABEL_MAX) || noName
  const month = o.totals.month
  const inProgress = month >= (o.totals.current_month ?? o.today.slice(0, 7))

  const rows = (o.totals.categories ?? []).map((c) => {
    const at = (i: number) => Number(c.totals?.[i]) || 0
    const before = [1, 2, 3, 4, 5, 6].map(at)
    return { c, name: nameOf(c), kind: c.kind, now: at(0), last: at(1), usual: usualOf(before), before }
  })
  const history = rows.some((r) => r.before.some((v) => v !== 0))
  const sumAt = (kind: string, i: number) =>
    rows.filter((r) => r.kind === kind).reduce((a, r) => a + (i === 0 ? r.now : r.before[i - 1]), 0)
  const whole = (kind: string) => ({
    now: sumAt(kind, 0), last: sumAt(kind, 1), usual: usualOf([1, 2, 3, 4, 5, 6].map((i) => sumAt(kind, i))),
  })
  const spent = whole('expense')
  const earned = whole('income')
  const floor = Math.max(NOTABLE_UNITS * unit, Math.round(spent.usual * 0.01))
  const notable = (diff: number, against: number) => diff > 0 && diff >= Math.max(floor, against * NOTABLE_SHARE)
  const named = new Set<string>()

  // What stands out: already above both a usual month and last month (or,
  // once the month is over, below both). Nothing without any history.
  const standOut = !history ? [] : rows.flatMap((r) => {
    const up = r.now - Math.max(r.usual, r.last)
    const down = Math.min(r.usual, r.last) - r.now
    const base = { category: r.name, kind: r.kind }
    if (notable(up, Math.max(r.usual, r.last))) {
      return [{ size: up, item: { ...base, this_month: money(r.now), usual_month: money(r.usual, true), last_month: money(r.last),
        above_usual_by: money(r.now - r.usual), above_last_month_by: money(r.now - r.last) } }]
    }
    if (!inProgress && notable(down, Math.min(r.usual, r.last))) {
      return [{ size: down, item: { ...base, this_month: money(r.now), usual_month: money(r.usual, true), last_month: money(r.last),
        below_usual_by: money(r.usual - r.now), below_last_month_by: money(r.last - r.now) } }]
    }
    return []
  }).sort((a, b) => b.size - a.size).slice(0, STAND_OUT_MAX).map((x) => {
    named.add(x.item.category)
    return x.item
  })

  // A first month (no history to compare with): where the money went, the
  // biggest few.
  const biggest = history ? [] : rows.filter((r) => r.kind === 'expense' && r.now > 0)
    .sort((a, b) => b.now - a.now).slice(0, STAND_OUT_MAX)
    .map((r) => {
      named.add(r.name)
      return { category: r.name, this_month: money(r.now) }
    })

  // Budgets nearly used or over, the most used first.
  const budgets = rows
    .filter((r) => r.kind === 'expense' && r.c.budget != null && r.c.budget > 0 && r.now >= r.c.budget * BUDGET_NEAR)
    .sort((a, b) => b.now / b.c.budget! - a.now / a.c.budget!)
    .map((r) => {
      named.add(r.name)
      const cap = r.c.budget!
      return { category: r.name, budget: money(cap), spent: money(r.now),
        ...(r.now > cap ? { over_by: money(r.now - cap) } : { left: money(cap - r.now) }) }
    })

  // The salary, once it's in (the caller's salary category, as Home counts it).
  const salaryRow = rows.find((r) => r.kind === 'income' && r.c.id && r.c.id === o.totals.salary_category_id)
  const salaryIn = salaryRow && salaryRow.now > 0 ? salaryRow : null
  if (salaryIn) named.add(salaryIn.name)

  const facts: Record<string, unknown> = {
    month,
    month_in_progress: inProgress,
    spending: {
      this_month: money(spent.now),
      ...(history ? { usual_month: money(spent.usual, true), last_month: money(spent.last) } : {}),
    },
    // No income yet: nothing said about it (it's never "missing").
    ...(earned.now > 0 ? {
      income: {
        this_month: money(earned.now),
        ...(history ? { usual_month: money(earned.usual, true), last_month: money(earned.last) } : {}),
        ...(salaryIn ? { salary_in: money(salaryIn.now) } : {}),
      },
    } : {}),
    ...(history ? { stand_out: standOut } : { biggest_categories: biggest }),
    budgets,
    ...(inProgress ? { coming_up: comingUp(o, { from: o.today, to: comingEnd(o), money, named }) } : {}),
  }
  const unnamed = new Set([...o.categories.map((c) => c.name), ...rows.map((r) => r.name)].filter((n) => n && !named.has(n)))
  return { facts, inProgress, check: { currency: cur, locale, figures: [...figures], named: [...named], unnamed: [...unnamed] } }
}

// The month's window (the server's; a calendar month for older totals).
function windowOf(totals: MonthTotals, today: string): Window {
  const w = totals.window
  return w?.from && w?.to
    ? { label: totals.month, from: w.from, to: w.to, open: !!w.open }
    : { label: totals.month, from: `${totals.month}-01`, to: lastDayOf(totals.month), open: totals.month >= today.slice(0, 7) }
}

// The user's pay calendar as far as the forecast needs it (D and today), or
// null with the salary setting off.
function calOf(totals: MonthTotals, today: string): Cal | null {
  const shift = salaryShiftOf(totals)
  return shift ? { fromDay: shift.fromDay, today, first: null, starts: {} } : null
}

// Where "still due this month" ends: the day before the next salary is
// expected (pay months), else the month's last day.
function comingEnd(o: { totals: MonthTotals; today: string; rules?: any[] }): string {
  const today = o.totals.today ?? o.today
  return expectedEnd(windowOf(o.totals, today), calOf(o.totals, today),
    paydayHints(o.rules, salaryShiftOf(o.totals), o.totals.last_pay_day ?? null))
}

// What's still due this month that moves the net (Plan's rule:
// planRules.isPlanRule): each active rule's next charge from today to the
// month's end (comingEnd), in the base currency, named by its category
// (rules without one are left out). The salary that opens the next month is
// never this month's. The biggest few, by date.
function comingUp(
  o: { totals: MonthTotals; today: string; categories: Category[]; rules?: any[]; categoryRows?: CategoryRow[] },
  w: { from: string; to: string; money: (m: number) => string; named: Set<string> },
) {
  const savings = savingsIdsOf(o.categoryRows ?? [])
  const shift = salaryShiftOf(o.totals)
  const labels = new Map(o.categories.map((c) => [c.id, c.name]))
  const start = windowOf(o.totals, o.totals.today ?? o.today).from
  const from = w.from < start ? start : w.from
  const opensNext = (r: any) => !!shift && r.kind === 'income' && r.category_id === shift.categoryId
    && opensMonth(r.next_run, shift.fromDay).label > o.totals.month
  return (o.rules ?? [])
    .filter((r) => r && isPlanRule(r, savings) && r.currency === o.totals.currency
      && typeof r.next_run === 'string' && r.next_run >= from && r.next_run <= w.to
      && !opensNext(r)
      && Number.isSafeInteger(Number(r.amount_minor)) && Number(r.amount_minor) > 0 && labels.has(r.category_id))
    .map((r) => ({ r, amount: Number(r.amount_minor) }))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, COMING_UP_MAX)
    .sort((a, b) => (a.r.next_run < b.r.next_run ? -1 : a.r.next_run > b.r.next_run ? 1 : 0))
    .map(({ r, amount }) => {
      const name = labels.get(r.category_id)!
      w.named.add(name)
      const kind = planKindOf(r, savings)
      return { name, kind: kind === 'expense' ? 'payment' : kind, amount: w.money(amount), day: Number(r.next_run.slice(8, 10)) }
    })
}

export function summaryAsk(o: Parameters<typeof monthFacts>[0]): Ask & { check: FigureCheck } {
  const { facts, inProgress, check } = monthFacts(o)
  return {
    system: [
      'You write the "month in short" card of a personal finance app: at most 3 short sentences about one month of',
      'someone\'s money, from the facts in the JSON document.',
      `Write in ${o.lang === 'el' ? 'Greek (informal "εσύ" form)' : 'English'}, in plain everyday words.`,
      'Each sentence is one concrete observation worth reading, picked in this order:',
      '1) what is notably different this month: stand_out (categories already above both a usual month and last month,',
      'or once the month is over below both), or in a first month with nothing to compare biggest_categories (where',
      'the money went), and budgets (over, or nearly used);',
      '2) what is still due this month and matters: coming_up (recurring payments, income and savings with their day of',
      'the month);',
      '3) how the month is going: income this month (say the salary is in when income.salary_in is given) against',
      'spending, compared with a usual month.',
      'Fewer sentences are better than a weak one: one or two is fine when there is little to say.',
      'Only mention categories, budgets and payments named in the document, and only say what its fields support.',
      'Never say a category is quiet or low or has little or no activity or spending; never say how many days are left;',
      'never say the salary or any income is missing, late or not in yet; never mention budgets that are not listed.',
      inProgress
        ? 'The month is still going: this_month figures are so far, while usual_month and last_month are whole months,'
          + ' so a figure above them is "already" above ("already €70.00 more than a usual month"); never call a total'
          + ' final.'
        : 'The month is over: its figures are final.',
      'Every amount in the document is already formatted: copy the ones you use exactly as written, with their',
      'symbol, separators and decimals. Never write any other amount (no sums of your own, no rounding, no',
      'reformatting), and keep each amount with its own meaning (above_usual_by is a difference, not a total).',
      'Never judge, and give no financial advice. Each sentence at most 20 words, with no bullets, markdown or emoji.',
      DATA_ONLY,
    ].join(' '),
    user: JSON.stringify(facts),
    schema: {
      type: 'object',
      properties: { lines: { type: 'array', items: { type: 'string' } } },
      required: ['lines'],
      additionalProperties: false,
    },
    maxTokens: 500,
    check,
  }
}

// Lines that say nothing useful, or claim what the facts never support
// (the facts leave out quiet categories, day counts and income not yet in).
const FILLER = [
  /\b(?:little|low|minimal|no|light) (?:activity|spending)\b/i,
  /\bquiet\b/i,
  /\b\d+ (?:more )?days? (?:left|remaining|to go)\b/i,
  /\bdays? (?:left|remaining)\b/i,
  /\b(?:has|have)n['’]?t (?:arrived|come in|been paid|landed)\b/i,
  /\bnot (?:arrived|come in|been paid|in|here) yet\b/i,
  /\byet to (?:arrive|come in|be paid)\b/i,
  /\ball (?:your |the |of your )?budgets\b/i,
  /(?:απομένουν|μένουν|υπολείπονται) \d+ (?:μέρες|ημέρες)/i,
  /\d+ (?:μέρες|ημέρες) (?:ακόμα|ακόμη|απομένουν|μένουν)/i,
  /δεν έχει (?:έρθει|μπει|φτάσει|πληρωθεί|μπη)/i,
  /(?:λίγη|ελάχιστη|καμία|χαμηλή) (?:κίνηση|δραστηριότητα)/i,
]

const escapeRe = (v: string) => v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const wordRe = (name: string) => new RegExp(String.raw`(?<![\p{L}\p{N}])${escapeRe(name)}(?![\p{L}\p{N}])`, 'giu')

// Does the line name a category the facts don't mention? Names it may use
// are taken out first, so "Food delivery" (named) doesn't count as "Food".
function namesOthers(line: string, check: FigureCheck): boolean {
  let rest = line
  for (const n of [...check.named].sort((a, b) => b.length - a.length)) rest = rest.replace(wordRe(n), ' ')
  return check.unnamed.some((n) => wordRe(n).test(rest))
}

// month_summary's answer → 1–3 plain lines (bullets and markdown stripped,
// each cut to SUMMARY_LINE_MAX at a word), or null when nothing usable is left.
// A line is left out when it quotes an amount it wasn't given, exactly as
// formatted (`check`: "€1030" for "€1,030.00", or a sum of its own), names a
// category the facts don't mention, or is filler (FILLER).
export function normaliseSummary(json: any, check: FigureCheck): string[] | null {
  const given = new Set(check.figures.flatMap((f) => moneyInLine(f, check.currency, check.locale)))
  const lines = (Array.isArray(json?.lines) ? json.lines : [])
    .map((l: unknown) => cleanText(l, 2000).replace(/^(?:[-*•·]\s*|\d{1,2}[.)]\s+)/, '').replace(/[*_`#]+/g, '').trim())
    .filter((l: string) => l && moneyInLine(l, check.currency, check.locale).every((n) => given.has(n))
      && !FILLER.some((re) => re.test(l)) && !namesOthers(l, check))
    .slice(0, SUMMARY_LINES_MAX)
    .map((l: string) => {
      if (l.length <= SUMMARY_LINE_MAX) return l
      const cut = l.slice(0, SUMMARY_LINE_MAX - 1)
      return `${cut.slice(0, Math.max(cut.lastIndexOf(' '), 1))}…`
    })
  return lines.length ? lines : null
}
