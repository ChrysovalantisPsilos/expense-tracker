# Budgeer — GDPR record of processing and breach response

Internal record (GDPR Art. 30, 5(2) accountability). Keep it in step with the
Privacy Notice (`src/features/privacy/Privacy.jsx`), the Terms
(`src/features/privacy/Terms.jsx`), the migrations and the edge functions.
Whenever a table, column, processor or retention period changes, update this
file in the same change; a material change to the notice also needs a new
`LEGAL_VERSIONS` + `current_legal_versions()` (users are asked to re-accept).

## 1. Controller

| | |
| --- | --- |
| Controller | Budgeer (Belgium) — a one-person hobby project |
| Contact for data protection | privacy@budgeer.com (all data-subject requests) |
| General support | support@budgeer.com (never for data-subject requests) |
| DPO | Not appointed (not required: no large-scale monitoring or special-category processing as a core activity) |
| Law | GDPR; Belgian Act of 30 July 2018 on the protection of natural persons with regard to the processing of personal data |
| Supervisory authority | Belgian Data Protection Authority (APD/GBA), Rue de la Presse 35 / Drukpersstraat 35, 1000 Brussels · contact@apd-gba.be · +32 2 274 48 00 · www.dataprotectionauthority.be |
| Children | Service not intended for under-16s (product policy; Belgium's age of digital consent is 13, but no processing relies on a child's consent) |

## 2. Data subjects

Registered users; friends a user adds to a group by name (non-users,
"phantom" members); people a user invites by email; visitors of budgeer.com
(request logs only).

## 3. Record of processing — by table

"Enc" = encrypted at rest with pgcrypto and a key in Supabase Vault
(0046/0047/0050). All public tables have RLS. Retention "account" = kept until
the owner deletes it or the account (and at most until the inactivity sweep).

