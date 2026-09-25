// Recurring rules in the user's base currency (pure, no I/O). One copy for the
// client and the edge functions: src/shared/lib/ruleFx.js re-exports this
// module and generate-report's statement imports it, so Home's Recurring card,
// the Recurring page, the Overview projection and the statement add foreign
// rules up the same way.
//
// A rule stores no exchange rate (each charge gets the ECB rate of its own date
// when it's made), so any total built from rules converts each foreign rule at
// the latest ECB rate: `rates` maps a currency to its rate into the base
// currency (major per major, as transactions.exchange_rate). The client reads
// them from Frankfurter (fx.js useLatestRates), the statement from the
// server's ECB cache (latest_fx_rates, 0086) — the same ECB reference rates.
//
// A rule whose currency has no rate (offline, unknown currency) is never added
// at face value: it's left out of the total and reported as missing, and the
// caller says so (missingRatesNote).

import { toBaseMinor } from './money.ts'

// deno-lint-ignore no-explicit-any
type Row = any
export type Rates = Record<string, number>

const rateOf = (rates: Rates | null | undefined, currency: string): number | null => {
  const r = Number(rates?.[currency])
  return r > 0 && Number.isFinite(r) ? r : null
}

// The foreign currencies among `rules` (sorted, unique): the rates to fetch.
export function foreignCurrencies(rules: Row[], base: string): string[] {
  return [...new Set((rules ?? []).map((r) => r.currency).filter((c) => c && c !== base))].sort()
}

// A rule as if it were in the base currency: a copy with amount_minor
// converted (toBaseMinor — exact integer maths, zero-decimal currencies
// right), currency = base and exchange_rate = the rate used. A base-currency
// rule is itself; a foreign one with no rate is null.
export function ruleInBase(rule: Row, base: string, rates: Rates | null | undefined): Row | null {
  if (!rule.currency || rule.currency === base) return rule
  const rate = rateOf(rates, rule.currency)
  if (rate == null) return null
  return {
    ...rule,
    amount_minor: toBaseMinor(rule.amount_minor, rate, rule.currency, base),
    currency: base,
    exchange_rate: rate,
  }
}

// `rules` split for a total:
//   rules      every rule that can be counted, in the base currency (input order)
//   missing    the foreign rules with no rate, as they are (own currency)
//   converted  some foreign rule was converted (say "at today's rate")
export function rulesInBase(
  rules: Row[], base: string, rates: Rates | null | undefined,
): { rules: Row[]; missing: Row[]; converted: boolean } {
  const out: Row[] = []
  const missing: Row[] = []
  let converted = false
  for (const r of rules ?? []) {
    const b = ruleInBase(r, base, rates)
    if (!b) missing.push(r)
    else {
      out.push(b)
      if (b !== r) converted = true
    }
  }
  return { rules: out, missing, converted }
}

// The line under a total that has foreign rules in it.
export const CONVERTED_NOTE = 'Other currencies converted at today’s rate.'

// "PLN 29.99 not included — no exchange rate right now." for the rules left
// out of a total (each charge in its own currency, `fmt(minor, currency)`), or
// null when none were.
export function missingRatesNote(missing: Row[], fmt: (minor: number, currency: string) => string): string | null {
  if (!missing?.length) return null
  return `${missing.map((r) => fmt(Number(r.amount_minor), r.currency)).join(', ')} not included — no exchange rate right now.`
}
