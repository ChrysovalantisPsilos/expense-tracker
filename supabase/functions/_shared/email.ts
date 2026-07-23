// Shared transactional-email helpers: HTML escaping and the brand email shell
// (budgeer wordmark + white card on a sand background). Callers pass the card's
// inner HTML (already escaped) and an optional footer line.

export function esc(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

const DEFAULT_FOOTER = 'Budgeer · your money, your friends, sorted'

// Wrap trusted, already-escaped `inner` HTML in the brand shell. `footer` is
// plain HTML shown in the muted footer row (defaults to the brand tagline).
export function brandEmail(opts: { inner: string; footer?: string }): string {
  const footer = opts.footer ?? DEFAULT_FOOTER
  return `<!doctype html><html><body style="margin:0;background:#faf8f4;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#faf8f4;padding:24px 12px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;">
        <tr><td style="padding:8px 8px 18px;">
          <span style="font-size:24px;font-weight:800;color:#f95d38;letter-spacing:-0.02em;">budgeer</span>
        </td></tr>
        <tr><td style="background:#ffffff;border:1px solid #ece7df;border-radius:16px;padding:32px;">
          ${opts.inner}
        </td></tr>
        <tr><td style="padding:20px 8px;text-align:center;color:#9a8b72;font-size:12px;">${footer}</td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`
}
