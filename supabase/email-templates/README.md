# Auth email templates

Branded HTML for the Supabase Auth emails. The invite email and every other
Budgeer email are sent by edge functions instead (`supabase/functions`).

## Where they come from

The three `.html` files are **generated** — don't edit them by hand. They are
the shared branded layout (`brandEmail` in `supabase/functions/_shared/email.ts`,
the same one every edge-function email uses) rendered with Supabase's template
variables. The copy lives in `scripts/build-auth-emails.mjs`.

To change the copy or the look:

1. Edit the copy in `scripts/build-auth-emails.mjs`, or the layout in
   `supabase/functions/_shared/email.ts`.
2. Run `npm run emails:auth` to rewrite the files here.
3. Commit, then paste the changed templates into both projects (below).

`test/authEmails.test.js` fails if a committed file differs from what the
script renders, so the templates can't drift from the other emails.

## Pasting them into Supabase

Templates can't be applied via tooling. Do this on **both** projects —
**TEST/DEV** (`ctvdljzybbujuywppixo`, dev.budgeer.com) first, check it, then
**PROD** (`tuxfpylowcxazinqtrzx`, budgeer.com):

1. Open the project in the Supabase dashboard.
2. **Authentication → URL Configuration**: check the **Site URL** is the app
   origin with no trailing slash — `https://dev.budgeer.com` on TEST,
   `https://www.budgeer.com` on PROD. Every link in the emails is built from
   it: the buttons go to `{{ .SiteURL }}/auth/confirm?…` and the header mark
   is loaded from `{{ .SiteURL }}/email-mark.png`, so opening that address in
   a browser should show the budgeer mark. The **Redirect URLs** list needs
   no new entry for these links (the app verifies the token itself; nothing
   redirects through Supabase). Keep the entries that are there: links in
   emails sent before the switch still go through Supabase and redirect back.
3. **Authentication → Emails → Templates**. For each row in the table:
   1. Pick the template.
   2. Set the **Subject** to the suggested subject.
   3. Open the file here, select everything and paste it over the whole
      **Message body (HTML)**.
   4. Save.
4. **Authentication → Emails → SMTP settings**: the sender is set here, not in
   the templates — `Budgeer <no-reply@budgeer.com>` on PROD. TEST currently
   shows the sender name `Budgeer (DEV)`, which keeps test mail easy to tell
   apart.
5. Trigger each email for real to check it (sign up with a new address, use
   "Forgot password", and request a sign-in link), in a light and a dark
   mail client if you can.

| Template | File | Suggested subject |
| --- | --- | --- |
| Confirm signup | `confirm-signup.html` | `Confirm your email · Budgeer` |
| Reset password | `reset-password.html` | `Reset your Budgeer password` |
| Magic link | `magic-link.html` | `Your Budgeer sign-in link` |

## Notes

- These are HTML **fragments** (no `<!doctype>`/`<html>`/`<body>` wrapper):
  Supabase's template editor preview hangs on a full HTML document, so paste
  the fragment as-is.
- The fragment starts with the dark-mode `<style>` block, since there's no
  `<head>` to put it in. Clients that honour `prefers-color-scheme` get the
  dark palette from it; clients that drop a `<style>` block (e.g. some
  webmail) keep the inline light styles, which read fine on their own.
- The button and the "paste this link" line go to our own site —
  `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=<type>`
  (`signup`, `recovery`, `magiclink`) — not to Supabase's
  `{{ .ConfirmationURL }}`, which points at `<project>.supabase.co`: a link to
  another domain than the sender's (budgeer.com) is a classic phishing
  signal, and it put the emails in Outlook's junk folder. The app's
  `/auth/confirm` page verifies the token with Supabase Auth
  (`src/features/auth/confirmLink.js`, `ConfirmLink.jsx`). The test fails if
  a template links anywhere but `{{ .SiteURL }}`.
- `{{ .SiteURL }}` and `{{ .TokenHash }}` are Supabase variables — they must
  stay exactly as written. The generator puts them in after rendering, so the
  layout's HTML escaping never touches them (the `&` between the link's
  parameters is written `&amp;`, as HTML wants; mail clients show `&`).
- The app uses no invite or change-email emails from Supabase Auth (group
  invites are sent by the `send-invite` edge function), so those templates
  are left at Supabase's defaults.
- The leading `<!-- Generated … -->` comment is harmless: mail clients don't
  show HTML comments.
