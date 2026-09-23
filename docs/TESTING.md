# Budgeer — Testing Guide

Four layers:

1. **Unit tests** (`npm test`): pure logic, including split maths, money
   parsing, currency conversion and FX parsing, dates, recurring projections,
   dashboard periods, statement import, backup validation and crypto, offline
   cache rules, and the edge-function shared helpers. They use Node's built-in
   test runner, with no framework. `npm test` runs the suite twice, in
   `TZ=UTC` and in `TZ=Europe/Brussels` (`test:utc` / `test:tz`), because
   date bugs hide in UTC.
2. **Lint** (`npm run lint`, ESLint 9, `eslint.config.js`): React, hooks,
   a11y, unused imports (an error), and the ban on `shared/` importing from
   `features/`. It is strict (`--max-warnings=0`): a warning fails it just
   like an error.
3. **Database tests** (`supabase/tests/db_tests.sql`): triggers, RLS,
   definer functions, rate limits, encryption guards and notifications.
   Paste the file into the Supabase SQL editor, or run
   `psql "$DATABASE_URL" -f supabase/tests/db_tests.sql`.
   - Every test creates its own throwaway users and rolls itself back. That
     makes it safe on the live TEST or PROD project, including one with no
     users.
   - It must end with `ALL DATABASE TESTS PASSED`.
   - Any schema or policy change adds a matching test in the same change.
4. **Manual test plan** (below): end-to-end flows a person should click
   through after significant changes. Items marked **[2 accounts]** need a
   second signed-in user, for example in a private browser window.

**CI** (`.github/workflows/test.yml`) runs these steps on every push and PR:
`npm ci`, then `npm test` (UTC and `Europe/Brussels`), then lint, then
`npm run build`, then `npm audit --omit=dev --audit-level=high`. The audit
only reports for now and doesn't fail the build.

---

## Feature inventory

**Personal finance**
- Expenses & income with categories and notes; scanning a receipt pre-fills amount/date on-device (the photo is never uploaded or stored)
- Multi-currency: the ECB rate for the expense's date is shown before saving and captured with the entry, so history never shifts. A failed lookup asks for a rate and never saves 1:1
- Budgets per category/month, with 80% / 100% push alerts
- Recurring rules (subscriptions, salary) auto-logged nightly, with per-rule payment reminders
- Savings goals, net worth (accounts), insights & 6-month trends
- One Transactions page (Expenses / Income / All switch) with search & filters across all history
- Smart statement import (CSV/XLSX): auto-mapped columns, duplicate-proof re-imports, learned merchant→category rules
- Branded PDF statements (personal + per-group) and an Excel export of your own statement
- Backup & restore (Settings → Your data): one JSON file, optionally password-encrypted in the browser; restore merges and skips duplicates

**Groups**
- Groups with invites via link, email, or in-app; join/decline inbox
- Expenses split equally, by exact amounts, percentages, or shares
- Balances, "simplify debts" settlement plan, recorded settlements
- Your share auto-mirrored into your personal expenses
- Comments on expenses & settlements; immutable audit log
- Leave with settled-up guard (+ silent leave); rejoin reclaims your history
- Settle-up shortcuts: Revolut link, SEPA QR with exact amount, copy IBAN, debt nudges

**Platform**
- Installable PWA, offline reading, realtime everywhere (no polling)
- Notification bell + web push + email (big events only), per-account switches
- Passkeys, sign-in methods (connect/disconnect Google, set a password on a Google account), dark/light/system appearance, account deletion with data handover

---

## Manual test plan

### A. Personal expenses
1. **Add an expense** (Transactions → Expenses → Add expense → amount `5,50` using the comma key on a
   phone) → saves as 5.50 and appears at the top of the list instantly, no
   refresh.
2. **Same-day ordering**: add two expenses dated today → the most recently
   added sits on top.
3. **Edit** an expense's amount → list updates in place. **Delete** it →
   gone; check the dashboard totals moved.
4. **Receipt scan**: add expense → scan a photo → amount/date pre-fill; after
   saving, the row has no attachment (receipts are not stored).
