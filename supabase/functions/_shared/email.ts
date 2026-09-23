// The one branded layout for every email the edge functions send (group
// invites, notification emails, the GDPR notices in gdprEmails.ts). Supabase
// Auth's own emails are separate (supabase/email-templates).
//
// Callers pass plain text only: every value is HTML-escaped here, so nothing
// a user typed (a group or display name) can inject markup. The result has an
// HTML body and a plain-text alternative (Resend's `text`).
//
// Look: the budgeer mark + wordmark over a white rounded card on sand, Poppins
// headings (falling back to the system sans), a coral button. Colours meet
// WCAG AA contrast (test/email.test.js), and clients that honour
// prefers-color-scheme get a matching dark palette; the rest keep the light
// one, which reads fine when a client inverts it.

export function esc(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

// [light, dark] per role; each text colour is checked against its surface.
export const EMAIL_COLORS = {
  canvas: ['#faf8f4', '#1a1714'],
  card: ['#ffffff', '#232019'],
  border: ['#e8e1d5', '#352f26'],
  heading: ['#242019', '#f6f2ea'],
  body: ['#5f5545', '#d6ccba'],
  muted: ['#7c6f59', '#b8ab94'],
  link: ['#bd3418', '#ffa088'],
  button: ['#d63d1b', '#d63d1b'],
  buttonText: ['#ffffff', '#ffffff'],
} as const

const TAGLINE = 'Budgeer · your money, your friends, sorted'
const HEAD_FONT = "Poppins,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif"
const BODY_FONT = "'Nunito Sans',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif"

export interface BrandEmail {
  // Absolute app origin (APP_ORIGIN); the header mark is served from it.
  origin: string
  heading: string
  // Each entry is a paragraph, or — as an array — a bulleted list.
  paragraphs: (string | string[])[]
  // Labelled links listed under the paragraphs (e.g. the legal documents).
  links?: { label: string; url: string }[]
  cta?: { label: string; url: string }
  // Also print the CTA's URL under the button (for clients that block links).
  showLink?: boolean
  // Extra footer lines under the tagline.
  footer?: string[]
}

export function brandEmail(opts: BrandEmail): { html: string; text: string } {
  const C = Object.fromEntries(Object.entries(EMAIL_COLORS).map(([k, v]) => [k, v[0]])) as Record<keyof typeof EMAIL_COLORS, string>
  const D = Object.fromEntries(Object.entries(EMAIL_COLORS).map(([k, v]) => [k, v[1]])) as Record<keyof typeof EMAIL_COLORS, string>
  const origin = opts.origin.replace(/\/+$/, '')
  const footer = [TAGLINE, ...(opts.footer ?? [])]
  const paras = opts.paragraphs.map((p) => Array.isArray(p)
    ? `<ul class="bb-body" style="margin:0 0 16px;padding:0 0 0 20px;font-family:${BODY_FONT};font-size:15px;line-height:1.6;color:${C.body};">${p.map((li) => `<li style="margin:0 0 6px;">${esc(li)}</li>`).join('')}</ul>`
    : `<p class="bb-body" style="margin:0 0 16px;font-family:${BODY_FONT};font-size:15px;line-height:1.6;color:${C.body};">${esc(p)}</p>`).join('')
  const links = opts.links?.length
    ? `<div style="margin:0 0 16px;">${opts.links.map((l) =>
      `<p class="bb-body" style="margin:0 0 6px;font-family:${BODY_FONT};font-size:15px;line-height:1.6;color:${C.body};">${esc(l.label)}: <a class="bb-link" href="${esc(l.url)}" style="color:${C.link};word-break:break-all;">${esc(l.url)}</a></p>`).join('')}</div>`
    : ''
  const cta = opts.cta && `
          <table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 0;"><tr>
            <td style="border-radius:10px;background:${C.button};">
              <a href="${esc(opts.cta.url)}" style="display:inline-block;padding:13px 26px;font-family:${BODY_FONT};font-size:15px;font-weight:700;color:${C.buttonText};text-decoration:none;border-radius:10px;">${esc(opts.cta.label)}</a>
            </td>
          </tr></table>`
  const link = opts.cta && opts.showLink
    ? `<p class="bb-muted" style="margin:24px 0 0;font-family:${BODY_FONT};font-size:13px;line-height:1.5;color:${C.muted};">Or paste this link into your browser:<br><a class="bb-link" href="${esc(opts.cta.url)}" style="color:${C.link};word-break:break-all;">${esc(opts.cta.url)}</a></p>`
    : ''

  const html = `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light dark">
<meta name="supported-color-schemes" content="light dark">
<title>${esc(opts.heading)}</title>
<style>
  :root { color-scheme: light dark; supported-color-schemes: light dark; }
  @media (prefers-color-scheme: dark) {
    .bb-canvas { background: ${D.canvas} !important; }
    .bb-card { background: ${D.card} !important; border-color: ${D.border} !important; }
    .bb-heading { color: ${D.heading} !important; }
    .bb-body { color: ${D.body} !important; }
    .bb-muted { color: ${D.muted} !important; }
    .bb-link { color: ${D.link} !important; }
  }
</style>
</head>
<body class="bb-canvas" style="margin:0;padding:0;background:${C.canvas};">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${esc(opts.paragraphs.find((p) => typeof p === 'string') ?? opts.heading)}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" class="bb-canvas" style="background:${C.canvas};">
    <tr><td align="center" style="padding:28px 12px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;">
        <tr><td style="padding:0 8px 18px;">
          <table role="presentation" cellpadding="0" cellspacing="0"><tr>
            <td style="vertical-align:middle;padding-right:8px;"><img src="${esc(origin)}/email-mark.png" width="32" height="32" alt="" style="display:block;border:0;"></td>
            <td class="bb-heading" style="vertical-align:middle;font-family:${HEAD_FONT};font-size:24px;font-weight:700;letter-spacing:-0.02em;color:${C.heading};">budgeer</td>
          </tr></table>
        </td></tr>
        <tr><td class="bb-card" style="background:${C.card};border:1px solid ${C.border};border-radius:16px;padding:32px;">
          <h1 class="bb-heading" style="margin:0 0 12px;font-family:${HEAD_FONT};font-size:21px;line-height:1.3;font-weight:600;color:${C.heading};">${esc(opts.heading)}</h1>
          ${paras}${links}${cta ?? ''}${link}
        </td></tr>
        <tr><td class="bb-muted" style="padding:20px 8px;text-align:center;font-family:${BODY_FONT};font-size:12px;line-height:1.6;color:${C.muted};">${footer.map(esc).join('<br>')}</td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`

  const text = [
    opts.heading,
    ...opts.paragraphs.map((p) => (Array.isArray(p) ? p.map((li) => `- ${li}`).join('\n') : p)),
    ...(opts.links ?? []).map((l) => `${l.label}: ${l.url}`),
    ...(opts.cta ? [`${opts.cta.label}: ${opts.cta.url}`] : []),
    `--\n${footer.join('\n')}`,
  ].join('\n\n')

  return { html, text }
}
