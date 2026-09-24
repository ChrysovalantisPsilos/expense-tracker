// The operator's daily sign-up digest (edge function operator-digest, 0079),
// as a pure template: { subject, html, text } in the shared branded layout.
// A count only — the day, the new sign-ups and the running total. It takes
// numbers and a date, nothing else, so no personal data can reach it.

import { brandEmail } from './email.ts'
import { formatDay } from './inactivity.ts'

export interface SignupDigest {
  day: string       // the UTC day counted, "2026-09-23"
  newCount: number  // accounts created that day (≥ 1: zero days send nothing)
  total: number     // accounts at the end of that day
}

const num = (n: number) => n.toLocaleString('en-GB')

// "1 new sign-up" / "3 new sign-ups"
export function signupsLabel(n: number): string {
  return `${num(n)} new sign-up${n === 1 ? '' : 's'}`
}

// "1 account" / "1,204 accounts"
function accountsLabel(n: number): string {
  return `${num(n)} account${n === 1 ? '' : 's'}`
}

export function signupDigestEmail(origin: string, d: SignupDigest): { subject: string; html: string; text: string } {
  const heading = `${signupsLabel(d.newCount)} yesterday`
  const { html, text } = brandEmail({
    origin,
    heading,
    paragraphs: [
      `${formatDay(new Date(`${d.day}T00:00:00Z`))} (UTC): ${signupsLabel(d.newCount)} · ${accountsLabel(d.total)} in total.`,
      'A count only: no names, email addresses or account ids. Sent only on days with at least one new sign-up.',
    ],
    footer: ['Daily sign-up digest for the Budgeer operator.'],
  })
  return { subject: `Budgeer: ${heading}`, html, text }
}
