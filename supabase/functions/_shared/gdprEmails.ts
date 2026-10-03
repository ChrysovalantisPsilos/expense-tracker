// The GDPR service notices Budgeer emails a user, as pure templates: each
// returns { subject, html, text } in the shared branded layout (brandEmail
// escapes every value). Sent regardless of the notification switches — they
// are about the account and its personal data, not marketing — so each one
// says why it was sent, and where to ask (the privacy address).
//
// Plain by design: no amounts, descriptions, group names or anything else
// from the account. Dates are in UTC and say so.
//
// Who sends what:
//   legalUpdateEmail           privacy-emails (legal sweep, hourly)
//   consentChangeEmail         privacy-emails (queue, coalesced 15 min)
//   dataExportEmail            privacy-emails (queue, ≤ 1 an hour)
//   startFreshEmail            privacy-emails (queue, ≤ 1 an hour; start_fresh, 0114)
//   accountDeletedEmail        delete-account, after the deletion succeeded
//   inactivityWarningEmail     purge-inactive, 23 months without use
//   inactiveAccountDeletedEmail purge-inactive, after the deletion succeeded
//   privacyReceiptEmail        privacy-request, after the inbox accepted it

import { brandEmail } from './email.ts'
import { DELETION_SCOPE } from './accountDeletion.ts'
import { INACTIVITY, addMonthsUTC, formatDay } from './inactivity.ts'
import { CONSENT_LABELS } from './legal.ts'

export interface NoticeContext {
  origin: string        // APP_ORIGIN, no trailing slash
  privacyEmail: string  // PRIVACY_EMAIL
}

export interface Notice { subject: string; html: string; text: string }

const WHY_ACCOUNT = 'You’re getting this service email because it’s about your Budgeer account and your personal data. We send these even if you’ve turned other emails off.'
const WHY_DELETED = 'You’re getting this one-off confirmation because the Budgeer account for this address was deleted. It’s the last email we’ll send you.'

function contactLine(ctx: NoticeContext): string {
  return `Questions about your data? Reply to this email or write to ${ctx.privacyEmail}.`
}

function notice(ctx: NoticeContext, subject: string, body: {
  heading?: string
  paragraphs: (string | string[])[]
  links?: { label: string; url: string }[]
  cta?: { label: string; url: string }
  why: string
}): Notice {
  const { html, text } = brandEmail({
    origin: ctx.origin,
    heading: body.heading ?? subject,
    paragraphs: body.paragraphs,
    links: body.links,
    cta: body.cta,
    footer: [body.why, contactLine(ctx)],
  })
  return { subject, html, text }
}