5. **Multi-currency**: add a USD expense dated last month with EUR as the
   base currency. The form shows "$x ≈ €y @ rate on <date>" before you save,
   and the dashboard uses that captured rate. Then block the FX host in
   DevTools and try again: the form asks for a rate and won't save at 1:1.

### B. Dashboard
6. Spent/Income/Net tiles include upcoming recurring ("incl. … upcoming"
   caption when a charge is due later this month).
7. Period selector only offers months since your oldest transaction;
   "All time" appears once data spans months.
8. Pie/table toggle persists across reloads. Group-mirrored expenses bucket
   under the group's name.

### C. Budgets & alerts
9. Set a budget (e.g. €100 on one category). Add an expense taking it past
   80% → push + bell "Budget almost used". Past 100% → "Budget exceeded".
   Each fires exactly once per month per threshold.

### D. Recurring & reminders
10. Add a rule (e.g. rent, monthly, next charge in 2 days) with
    "Remind me before each charge" = 3 days → tomorrow 08:00 UTC you get the
    reminder push/bell; the charge itself books automatically on its date.
11. Pause a rule → it stops projecting into the dashboard.

### E. Import
12. Export a bank CSV (or make one: date, description, amount with negatives
    for debits). Transactions → ⋯ → Import file → columns auto-map → new merchants ask for categories
    once. **Re-import the same file** → "already imported before" — zero
    duplicates.
13. Import a second file containing the same merchant → it's categorized
    automatically (the saved rule).

### F. Groups **[2 accounts]**
14. Create a group, invite via link → second account joins → owner gets a
    "joined" notification; the open group page updates without refresh.
15. Add a split expense from account B → account A's open group page shows
    it live; A's bell rings; A's personal expenses gain the mirrored share
    tagged with the group name.
16. Unequal split: totals must equal the amount or the form blocks saving.
17. Comments: open an expense's comment thread on both accounts → messages
    appear live on the other screen.
18. Settle up: use a "Suggested" transfer → if the payee saved payment
    details, Revolut/QR/copy-IBAN shortcuts appear (QR only for EUR groups).
    Record it → balances update everywhere.
19. Nudge: on a debt owed to you, tap the bell icon → debtor gets "Friendly
    reminder". A third nudge the same day is politely refused.
20. Leave silently (checkbox) → no notification to others. Rejoin via a new
    invite → your old history and balance return, and there's only ONE of
    you in the member list.
21. Unsettled leave: with an outstanding balance, leaving is blocked with a
    clear message.

### G. Notifications & prompts
22. Fresh login: passkey prompt (if none) → then notification prompt with the
    email checkbox — never both stacked. "Not now" never asks again;
    Settings → Notifications still works.
23. Turn the push switch off → no pushes arrive (bell still fills).
    Email switch off → no emails for invites/joins/leaves.

### H. PWA & appearance
24. Install to home screen; kill network → app opens and shows last-synced
    data; a standing "Offline" pill appears; saving fails with "You're
    offline — reconnect to save".
25. Appearance: Light/Dark/System each apply immediately; System follows the
    OS. The header moon/sun quick-toggle stays in sync with Settings → Appearance.
26. **Icons**: on iOS, use Share → Add to Home Screen. The icon is the
    coral-and-amber "b" ring mark on cream (`apple-touch-icon.png`), not a screenshot. On
    Android, the installed icon fills the adaptive mask without clipping
    (`pwa-512.png`, maskable).
27. **Security headers**: on a Vercel preview, open DevTools → Console, then
    click through the landing page, login, Home, a group, Insights and a
    receipt scan. There should be no `[Report Only] Refused to …` CSP
    messages. Any new third-party host (API, image or font) must be added to
    the CSP in `vercel.json`.
28. Deploy update: with the app open and idle, a new deploy installs and the
    page reloads on its own within ~1 min (no button). While typing in a field
    or with a dialog open it waits, then updates once you finish or switch away.