| Table | Personal data (columns) | Purpose | Legal basis (Art. 6) | Retention | Who can access |
| --- | --- | --- | --- | --- | --- |
| `auth.users` (Supabase Auth) | email, password hash, providers, created/last sign-in, raw_user_meta_data (Google name/picture; `accepted_privacy/terms` versions; `password_set` when a Google account adds a password) | Accounts and sign-in | (b) contract | account | owner (own session), operator (admin) |
| `auth.identities` (Supabase Auth) | each sign-in method linked to the account (email; Google: its account id, email, name, picture), when linked/last used; unlinked from Settings → Security | Sign-in with more than one method | (b) contract | account (an unlinked method's row is deleted) | owner (own session), operator |
| `auth.sessions`, `auth.refresh_tokens` | IP, user agent, timestamps | Keep users signed in, security | (f) security | until sign-out/expiry (Supabase-managed) | Supabase, operator |
| `auth.webauthn_credentials` | passkey name, public key, last used | Passkey sign-in | (b) | account | owner, operator |
| `auth.audit_log_entries` | sign-in events, IP | Security | (f) | 30 days (0073 purge, if stored in DB) | operator |
| `profiles` | display_name, avatar_url, base_currency, notification switches (`notify_email`, `notify_push`, `notify_digest`), onboarding/tour/pref flags, payment IBAN/Revolut/PayPal (enc) | Profile, settings, settling up | (b); digest (a) consent | account | owner; co-members see name/picture and payment details |
| `consents` (0072) | purpose, version, granted, source, server timestamp | Prove acceptance/consent (Art. 7(1)) | (c) | account | owner (read), written only by server paths |
| `categories`, `category_rules` | names, patterns | Organise own records | (b) | account | owner |
| `transactions` | amount/description/notes (enc), currency, rate, date, category, account, group link | Expense/income tracking | (b) | account | owner |
| `accounts`, `budgets`, `savings_goals`, `recurring_rules` | names; balances/amounts/targets (enc); schedule | Personal finance features | (b) | account | owner |
| `groups` | name, picture, owner | Bill splitting | (b); for non-users (f) | until the group is deleted | members |
| `group_members` | display_name, user link, former_user_id, role | Who is in a group | (b)/(f) | group lifetime; on account deletion renamed "Former member" and unlinked (0072) | members |
| `group_expenses`, `expense_splits`, `settlements` | amounts, descriptions, notes (enc), payer, shares, dates | Shared ledger and balances | (b)/(f) | group lifetime (other members rely on it) | members |
| `group_comments` | body (enc), author | Discussion on expenses | (b) | group lifetime; deleted with the author's account | members |
| `group_audit_log` | actor name, action, summary/amount (enc) | Transparency of group changes | (f) | 2 years (0073) ; actor name anonymised on account deletion | members |
| `group_invites` | invited_email, token, inviter, timestamps | Invitations | (f) inviter's and invitee's interest | link ≤ 24 h, row purged 7 days after expiry (0022) | group members (RLS), invitee via token |
| `notifications` | title/body (names, never amounts), actor | In-app notices; push/email fan-out | (b); digest (a) | 90 days (0073) | recipient |
| `push_subscriptions` | endpoint, keys | Web push delivery | (b) + browser permission | until unsubscribed/expired/account deletion | owner (own rows), server |
| `inactivity_notices` (0073) | warned_at | Avoid repeat warnings; notice before deletion | (c) Art. 5(1)(e) | until the account is used again or deleted | owner (read), server |
| `privacy_email_queue` (0076) | kind (consent change / data export), event and send timestamps, pending count | Coalesce the security notices (§ 6a) | (f) security; (c) | row kept per kind while the account exists (holds only timestamps) | server only (exported to the owner) |
| `legal_update_notices` (0076) | Privacy/Terms versions last emailed about, when | Email each user once per legal-document update | (c) Art. 12–13 | account | server only (exported to the owner) |
| `rate_limits` | key (uid or email hash), counters | Abuse prevention | (f) | ≤ 2 days (0058), backstop 30 days (0073) | server only |
| `fx_rates`, `fx_fetches` | none (currency rates) | Currency conversion | — | — | server |
| Storage `avatars/<uid>/`, `group-images/<gid>/` | profile and group pictures (public URLs) | Display | (b) | removed on account/group deletion | anyone with the link |
| Browser storage (no cookies) | Supabase session token, service-worker cache of recent reads, appearance/view prefs, prompt flags, pending invite token, FX cache | Strictly necessary / user-requested (ePrivacy Art. 5(3) exemption) | — | session token and cache cleared on sign-out | the user's device |

## 4. Processors and recipients

| Recipient | Role | Data | Location | Transfer safeguard |
| --- | --- | --- | --- | --- |
| Supabase, Inc. | Processor (DB, Auth, Storage, Edge Functions, Vault) | everything above | AWS eu-west-3 (Paris) for both TEST and PROD; US company (support access) | Supabase DPA + SCCs |
| Vercel Inc. | Processor (static hosting, CDN) | IP, request logs | global edge incl. US | Vercel DPA + SCCs (DPF if certified — verify) |
| Resend (Plus Five Five, Inc.) | Processor (email) | recipient address, email content (invites, group event emails, the service notices of § 6a, privacy-request form) | sending region eu-west-1 (Ireland); US company; open/click tracking off | Resend DPA + SCCs |
| Google | Independent controller (OAuth sign-in; avatar images on googleusercontent.com) | identity, IP when avatar loads | global | Google's terms; DPF |
| Browser push services (FCM, Mozilla, Apple, Microsoft) | Deliver encrypted push payloads | endpoint, timing | global | payload end-to-end encrypted (RFC 8291) |
| Frankfurter (frankfurter.dev) | Independent service (ECB rates) | currency codes, date, user's IP (browser call) | unknown | no contract; no user identifiers sent |
| Revolut / PayPal | Only on user tap | friend's handle + amount in a link | — | user-initiated |

## 5. Automatic retention jobs (pg_cron, scheduled by the migrations)

| Job | Schedule (UTC) | Does |
| --- | --- | --- |
| `gdpr-retention` | 04:15 daily | `purge_expired_personal_data()`: notifications > 90 days, audit log > 2 years, rate limits > 30 days, auth audit log > 30 days, spent inactivity warnings |
| `inactive-accounts` | 04:45 daily | `run_inactivity_sweep()` → edge function `purge-inactive`: warns at 23 months without use (one email, recorded), deletes at 24 months and ≥ 28 days after the warning, via the same code as delete-account |
| `privacy-email-queue` | every 5 min | `run_privacy_email_queue()` → edge function `privacy-emails` (mode `queue`), only when a notice is due |
| `legal-update-emails` | hourly at :20 | `run_legal_update_sweep()` → edge function `privacy-emails` (mode `legal`), only when someone still needs the update email |
| `purge-expired-invites` | 03:30 daily | invites 7 days after expiry |
| `purge-rate-limits` | 03:45 daily | rate-limit rows > 2 days; cron run history > 30 days |

"Use" for inactivity = latest of account creation, last sign-in, last session
creation/refresh (an installed PWA refreshes its session when opened).

## 6. Data-subject rights — where each is served

| Right | In the app | Server path |
| --- | --- | --- |
| Access / portability (15/20) | Settings → Privacy → Download my data | `export_my_data()` (0074/0076; caller only, decrypted, rate-limited 10/h; each download emails a security notice) |
| Rectification (16) | Settings → Account; edit any record | normal RLS writes |
| Erasure (17) | Settings → Security → Delete account | edge `delete-account` → `_shared/accountDeletion.ts` + `anonymise_departing_user` trigger |
| Restriction / objection (18/21), other | Settings → Privacy → Send a request, or email | edge `privacy-request` → privacy@ via Resend (3/day) |
| Withdraw consent (7(3)) | Settings → Notifications or Privacy (switches) | `log_preference_consent` trigger records history |
| Consent history | Settings → Privacy | `consents` (RLS select own) |

## 6a. Service emails about the account and its data

Sent regardless of the notification switches (they inform the user about their
data and account security; nothing to opt out of), from `NOTICE_FROM`
(default `Budgeer <no-reply@budgeer.com>`) with Reply-To privacy@budgeer.com.
Plain: no amounts, descriptions, group names or other records. Every one says
why it was sent and names privacy@. Templates:
`supabase/functions/_shared/gdprEmails.ts` (unit-tested in
`test/gdprEmails.test.js`); sending: `_shared/sendEmail.ts`.

| Email | Trigger (server-side) | Coalescing / idempotency | Why (basis) |
| --- | --- | --- | --- |
| Privacy Notice / Terms updated | New `current_legal_versions()` (with `LEGAL_VERSIONS` + a `LEGAL_CHANGES` summary in `_shared/legal.ts`); hourly sweep `legal_update_recipients()` | Once per user per version pair (`legal_update_notices`, stamped only after Resend accepted it); only users who signed up before the version and haven't accepted it; ≤ 100 per run, paced | Art. 12–13 (inform of changes) |
| Account deleted (by the user) | `delete-account`, after the deletion succeeded (address captured first) | One per deletion | Art. 12(3), 19 (confirm erasure) |
| Account deleted (inactivity) | `purge-inactive`, after the deletion succeeded | One per deletion; always preceded by the warning | Art. 5(1)(e), 12(3) |
| Inactivity warning | `purge-inactive`, 23 months without use | Once per idle stretch (`inactivity_notices`) | Art. 5(1)(e) |
| Data downloaded | Every `export_my_data()` (same transaction) | ≤ 1 per user per hour; counts the downloads it covers | Art. 32 (security) |
| Notification choices changed | Every consent-switch change (`consents` row, source `settings`) | One per user per 15 minutes, with the switches' final state | Art. 7, 32 |
| Privacy request receipt | `privacy-request`, after the inbox accepted the request | Under the 3/day request quota | Art. 12(3) (deadline) |

Deadline: one month from receipt (extendable by two months with notice,
Art. 12(3)). Keep a simple log of requests and answers (date received, type,
date answered) — the privacy inbox thread is the record.

## 7. Security measures (Art. 32)

TLS everywhere (HSTS); at-rest encryption of money/text fields with a Vault key;
RLS on every table with per-verb policies; server-authoritative columns forced
by triggers; SECURITY DEFINER functions pin `search_path` and are revoked from
API roles unless deliberately callable; rate limits on every fan-out mutation;
password re-check before account deletion; CSP (report-only) and security
headers on Vercel; no analytics or third-party scripts; the rolled-back DB
security suite (`supabase/tests/db_tests.sql`).

## 8. Personal data breach response (Art. 33/34)

1. **Contain (hour 0).** Revoke/rotate what leaked: Supabase service-role and
   anon keys, `app_enc_key` / payment key in Vault (re-encrypt), Resend API
   key, cron secret (`reminder_cron_secret`), VAPID keys. Disable affected
   functions or cron jobs; force sign-out (revoke sessions) if tokens leaked.
2. **Assess (≤ 24 h).** What data, whose, how many, was encrypted data
   exposed together with its key, since when, still ongoing? Preserve logs
   (Supabase logs, Vercel logs, `net._http_response`, `cron.job_run_details`).
3. **Notify the authority (≤ 72 h after awareness)** unless the breach is
   unlikely to result in a risk: APD/GBA online notification form
   (www.dataprotectionauthority.be). Include nature, categories and
   approximate numbers of people/records, likely consequences, measures taken,
   contact (privacy@budgeer.com). If facts are incomplete, notify in phases.
4. **Tell affected users without undue delay** if there is a high risk to them
   (e.g. decrypted financial data or credentials exposed): plain-language email
   via Resend + in-app notice — what happened, what data, what we did, what they
   should do (change password, watch for phishing), contact address.
5. **Processors.** Supabase, Vercel and Resend must notify us without undue
   delay under their DPAs; start this procedure on their notice.
6. **Record every breach** (even unreported ones, Art. 33(5)) in an internal
   log: date, facts, effects, remedial action, notification decision and why.
7. **Review.** Root cause, fix, add a regression test (db_tests.sql or unit
   test), update this document.

## 9. Operator to-do (outside the code)

- Make privacy@budgeer.com and support@budgeer.com real, monitored inboxes (the
  budgeer.com domain has Resend inbound enabled — route/forward them).
- Accept/sign the DPAs of Supabase, Vercel and Resend and keep copies; confirm
  each one's SCC module and sub-processor list; verify Vercel's DPF status.
- Set `PRIVACY_INBOX` (optional; defaults to privacy@budgeer.com) and confirm
  `RESEND_API_KEY`, `INVITE_FROM`, `APP_ORIGIN` in both projects' function
  secrets; `NOTICE_FROM` is optional (defaults to `Budgeer <no-reply@budgeer.com>`,
  which needs budgeer.com verified as a sending domain in Resend).
- Consider shortening Supabase Auth session lifetime / enabling inactivity
  timeout; check that auth audit logs are not kept longer than needed.
- Keep this record and a request/breach log up to date.
