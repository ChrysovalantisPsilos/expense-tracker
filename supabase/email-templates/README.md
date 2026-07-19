# Auth email templates

Branded HTML for Supabase Auth emails (the invite email is separate — it lives
in `supabase/functions/send-invite`).

These can't be applied via tooling — paste them into the dashboard:

**Supabase → Authentication → Emails → Templates**, then for each type pick the
template, replace the **Message body (HTML)** with the matching file here, and
set a subject:

| Template | File | Suggested subject |
| --- | --- | --- |
| Confirm signup | `confirm-signup.html` | `Confirm your email · Budge` |
| Reset password | `reset-password.html` | `Reset your Budge password` |
| Magic Link | `magic-link.html` | `Your Budge sign-in link` |

Notes:
- These are HTML **fragments** (no `<!doctype>`/`<html>`/`<body>` wrapper) —
  Supabase's template editor preview hangs on a full HTML document, so paste
  the fragment as-is.
- Each uses Supabase's `{{ .ConfirmationURL }}` variable for the action link —
  don't change it.
- Design matches the app: coral (`#f95d38`) wordmark + button on warm neutrals,
  text-only (no images) so it renders everywhere and never gets blocked.
- After pasting, use the dashboard's "Send test email" to preview.