// "23 September 2026 at 14:05 UTC"
export function formatDateTimeUTC(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${formatDay(d)} at ${p(d.getUTCHours())}:${p(d.getUTCMinutes())} UTC`
}

// A privacy request must be answered within one month of receipt (GDPR
// Art. 12(3)), clamped to the month's length (31 Jan → 28/29 Feb), in UTC.
export function requestDeadline(receivedAt: Date): Date {
  return addMonthsUTC(receivedAt, 1)
}

// "23 September 2026" for a version string ("2026-09-23").
function versionDay(version: string): string {
  return formatDay(new Date(`${version}T00:00:00Z`))
}

// ---------------------------------------------------------------------------
// 1. The Privacy Notice and/or Terms of Use changed.
// ---------------------------------------------------------------------------
export function legalUpdateEmail(ctx: NoticeContext, o: {
  change: { version: string; summary: string }
  privacy: boolean   // the Privacy Notice changed (and isn't accepted yet)
  terms: boolean     // the Terms of Use changed (and aren't accepted yet)
}): Notice {
  const docs = o.privacy && o.terms ? 'Privacy Notice and Terms of Use'
    : o.terms ? 'Terms of Use' : 'Privacy Notice'
  return notice(ctx, `We’ve updated our ${docs}`, {
    paragraphs: [
      `We’ve updated Budgeer’s ${docs}. The new version applies from ${versionDay(o.change.version)}.`,
      `What’s changed: ${o.change.summary}`,
      'Next time you open Budgeer, we’ll ask you to accept the update before you carry on. If you don’t agree, that screen also lets you download your data and delete your account.',
    ],
    links: [
      { label: 'Privacy Notice', url: `${ctx.origin}/privacy` },
      { label: 'Terms of Use', url: `${ctx.origin}/terms` },
    ],
    cta: { label: 'Open Budgeer', url: `${ctx.origin}/` },
    why: WHY_ACCOUNT,
  })
}

// ---------------------------------------------------------------------------
// 2 and 3. The account was deleted — by its owner, or after inactivity.
// ---------------------------------------------------------------------------
function deletionScope(): (string | string[])[] {
  return [
    'What was deleted:',
    DELETION_SCOPE.deleted,
    'What stays for your groups:',
    DELETION_SCOPE.stays,
    DELETION_SCOPE.backups,
  ]
}

export function accountDeletedEmail(ctx: NoticeContext, o: { deletedAt: Date }): Notice {
  return notice(ctx, 'Your Budgeer account has been deleted', {
    paragraphs: [
      `Your Budgeer account and data were deleted on ${formatDay(o.deletedAt)}, as you asked.`,
      ...deletionScope(),
      `If you didn’t ask for this, write to ${ctx.privacyEmail} straight away.`,
    ],
    why: WHY_DELETED,
  })
}

export function inactiveAccountDeletedEmail(ctx: NoticeContext, o: { deletedAt: Date; warnedAt?: Date | null }): Notice {
  const warned = o.warnedAt ? ` We emailed this address a warning on ${formatDay(o.warnedAt)}.` : ''
  return notice(ctx, 'Your inactive Budgeer account has been deleted', {
    paragraphs: [
      `Your Budgeer account and data were deleted on ${formatDay(o.deletedAt)}, because the account hadn’t been used for ${INACTIVITY.deleteAfterMonths} months.${warned}`,
      ...deletionScope(),
      'You’re welcome to sign up again at any time; a new account starts empty.',
    ],
    why: WHY_DELETED,
  })
}

// The warning that comes first (23 months without use).
export function inactivityWarningEmail(ctx: NoticeContext, o: { deleteOn: string }): Notice {
  return notice(ctx, 'Your Budgeer account will be deleted soon', {
    paragraphs: [
      'Your Budgeer account hasn’t been used for almost two years. To avoid keeping personal data longer than needed, we delete accounts after two years without use.',
      `To keep your account, just sign in before ${o.deleteOn}. If you do nothing, your account and its data will be deleted on or shortly after that date. You can download a copy of your data from Settings → Privacy first.`,
    ],
    cta: { label: 'Sign in to Budgeer', url: `${ctx.origin}/login` },
    why: WHY_ACCOUNT,
  })
}

// ---------------------------------------------------------------------------
// 4. A copy of the data was downloaded (export_my_data).
// ---------------------------------------------------------------------------
export function dataExportEmail(ctx: NoticeContext, o: { lastAt: Date; count: number }): Notice {
  const when = formatDateTimeUTC(o.lastAt)
  const first = o.count > 1
    ? `A copy of your Budgeer data was downloaded ${o.count} times since our last email about it, most recently on ${when} (Settings → Privacy → Download my data).`
    : `A copy of your Budgeer data was downloaded on ${when} (Settings → Privacy → Download my data).`
  return notice(ctx, 'A copy of your Budgeer data was downloaded', {
    paragraphs: [
      first,
      'If that was you, there’s nothing to do. The file isn’t password-protected, so keep it somewhere safe.',
      `If it wasn’t you, change your password now (Settings → Security) and tell us at ${ctx.privacyEmail}.`,
    ],
    cta: { label: 'Open security settings', url: `${ctx.origin}/settings/security` },
    why: WHY_ACCOUNT,
  })
}

// ---------------------------------------------------------------------------
// 4b. The account's data was cleared (Settings → Your data → Start fresh).
// ---------------------------------------------------------------------------
export function startFreshEmail(ctx: NoticeContext, o: { lastAt: Date; count: number }): Notice {
  const when = formatDateTimeUTC(o.lastAt)
  const first = o.count > 1
    ? `Your Budgeer data was cleared ${o.count} times since our last email about it, most recently on ${when} (Settings → Your data → Start fresh).`
    : `Your Budgeer data was cleared on ${when} (Settings → Your data → Start fresh).`
  return notice(ctx, 'Your Budgeer data was cleared', {
    paragraphs: [
      first,
      'Your own entries, recurring payments, budgets, plan, savings accounts and goals, salary corrections, meal vouchers, import rules and notifications were deleted, and your categories are back to the defaults. Your account, settings and groups stay.',
      'If that was you, there’s nothing to do. If you saved a backup first, you can restore it from Settings → Your data.',
      `If it wasn’t you, change your password now (Settings → Security) and tell us at ${ctx.privacyEmail}.`,
    ],
    cta: { label: 'Open security settings', url: `${ctx.origin}/settings/security` },
    why: WHY_ACCOUNT,
  })
}

// ---------------------------------------------------------------------------
// 5. The consent switches changed — the state they ended up in.
// ---------------------------------------------------------------------------
// profiles column → consents purpose (0072's log_preference_consent).
const SWITCHES: [keyof ConsentSwitches, string][] = [
  ['notify_digest', 'weekly_digest'],
  ['notify_email', 'email_notifications'],
  ['notify_push', 'push_notifications'],
]
export interface ConsentSwitches { notify_digest: boolean; notify_email: boolean; notify_push: boolean }

export function consentChangeEmail(ctx: NoticeContext, o: { changedAt: Date; switches: ConsentSwitches }): Notice {
  return notice(ctx, 'Your Budgeer notification choices were changed', {
    paragraphs: [
      `Your choices for optional messages were changed on ${formatDateTimeUTC(o.changedAt)}. This is how they’re set now:`,
      SWITCHES.map(([col, purpose]) => `${CONSENT_LABELS[purpose]}: ${o.switches[col] ? 'on' : 'off'}`),
      'You can change them, and see your consent history, in Settings → Privacy.',
      `If you didn’t make this change, change your password (Settings → Security) and tell us at ${ctx.privacyEmail}.`,
    ],
    cta: { label: 'Open privacy settings', url: `${ctx.origin}/settings/privacy` },
    why: WHY_ACCOUNT,
  })
}

// ---------------------------------------------------------------------------
// 6. Receipt for a request sent with the in-app privacy request form.
// ---------------------------------------------------------------------------
export function privacyReceiptEmail(ctx: NoticeContext, o: { kindLabel: string; receivedAt: Date; message: string }): Notice {
  const by = formatDay(requestDeadline(o.receivedAt))
  return notice(ctx, 'We received your privacy request', {
    paragraphs: [
      `We received your privacy request on ${formatDateTimeUTC(o.receivedAt)}.`,
      `Request: ${o.kindLabel}`,
      `We’ll answer by ${by} at the latest — one month from receipt. If a request is complex, the law lets us take up to two more months; we’d tell you why before ${by}.`,
      'Your message:',
      o.message,
      `Our reply will come from ${ctx.privacyEmail} to this email address.`,
    ],
    why: WHY_ACCOUNT,
  })
}
