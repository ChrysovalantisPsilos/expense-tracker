// Sending email through Resend — the one place the edge functions talk to
// api.resend.com — plus the environment every email needs: the app origin
// (links and the header mark), the senders and the privacy inbox.
//
// Three senders:
//   invite — INVITE_FROM: invites, group event emails, and privacy requests
//            forwarded to the privacy inbox;
//   notice — NOTICE_FROM (default "Budgeer <privacy@budgeer.com>", built from
//            PRIVACY_EMAIL), Reply-To the privacy address too: the GDPR
//            service notices (_shared/gdprEmails.ts). Recipients can simply
//            reply — it lands in the privacy inbox (the Reply-To keeps that
//            true if NOTICE_FROM is ever pointed elsewhere).
//   operator — OPERATOR_FROM (default "Budgeer <no-reply@budgeer.com>"): the
//            operator's daily sign-up digest (operator-digest).
// All are null without RESEND_API_KEY, so callers skip or fall back cleanly.
//
// Deno.env is read only inside functions: the unit tests load this file
// directly (no imports beyond ./contact.ts).

import { PRIVACY_EMAIL } from './contact.ts'

// Production origin; the TEST project sets APP_ORIGIN (https://dev.budgeer.com)
// in its function secrets. www: the apex redirects there.
export const DEFAULT_ORIGIN = 'https://www.budgeer.com'
export const DEFAULT_NOTICE_FROM = `Budgeer <${PRIVACY_EMAIL}>`
const DEFAULT_INVITE_FROM = 'Budgeer <onboarding@resend.dev>'
export const DEFAULT_OPERATOR_FROM = 'Budgeer <no-reply@budgeer.com>'

// Resend's default rate limit is 2 requests a second; loops pace themselves.
const SEND_GAP_MS = 550

export function normalizeOrigin(raw?: string | null): string {
  return (raw || DEFAULT_ORIGIN).replace(/\/+$/, '')
}

export function appOrigin(): string {
  return normalizeOrigin(Deno.env.get('APP_ORIGIN'))
}

// Where privacy-request forwards requests (PRIVACY_INBOX overrides, e.g. to
// test the form without writing to the real inbox).
export function privacyInbox(): string {
  return Deno.env.get('PRIVACY_INBOX') || PRIVACY_EMAIL
}

export interface Sender { apiKey: string; from: string; replyTo?: string }

export function inviteSender(): Sender | null {
  const apiKey = Deno.env.get('RESEND_API_KEY')
  return apiKey ? { apiKey, from: Deno.env.get('INVITE_FROM') || DEFAULT_INVITE_FROM } : null
}

export function noticeSender(): Sender | null {
  const apiKey = Deno.env.get('RESEND_API_KEY')
  return apiKey
    ? { apiKey, from: Deno.env.get('NOTICE_FROM') || DEFAULT_NOTICE_FROM, replyTo: PRIVACY_EMAIL }
    : null
}

export function operatorSender(): Sender | null {
  const apiKey = Deno.env.get('RESEND_API_KEY')
  return apiKey ? { apiKey, from: Deno.env.get('OPERATOR_FROM') || DEFAULT_OPERATOR_FROM } : null
}

export interface Mail { to: string; subject: string; html: string; text: string; replyTo?: string }

// One email. Never throws: { ok, id } from Resend, or { ok: false } with the
// failure logged (status 0 = the request itself failed).
export async function sendEmail(sender: Sender, mail: Mail): Promise<{ ok: boolean; status: number; id?: string }> {
  const replyTo = mail.replyTo ?? sender.replyTo
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${sender.apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: sender.from, to: [mail.to], subject: mail.subject, html: mail.html, text: mail.text,
        ...(replyTo ? { reply_to: replyTo } : {}),
      }),
    })
    if (!res.ok) {
      console.error('resend error', res.status, await res.text().catch(() => ''))
      return { ok: false, status: res.status }
    }
    const data = await res.json().catch(() => ({}))
    return { ok: true, status: res.status, id: data?.id }
  } catch (e) {
    console.error('resend request failed', e)
    return { ok: false, status: 0 }
  }
}

// Run `fn` over `items` one at a time, `gapMs` apart (Resend's rate limit).
export async function eachPaced<T>(items: T[], fn: (item: T) => Promise<void>, gapMs = SEND_GAP_MS): Promise<void> {
  for (let i = 0; i < items.length; i++) {
    if (i > 0 && gapMs > 0) await new Promise((r) => setTimeout(r, gapMs))
    await fn(items[i])
  }
}
