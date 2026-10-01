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
| `auth.users` (Supabase Auth) | email, password hash, providers, created/last sign-in, raw_user_meta_data (Google name/picture; Apple's `full_name`, given once at the first Sign in with Apple on the iOS app; `accepted_privacy/terms` versions; `password_set` when a Google or Apple account adds a password) | Accounts and sign-in | (b) contract | account | owner (own session), operator (admin) |
| `auth.identities` (Supabase Auth) | each sign-in method linked to the account (email; Google: its account id, email, name, picture; Apple: its stable user id and email — possibly a private relay address — from the identity token), when linked/last used; unlinked from Settings → Security | Sign-in with more than one method | (b) contract | account (an unlinked method's row is deleted) | owner (own session), operator |
| `auth.sessions`, `auth.refresh_tokens` | IP, user agent, timestamps | Keep users signed in, security | (f) security | until sign-out/expiry (Supabase-managed) | Supabase, operator |
| `auth.webauthn_credentials` | passkey name, public key, last used | Passkey sign-in | (b) | account | owner, operator |
| `auth.audit_log_entries` | sign-in events, IP | Security | (f) | 30 days (0073 purge, if stored in DB) | operator |
| `profiles` | display_name, avatar_url, base_currency, notification switches (`notify_email`, `notify_push`, `notify_digest`), onboarding/tour/pref flags, the last “What’s new” seen (`whats_new_seen`, 0087; moved once from the device's retired `budge:whatsNewSeen` key), the salary setting (`salary_shift_from_day`, `salary_category_id`, 0081; off by default), the AI helper switches (`ai_quick_entry`, `ai_import_categories`, `ai_month_summary`, 0103; `ai_plan_whatif`, 0105; off by default, except on the shared demo login (dev only), where the nightly reset turns them on (0106); not carried by backups), payment IBAN/Revolut/PayPal (enc) | Profile, settings, settling up | (b); digest and AI helpers (a) consent | account | owner; co-members see name/picture and payment details |
| `consents` (0072) | purpose (incl. `ai_quick_entry`, `ai_import_categories`, `ai_month_summary`, 0103, and `ai_plan_whatif`, 0105, logged by a trigger on each switch change), version, granted, source, server timestamp | Prove acceptance/consent (Art. 7(1)) | (c) | account | owner (read), written only by server paths |
| `categories`, `category_rules` | names, `is_savings` (0084); the defaults "Friends & family", "Bonus" and "Savings" were added to every existing account (0082–0084), no other data touched; rule patterns (“description contains”), also saved from the import's New merchants list — can be a payee's name | Organise own records | (b); payee names in patterns (f) | account | owner |
| `transactions` | amount/description/notes (enc), currency, rate, date, category, account, group link, `savings_from_income` (0084), `paid_from_savings` (0085), `paid_with_vouchers` (0097); imported descriptions carry the statement's payee/payer names (never the holder's own name column) | Expense/income tracking | (b); third-party names in imported descriptions (f) | account | owner |
| `accounts`, `budgets`, `savings_goals`, `recurring_rules` | names; balances/amounts/targets (enc); schedule; rules' `savings_from_income`/`paid_from_savings` (0084/0085) | Personal finance features | (b) | account | owner |
| `recurring_plans`, `recurring_plan_undo` (0095) | Plan mode: the one saved plan (planned changes to recurring rules — amounts, schedules, cancels — hypothetical new payments/income with names, dismissed ideas) and, for 24 hours after an apply, each touched rule's prior amount/schedule/state and the ids it created (both enc); the plan's ideas are computed on the device | Try changes to recurring payments before making them; undo an apply | (b) | account (plan until cleared or applied; undo record replaced by the next apply or removed by undo) | owner (only through the definer functions; no table grants) |
| `salary_history` (0102) | Your salary's corrections: which salary or bonus entries are holiday pay, a 13th month, a bonus or regular pay (by entry id), the Bonus category if picked, and the country prices are compared against, as one encrypted document; the pay history, raises and projections are computed on the device | Correct the extras the app guesses on Insights › Your salary | (b) | account | owner (only through the definer functions; no table grants) |
| `meal_vouchers` (0097) | Meal vouchers: the one setup (country for working days, amount per working day, top-up day, the balance on the card when last saved and its date, months with fixed days) as one encrypted document; balances and history are computed on the device | Track the meal voucher card apart from bank money | (b) | account (until switched off, which deletes it) | owner (only through the definer functions; no table grants) |
| `ai_month_summaries` (0103) | Month in plain words: per month, the 2–4 lines Claude wrote (enc), their language, a fingerprint (md5) of the per-category totals they were written from, when written | Show the summary in Home's overview (In words); tell when the month's totals have changed | (a) consent | account; a new summary deletes those over a year old; all deleted when the helper is switched off | owner (only through `my_month_summary`; written only by the `ai-helper` function with the service role; no table grants) |
| `groups` | name, picture, owner | Bill splitting | (b); for non-users (f) | until the group is deleted | members |
| `group_members` | display_name, user link, former_user_id, role | Who is in a group | (b)/(f) | group lifetime; on account deletion renamed "Former member" and unlinked (0072) | members |
| `group_expenses`, `expense_splits`, `settlements` | amounts, descriptions, notes (enc), payer, shares, dates | Shared ledger and balances | (b)/(f) | group lifetime (other members rely on it) | members |
| `group_comments` | body (enc), author | Discussion on expenses | (b) | group lifetime; deleted with the author's account | members |
| `group_audit_log` | actor name, action, summary/amount (enc) | Transparency of group changes | (f) | 2 years (0073) ; on account deletion the actor name and every mention of the user's names in the summaries become "Former member" (0072, 0078) | members |
| `group_invites` | invited_email, token, inviter, timestamps | Invitations | (f) inviter's and invitee's interest | link ≤ 24 h, row purged 7 days after expiry (0022) | group members (RLS), invitee via token |
| `notifications` | title/body (names, never amounts), actor | In-app notices; push/email fan-out | (b); digest (a) | 90 days (0073); deleted with the account — the recipient's own, and other people's whose actor is the deleted user, the only ones that name a person (0080) | recipient |
| `push_subscriptions` | endpoint, keys | Web push delivery | (b) + browser permission | until unsubscribed/expired/account deletion | owner (own rows), server |
| `apns_devices` (0108) | APNs device token per iOS install, environment (sandbox/production), created/last seen | Push to the iOS apps | (b) + iOS permission | until sign-out on that iPhone (`delete_apns_token`), Apple reports it dead (410/BadDeviceToken: notify-user deletes it), more than 10 installs (oldest dropped), or account deletion (cascade); exported without the token | owner (select/delete own rows; writes only via `save_apns_token`), server |
| `inactivity_notices` (0073) | warned_at | Avoid repeat warnings; notice before deletion | (c) Art. 5(1)(e) | until the account is used again or deleted | owner (read), server |
| `privacy_email_queue` (0076) | kind (consent change / data export), event and send timestamps, pending count | Coalesce the security notices (§ 6a) | (f) security; (c) | row kept per kind while the account exists (holds only timestamps) | server only (exported to the owner) |
| `legal_update_notices` (0076) | Privacy/Terms versions last emailed about, when | Email each user once per legal-document update | (c) Art. 12–13 | account | server only (exported to the owner) |
| `rate_limits` | key (uid or email hash), counters | Abuse prevention | (f) | ≤ 2 days (0058), backstop 30 days (0073) | server only |
| `fx_rates`, `fx_fetches` | none (currency rates) | Currency conversion; `latest_fx_rates()` (0086) serves the latest cached rates to the statement's recurring totals | — | — | server |
| Storage `avatars/<uid>/`, `group-images/<gid>/` | profile and group pictures (public URLs) | Display | (b) | removed on account/group deletion | anyone with the link |
| Browser storage (no cookies) | Supabase session token, service-worker caches (app files; recent reads + their IndexedDB timestamps), appearance/view prefs, prompt flags and "Not now" dismissals, import column mappings, the import holder name (`importHolder`: typed, suggested from the profile name or read from a statement; never sent to the server), the offline record of legal acceptance (`legalAccepted`: user id + versions), pending invite token, post-sign-in return path, FX cache; tab-only: pending-confirmation email, passkey-prompt and Google/Apple-link flags (`linkingProvider`: which provider), the Google/Apple sign-up consent marker (`legalConsentPending`: versions + time, 30-minute expiry). Retired key `budge:whatsNewSeen` is only read once, moved to `profiles.whats_new_seen` and deleted. Full key list: Privacy Notice → "Storage on your device" | Strictly necessary / user-requested (ePrivacy Art. 5(3) exemption) | — | session token, offline caches and `legalAccepted` cleared on sign-out; tab-only items when the tab closes | the user's device |
| iOS app: the widgets' snapshot (App Group `group.com.budgeer.app[.dev]` shared defaults, on the iPhone) | this month's Spent, Income and Net and the top three spending categories with "Other" (names and amounts, already formatted), the month's dates, the app's language, when it was written | Show the Home Screen and Lock Screen widgets (the extension reads only this; it runs no network or sign-in) | (b) | rewritten as the month changes; removed on sign-out and account deletion; the amounts are privacy-sensitive (hidden on the Lock Screen while locked) | the user's device (the app and its widgets only; never sent) |
| Page memory only (never stored) | the password just typed at sign-up, held by the “Check your inbox” page to retry the sign-in (6 s, then 15 s) until the email is confirmed | Sign the new user in once they confirm | (b) | dropped on sign-in, leaving/reloading the page, any error other than "not confirmed", or after 15 minutes | the user's browser; sent only to Supabase Auth |
| Imported statement files | CSV/Excel read in a Web Worker in the browser; the file is never uploaded; own-account transfers (incl. Revolut top-ups) and non-transaction lines are dropped before anything is saved | Import | (b) | not kept | the user's browser |

## 4. Processors and recipients

| Recipient | Role | Data | Location | Transfer safeguard |
| --- | --- | --- | --- | --- |
| Supabase, Inc. | Processor (DB, Auth, Storage, Edge Functions, Vault) | everything above; Auth sends the confirm/reset/sign-in-link emails, whose links go to `{{ .SiteURL }}/auth/confirm?token_hash=…` (our domain; the app verifies the token with Supabase) | AWS eu-west-3 (Paris) for both TEST and PROD; US company (support access) | Supabase DPA + SCCs |
| Vercel Inc. | Processor (static hosting, CDN) | IP, request logs | global edge incl. US | Vercel DPA + SCCs (DPF if certified — verify) |
| Resend (Plus Five Five, Inc.) | Processor (email) | recipient address, email content (Supabase Auth's confirm/reset/sign-in-link emails, sent through Auth's SMTP settings; invites, group event emails, the service notices of § 6a, privacy-request form) | sending region eu-west-1 (Ireland); US company; open/click tracking off | Resend DPA + SCCs |
| Cloudflare, Inc. | Processor (DNS, website proxy/CDN, Email Routing for privacy@/support@) | IP + requested URLs (proxy); inbound emails to privacy@/support@ in transit, not stored | global edge incl. US | Cloudflare DPA + SCCs; DPF |
| Google (Gmail mailbox) | Mailbox for privacy@/support@ (forwarded by Cloudflare; replies sent as privacy@/support@ through Resend SMTP) | sender address and message content of privacy/support emails and privacy-request forms | Google data centres, incl. US | DPF + Google terms; correspondence deleted when no longer needed, ≤ 2 years after the request is closed |
| Google | Independent controller (OAuth sign-in; avatar images on googleusercontent.com) | identity, IP when avatar loads | global | Google's terms; DPF |
| Apple (Sign in with Apple) | Independent controller (sign-in on the website and the iOS app) | identity: Apple's user id, email or private relay address, the name once (iOS) | global | Apple's terms; our emails to relay addresses go through Apple's private email relay (registered senders only) |
| Browser push services (FCM, Mozilla, Apple, Microsoft) | Deliver encrypted push payloads | endpoint, timing | global | payload end-to-end encrypted (RFC 8291) |
| Apple Push Notification service (Apple Distribution International Ltd.) | Processor (push to the iOS apps, 0108) | device token, the notification's title and body (names and group names, never amounts; not end-to-end encrypted: Apple carries the text over TLS), timing | Apple servers incl. US | Apple Developer Program License Agreement + SCCs; provider token signed with our APNs key (function secrets) |
| Frankfurter (frankfurter.dev) | Independent service (ECB rates) | currency codes and dates only, user's IP (browser calls: the form's rate, an import's date range, pending rates, and the latest rate for foreign recurring totals); server fetch has no personal data | unknown | no contract; no user identifiers sent |
| Anthropic, PBC (Claude API, model `claude-haiku-4-5`) | Processor (AI helpers, 0103/0105), only for a user who turned a helper on | Type to add: the typed line, today's date, main currency, the user's category names and ids, and which “Paid from” choices they have (the names `bank`/`savings`/`vouchers`, worked out on the server). Category ideas on import: merchant/payer names from the statement (long digit runs masked), money in or out, category names and ids. Month in plain words: per-category totals for the month and the six before, budgets, category names (amounts sent pre-formatted). What-if in your own words (Plan): the typed line, main currency, and the user's recurring payments, income and savings from income as the plan lists them (id, name — the description or category name —, amount, currency, how often, income, payment or savings; read on the server from their own rules). Never the name, email, bank details, other descriptions or notes; requests come from the edge function, so no IP or user id | US | Anthropic commercial terms + DPA with SCCs; API inputs/outputs not used for training, deleted within 30 days (longer only when flagged by its safety checks) |
| Revolut / PayPal | Only on user tap | friend's handle + amount in a link | — | user-initiated |

## 5. Automatic retention jobs (pg_cron, scheduled by the migrations)

| Job | Schedule (UTC) | Does |
| --- | --- | --- |
| `gdpr-retention` | 04:15 daily | `purge_expired_personal_data()`: notifications > 90 days, audit log > 2 years, rate limits > 30 days, auth audit log > 30 days, spent inactivity warnings |
| `inactive-accounts` | 04:45 daily | `run_inactivity_sweep()` → edge function `purge-inactive`: warns at 23 months without use (one email, recorded), deletes at 24 months and ≥ 28 days after the warning, via the same code as delete-account |
| `privacy-email-queue` | every 5 min | `run_privacy_email_queue()` → edge function `privacy-emails` (mode `queue`), only when a notice is due |
| `legal-update-emails` | hourly at :20 | `run_legal_update_sweep()` → edge function `privacy-emails` (mode `legal`), only when someone still needs the update email |
| `operator-signup-digest` | 06:00 daily | `run_operator_digest()` → edge function `operator-digest`: the operator's sign-up count for the previous UTC day (§ 6b), only when the recipient is set, there was at least one sign-up and that day wasn't sent yet |
| `purge-expired-invites` | 03:30 daily | invites 7 days after expiry |
| `purge-rate-limits` | 03:45 daily | rate-limit rows > 2 days; cron run history > 30 days |

"Use" for inactivity = latest of account creation, last sign-in, last session
creation/refresh (an installed PWA refreshes its session when opened).

## 6. Data-subject rights — where each is served

| Right | In the app | Server path |
| --- | --- | --- |
| Access / portability (15/20) | Settings → Privacy → Download my data | `export_my_data()` (0074/0076/0095; caller only, decrypted, rate-limited 10/h; each download emails a security notice) |
| Rectification (16) | Settings → Account; edit any record | normal RLS writes |
| Erasure (17) | Settings → Security → Delete account | edge `delete-account` → `_shared/accountDeletion.ts` (shared groups handed over in one transaction by `transfer_owned_groups`, 0099) + `anonymise_departing_user` trigger |
| Restriction / objection (18/21), other | Settings → Privacy → Send a request, or email | edge `privacy-request` → privacy@ via Resend (3/day) |
| Withdraw consent (7(3)) | Settings → Notifications or Privacy (switches) | `log_preference_consent` trigger records history |
| Consent history | Settings → Privacy | `consents` (RLS select own) |

## 6a. Service emails about the account and its data

Sent regardless of the notification switches (they inform the user about their
data and account security; nothing to opt out of), from `NOTICE_FROM`
(default `Budgeer <privacy@budgeer.com>`, built from `PRIVACY_EMAIL`) with
Reply-To privacy@budgeer.com, so a reply goes straight to the privacy inbox.
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

## 6b. Operator sign-up digest (aggregate only)

The operator gets one email a day with the number of accounts created the
previous UTC day and the total number of accounts: "3 new sign-ups
yesterday · 1,204 accounts in total". No personal data: no email addresses,
names or account ids are read for it or sent (`signup_digest()` returns two
counts; the template, `_shared/operatorDigest.ts`, takes only a date and two
numbers — `test/operatorDigest.test.js`). Nothing is sent on days without a
sign-up, and each day at most once (`operator_digest_log`, server-only).

Sent from `OPERATOR_FROM` (default `Budgeer <no-reply@budgeer.com>`) to the
address in the Vault secret `operator_signup_email`, which is not in the
repository and exists only on PROD — without it the job does nothing, so TEST
stays silent. Because the counts are anonymous aggregates, this is not
processing of personal data about the users and needs no change to the
Privacy Notice.

## 7. Security measures (Art. 32)

TLS everywhere (HSTS); at-rest encryption of money/text fields with a Vault key;
RLS on every table with per-verb policies; server-authoritative columns forced
by triggers; SECURITY DEFINER functions pin `search_path` and are revoked from
API roles unless deliberately callable; rate limits on every fan-out mutation;
password re-check before account deletion; enforced CSP and security
headers on Vercel; no analytics or third-party scripts; the rolled-back DB
security suite (`supabase/tests/db_tests.sql`).

## 8. Personal data breach response (Art. 33/34)

1. **Contain (hour 0).** Revoke/rotate what leaked: Supabase service-role and
   anon keys, `app_enc_key` / payment key in Vault (re-encrypt), Resend API
   key, Anthropic API key (`ANTHROPIC_API_KEY`), cron secret (`reminder_cron_secret`), VAPID keys. Disable affected
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
5. **Processors.** Supabase, Vercel, Resend and Anthropic must notify us without undue
   delay under their DPAs; start this procedure on their notice.
6. **Record every breach** (even unreported ones, Art. 33(5)) in an internal
   log: date, facts, effects, remedial action, notification decision and why.
7. **Review.** Root cause, fix, add a regression test (db_tests.sql or unit
   test), update this document.

## 9. Operator to-do (outside the code)

- privacy@ and support@budgeer.com: Cloudflare Email Routing → a Gmail mailbox;
  replies are sent as those addresses through Resend SMTP (done). Keep the
  mailbox tidy: delete privacy/support correspondence when no longer needed,
  at the latest two years after a request is closed; keep the request log.
- Accept/sign the DPAs of Supabase, Vercel, Resend, Cloudflare and Anthropic (its commercial
  terms include the DPA; keep the Anthropic console's data retention at the default)
  and keep copies; confirm
  each one's SCC module and sub-processor list; verify Vercel's DPF status.
- Set `PRIVACY_INBOX` (optional; defaults to privacy@budgeer.com) and confirm
  `RESEND_API_KEY`, `INVITE_FROM`, `APP_ORIGIN` in both projects' function
  secrets; `NOTICE_FROM` is optional (defaults to `Budgeer <privacy@budgeer.com>`,
  which needs budgeer.com verified as a sending domain in Resend) — leave it
  unset, or set it to that address, so recipients can reply.
- AI helpers (0103): set the `ANTHROPIC_API_KEY` function secret for `ai-helper` on each project
  where they should work (without it every helper answers "not set up"); set a monthly spend
  limit in the Anthropic console. Overall cap: 5,000 calls a day (`ai_helper_start`).
- Operator sign-up digest (§ 6b), PROD only: create the Vault secret
  `operator_signup_email` holding the address the digest goes to, and deploy
  `operator-digest`. Leave the secret absent on TEST.
- Check that Supabase Auth's SMTP settings (Authentication → Emails → SMTP) send
  through Resend on both projects, as the Privacy Notice says for the sign-in
  emails.
- Consider shortening Supabase Auth session lifetime / enabling inactivity
  timeout; check that auth audit logs are not kept longer than needed.
- Keep this record and a request/breach log up to date.