### I. Reports
29. Insights → Statement export: personal PDF downloads with brand styling.
    Group page → Download statement: per-member balances match the app.

### J. Backup & restore **[2 accounts]**
30. Settings → Your data → Export backup, once with no password and once
    with a password → `budgeer-backup-YYYY-MM-DD.json` downloads. The plain
    file is readable JSON (`format: "budgeer-backup"`, `version: 1`); the
    protected one shows only `kdf`, `iv` and `ciphertext`.
31. On a second (empty) account, Restore from backup → pick the protected
    file → a wrong password says "Wrong password or damaged file." → the right
    one shows the contents → Restore → progress, then "Added N expenses, …".
    Expenses, income, categories, budgets, recurring entries, accounts and
    goals match the first account; group shares are plain expenses whose
    notes say "Group: <name>". No budget alerts fire for past months.
32. Restore the same file again → "Nothing new to add"; no counts change.
33. A damaged file (edit an amount to `-1`, or truncate it) is refused with a
    clear message and nothing is saved. Name/currency/notification/payment
    settings already set on the account are kept and listed in the summary.

### K. Navigation
34. Phone width: the bottom bar is exactly Home · Transactions · Groups ·
    Budgets · More; the top bar is bell, theme toggle, avatar (plus the
    offline badge when offline). Transactions stays lit on `/import`; More
    stays lit on Insights, Recurring and every Settings page; Groups stays lit
    inside a group.
35. Desktop: the sidebar is Home, Transactions, Groups, Budgets, a divider,
    Insights, Recurring, then the user row (→ Settings), theme toggle and sign
    out. No More or Search entries.
36. Transactions: the Expenses / Income / All switch and the search text are
    in the URL (`?type=…&q=…`) and survive a reload. With no search the list is
    this month; typing searches all history and shows the result count and
    net. The Filters button adds category, amount and date filters. "Add"
    follows the switch; under All the form asks Expense or Income first.
37. Category page: tap a Home category bar, an Insights legend entry, a
    budget row or a Settings → Categories row → `/categories/<id>` opens with
    the category's icon and name, the period's spend (a Period picker; Home's
    bars carry their period), its budget bar or "Set a budget" (this month
    only; year/all-time say budgets are monthly) and the period's entries.
    Edit opens an in-page panel: monthly budget (clearing it removes the
    budget), name/icon/colour and Archive. ← returns where you came from (Home
    when opened directly). "Uncategorized" has a page too, without Edit.
    Group buckets still open the group; the folded "Other" isn't a link.
    Budgets page: the row opens the category page; Edit (44px) opens it with
    the panel open.
38. Old links: `/expenses` → Transactions (Expenses), `/income` →
    Transactions (Income), `/search` → Transactions (All) with the search
    field focused.

### L. Privacy & legal (GDPR)

39. Sign-up: the "I'm 16 or older and I accept the Terms of Use and the
    Privacy Notice" box is required (links open in a new tab); the hobby /
    no-financial-advice line sits under it. After confirming the email and
    signing in, no legal prompt appears, and Settings → Privacy → consent
    history shows both documents "accepted when you signed up".
40. Google sign-up (or any account without the current versions, e.g. after a
    `LEGAL_VERSIONS` bump): a blocking "Before you continue" / "We've updated
    our terms" prompt lists the changes; /privacy and /terms stay readable;
    "I don't agree" offers Download my data, Delete my account and Sign out;
    Accept records it and the prompt doesn't return.
41. Settings → Privacy: Download my data saves `budgeer-my-data-<date>.json`
    with your profile, consents, notifications, records and your part of each
    group (no other user's ids/emails). "Send a request" emails the privacy
    inbox (Reply-To = your address; 4th request in a day is refused). The
    switches record history rows. Weekly summary is off for a new account.
42. Delete account: the dialog lists what's deleted and what stays; afterwards
    co-members see "Former member" in the group and its change log.
43. Footer / Settings links: Help, Privacy, Terms, Contact (support@) on the
    landing page; Privacy, Privacy Notice and Terms of Use in Settings.
