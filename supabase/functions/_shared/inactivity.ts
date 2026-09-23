// Inactive-account policy numbers and the "deleted on" date the warning email
// quotes. The SELECTION is authoritative in SQL (public.inactive_accounts,
// 0073); these constants are a LOCKSTEP copy of its intervals, checked by
// test/legal.test.js. No imports: the unit tests load this file directly.

export const INACTIVITY = {
  warnAfterMonths: 23,   // one warning email
  deleteAfterMonths: 24, // then deletion…
  minNoticeDays: 28,     // …but never sooner than this after the warning
}

// Calendar months, clamped to the target month's length (31 Jan + 1 → 28/29
// Feb), in UTC — Postgres' `timestamptz + interval 'n months'` does the same.
export function addMonthsUTC(d: Date, months: number): Date {
  const y = d.getUTCFullYear()
  const m = d.getUTCMonth() + months
  const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate()
  return new Date(Date.UTC(y, m, Math.min(d.getUTCDate(), last),
    d.getUTCHours(), d.getUTCMinutes(), d.getUTCSeconds(), d.getUTCMilliseconds()))
}

// The earliest moment the sweep may delete an account last active at
// `lastActive` and warned at `warnedAt`: 24 months after its last activity, or
// 28 days after the warning, whichever is later.
export function deletionDate(lastActive: Date, warnedAt: Date): Date {
  const byAge = addMonthsUTC(lastActive, INACTIVITY.deleteAfterMonths)
  const byNotice = new Date(warnedAt.getTime() + INACTIVITY.minNoticeDays * 86_400_000)
  return byAge > byNotice ? byAge : byNotice
}

// "23 October 2026" — the date as the email states it (UTC; the sweep runs
// daily, so the account goes on or shortly after that day).
export function formatDay(d: Date): string {
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
}
