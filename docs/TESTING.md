# Budgeer — Testing Guide

Four layers:

1. **Unit tests** (`npm test`): pure logic, including split maths, money
   parsing, currency conversion and FX parsing, dates, recurring projections,
   dashboard periods, statement import, backup validation and crypto, offline
   cache rules, and the edge-function shared helpers. They use Node's built-in
   test runner, with no framework. `npm test` runs the suite three times, in
   `TZ=UTC`, `TZ=Europe/Brussels` and `TZ=America/Los_Angeles` (`test:utc` /
   `test:tz` / `test:tz-west`), because date bugs hide in UTC and show up on
   one side of it only.
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
blocks: a high or critical advisory in a production dependency fails the
build. A separate `functions` job runs `deno lint` over `supabase/functions`.

---

## Feature inventory

**Personal finance**
- Expenses & income with categories and notes; scanning a receipt pre-fills amount/date on-device (the photo is never uploaded or stored)
- Multi-currency: the ECB rate for the expense's date is shown before saving and captured with the entry, so history never shifts. A failed lookup asks for a rate and never saves 1:1
- Budgets per category/month, with 80% / 100% push alerts
- Recurring rules (subscriptions, salary) auto-logged nightly, with per-rule payment reminders
- Plan mode (/plan): try changes to your recurring payments and income (cancel, change the amount or how often, add a new one) and see the monthly net before → after (a salary logged as entries counts as a derived Salary row; with no recurring income the card shows the payments total instead); ideas to save computed on the device; the plan is saved to the account (encrypted); optional Apply changes the real rules in one step, with Undo for 24 hours
- Meal vouchers (/vouchers, Settings → Meal vouchers): a card topped up on a chosen day for last month's working days (Mon–Fri minus Belgian or Greek public holidays) × the amount per day; what's on the card, this month's top-ups and spending, the next top-up with Fix days (leave, sick days), the history; a Home card; expenses "Paid from: Meal vouchers" are spending but not against the Net; the setup is encrypted, in backups and the data export
- Your salary (Insights card → /insights/salary): regular pay over time from the Salary entries (the salary shift respected), raises (Belgian January indexation labelled), extras (holiday pay, 13th month, bonus; guessed ones correctable in place; the Bonus category by its default key or picked on the page), "If things go on" (1/3/5/10 years: my trend, indexation only, what if; monthly pay and total earned, bonuses left out), pay against Belgian or Greek inflation (Eurostat HICP, shipped with the app), year-by-year totals; the corrections are encrypted, in backups and the data export
- Optional AI helpers (Settings → AI helpers, all off by default; Claude by Anthropic): Type to add on Add fills the form from a typed line, with Undo; category ideas for new merchants on Import; Month in plain words in Home's overview (Numbers | In words), written once and stored encrypted, with Update when the totals change
- Savings page: the pot (all time, month by month), this month's flow, repeating savings, goals and a savings-only history
- Net worth (accounts), insights & 6-month trends
- One Transactions page (Expenses / Income / All switch) with search & filters across all history
- Smart statement import (CSV/XLSX): auto-mapped columns, duplicate-proof re-imports, learned merchant→category rules
- Branded PDF statements (personal + per-group) and an Excel export of your own statement
- Backup & restore (Settings → Your data): one JSON file, optionally password-encrypted in the browser; restore merges and skips duplicates

**Groups**
- Groups with invites via link, email, or in-app; join/decline inbox
- Expenses split equally, by exact amounts, percentages, or shares
- Add a group expense straight from the main Add form ("Who's it for?")
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
6. Spent/Income/Net include upcoming recurring. The ⓘ beside Spent opens,
   in place, what they fold in ("Spent includes €X of recurring payments
   still to come", "… paid from savings") and what the Net is; tapping it
   again closes it. No captions under the figures.
6a. New expense (and a recurring payment), with a savings category set up:
   "Paid from" offers Bank · Savings, starts on Bank, and its ⓘ explains
   both; Savings saves the expense as paid from savings. A savings entry's
   "Taken from my income" switch explains itself behind its ⓘ too.
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
    automatically (the saved rule). Before importing, the preview already
    shows it like a ledger row: the category's icon, "20 Sep · Groceries"
    (just the date when nothing matches), no "expense/income" word, income
    with a green "+".

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
    Record it → balances update everywhere. With no payment details saved,
    opening it on a debt owed to you shows "Add payment details" / "Not now"
    once; "Not now" hides it on that device.
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
    the CSP in `vercel.json`. `curl -sI https://dev.budgeer.com/` shows
    `X-Robots-Tag: noindex, nofollow`; the same on `https://www.budgeer.com/`
    doesn't. `/robots.txt` and `/sitemap.xml` open as files, including in the
    installed app, not as the app's 404 page.
28. Deploy update: with the app open and idle, a new deploy installs and the
    page reloads on its own within ~1 min (no button). While typing in a field,
    with a dialog open, or on a form page with unsaved input (even after
    tapping outside the fields) it waits, then updates once you save or leave
    the page, or switch away. A closed notification bell never holds it back.
    The same holds on a tab opened on a first visit (no service worker in
    control yet): after a deploy it reloads on its own too. A page opened
    after a deploy on a tab still on the old build reloads once by itself and
    opens, instead of the "A new version of Budgeer is ready" screen (session
    storage then holds `budge:chunkReload` with the original error).

### I. Reports
29. Insights → Statement export: personal PDF downloads with brand styling.
    Group page → Download statement: per-member balances match the app.
    Both are made on the device (see "Statements on the device" below): with
    DevTools → Network open, an export makes no `functions/v1` request, only
    the usual reads, and the console shows no
    `using the server fallback` warning. Export once online, then go offline
    (DevTools → Network → Offline) and export the same range again: it still
    downloads, in the brand fonts, while the reads are in the offline cache.

#### Statements on the device
The PDF and Excel statements are built in the browser (`src/features/insights/
deviceStatement.js`, `src/features/groups/deviceGroupStatement.js`) from the
same modules the edge functions use (`supabase/functions/generate-report/
statementFile.ts`, `group-report/groupStatement.ts`, `_shared/pdf.ts`).
`test/deviceStatements.test.js` runs both edge functions under Node and checks
that the device makes byte-identical files from the same data.

The page only reads; the file itself is made in a Web Worker
(`src/shared/lib/statementWorker.js`, via `statementOffThread.js`), so a long
statement never freezes the app, and the PDF line shows the page being made
("Preparing your PDF statement… page 12"). A device that takes over 45 s
(`deviceFirst.js`) is stopped and the server makes the file instead; any
failure ends in the "Could not generate report" toast. Long statements stay
fast because a cell too wide for its column is cut in a few measurements, not
one character at a time (`test/statementScale.test.js` counts them).
Manual check: on an account with a few thousand transactions (bank imports),
Insights › Export statement over 18 months → PDF: the page line counts up,
the app stays scrollable, and the file downloads within seconds.

> **TODO (the release after next):** remove the server fallback. Delete the
> `generate-report` and `group-report` edge functions (their folders and
> `supabase/config.toml` entries, then `supabase functions delete` on TEST and
> PROD), `src/shared/lib/deviceFirst.js`, the `…FromServer` calls in
> `src/features/insights/reports.js` and `src/features/groups/groups.js`,
> `_shared/pdfDeno.ts`, `_shared/files.ts`'s octet-stream workaround and
> `test/reportDownload.test.js`'s functions-js round trip, and the edge-function
> half of `test/deviceStatements.test.js`. Move `statementFile.ts`,
> `statementMath.ts` and `groupStatement.ts` next to their features. Until
> then, a `[statement] couldn't be made on this device; using the server
> fallback.` warning in the console marks each time the fallback was used.

### J. Backup & restore **[2 accounts]**
30. Settings → Your data → Export backup, once with no password and once
    with a password → `budgeer-backup-YYYY-MM-DD.json` downloads. The plain
    file is readable JSON (`format: "budgeer-backup"`, `version: 3`); the
    protected one shows only `kdf`, `iv` and `ciphertext`. With the salary
    shift on and a savings category, entries "Taken from my income" and
    expenses "Paid from savings", the file's profile has
    `salary_shift_from_day` and `salary_category` (a key like `"c9"`, not an
    id), the category `savings: true`, and the entries `from_income` /
    `from_savings`. It has no `whats_new_seen`.
31. On a second (empty) account, Restore from backup → pick the protected
    file → a wrong password says "Wrong password or damaged file." → the right
    one shows the contents → Restore → progress, then "Added N expenses, …".
    Expenses, income, categories, budgets, recurring entries, accounts and
    goals match the first account; group shares are plain expenses whose
    notes say "Group: <name>". No budget alerts fire for past months.
    Settings › Monthly spending shows the same salary shift (day and
    category); the account still has exactly one Savings, Friends & family
    and Bonus category, and the savings/"Paid from savings" flags match.
32. Restore the same file again → "Nothing new to add"; no counts change.
33. A damaged file (edit an amount to `-1`, or truncate it) is refused with a
    clear message and nothing is saved. Name/currency/notification/payment
    settings already set on the account are kept and listed in the summary.
    Restoring a USD backup into an empty account on any other main currency
    (not only EUR): the review says "Your main currency will be set to USD to
    match this backup." and afterwards the account's main currency is USD,
    with nothing converted. Same currency on both: no currency line.
    Restoring into an account that already has entries in another main
    currency (e.g. a EUR backup into a JPY account): the review says the
    budgets, account balances and savings goals will be converted to JPY, and
    the main currency stays JPY. Every entry keeps its
    original amount and currency, shows the right ¥ equivalent at that day's
    rate; budget caps, account balances and savings goals come back
    converted to whole yen (recurring entries keep their own currency). Offline, the
    restore stops with the exchange-rate message and nothing is added.

### K. Navigation
34. Phone width: the bottom bar is exactly Home · Transactions · Groups ·
    Budgets · More; the top bar is bell, theme toggle, avatar (plus the
    offline badge when offline). Transactions stays lit on `/import`; More
    stays lit on Insights, Savings, Recurring, Plan, Meal vouchers and every Settings page; Groups stays lit
    inside a group. A category's page lights the tab it was opened from
    (Home's "Spending by category" → Home, Insights or Settings › Categories →
    More, Budgets → Budgets; opened by its address → Budgets), and going back
    to it from an entry keeps that tab.
    The floating "+" is only on Home and Budgets (Transactions, Groups and
    Recurring have their own + in the header); scrolled to the end, the last
    row sits clear above it.
35. Desktop: the sidebar is Home, Transactions, Groups, Budgets, a divider,
    Insights, Savings, Recurring, Plan (then Meal vouchers, with a voucher
    setup), then the user row (→ Settings), theme toggle and sign
    out. No More or Search entries. Tablets, desktops and portrait phones
    look exactly as before whatever the sideways layout below does.
35a. A phone held sideways (landscape, ≤ 500px tall: 844×390, 667×375, and
    with a notch — in Chrome DevTools, or the capture harness's CDP
    safe-area override of 47px left/right, 21px bottom):
    - Rail: 64px, the page's own colour in light and dark (no white slab, no
      border): logo, one rounded coral "+" (Add expense), then icon-only
      Home · Transactions · Groups · Budgets · More, the current one on a
      pale coral pill. Each has a tooltip and its name as its label; every
      target is at least 44px and the rail doesn't crowd at 375px tall. With
      a notch the rail widens by the inset with no blank band; content clears
      the right inset and the home indicator.
    - Header (~52px, stays put as the page scrolls): the page's title and
      its controls (Home's period; Transactions' search, filters and ⋯; a
      form's Save), then the bell and your picture. No theme toggle (it's in
      Settings › Appearance), no top bar, bottom bar or floating "+". The
      bell's list opens under it, clear of the rail. The picture opens
      Settings and is ringed there; More is not lit on Settings pages.
    - Content: one centred column ≤ 720px; forms (Add expense, Settle up,
      Settings pages) line up with the lists. Card titles are ~15px:
      "Spending by category" is one line at 844 (and at 667 or 812, where
      Home's cards drop their header tiles).
    - Home: a Spent | Income · Net strip, then two stacks that flow on their
      own — Spending by category and Budgets on the left; Expenses, Income
      and Recurring on the right (first run: the way to start, then
      Recurring). Period, Show all, the savings and salary notes all work.
      Category bars put the amount beside the name when both fit.
    - Rows: title and meta one line each, cut with "…", never letter by
      letter; below ~836px wide (SE, mini) Home's rows fold edit/delete
      into ⋯. Transactions
      shows about six rows above the fold at 844×390; its type switch and
      count sit on one line over the list, and there's no page "Add" (the
      rail's is the one). The group page has no "Add expense" either.
    - Add / edit expense: two columns — type, amount, fields on the left; the
      categories as a grid of tiles on the right (one radio group: arrow
      keys move, the chosen one is ringed; "Uncategorized" last); Save in
      the header, Delete (editing) under the form.
    - Group page: back, photo, name over "N members", total and ⋯ on one
      header row, even at 667; the balance card shows everyone's tiles on
      one row and leaves the list in view.
    - Keyboard: Tab → Skip to content → Enter lands on the page; the next Tab
      is the page's first header control. Dialogs, the What's new story (a
      wide card, picture beside the words) and the legal prompt fit or
      scroll with their buttons reachable.
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
    field focused. Unknown addresses (`/nope`) show the "This page rolled
    away" 404: inside the app shell signed in (Back to Home, Go back),
    public signed out (Go to Home, Help & FAQ). Signed out, an app page
    (`/transactions/123`, `/groups/<id>`, `/settings/security`) goes to
    `/login?next=…` and, after signing in with a password, a passkey, Google
    or a confirmed sign-up in the same browser, lands on that page;
    `/login?next=//evil.com` lands on Home. Error screens (crash, new
    version, offline) are previewed at `/kit` on the dev server; none of
    them shows the technical error message (it goes to the console only).

### K1. Empty states

On a fresh account (and a group with no expenses), at 390px and on desktop,
light and dark, each of these shows the same card: the Budgeer mark, a
heading, one muted line and its buttons (full width on the phone).

| Page | Heading | Buttons |
| --- | --- | --- |
| Home, Transactions | Nothing logged yet | Add your first expense · Import a bank statement |
| Groups | No groups yet (ring in three slices) | Create your first group |
| A group, Expenses tab | No shared expenses yet (three slices) | Add the first expense · Invite people (only while you're alone in it) |
| Budgets | No budgets yet (the "Set a monthly cap" form under it) | Set your first budget (scrolls to the form, cursor in Category) · Copy last month's budgets (only when last month has caps) |
| Recurring, each tab | No subscriptions or bills yet / No recurring income yet | Add a subscription or bill / Add recurring income |
| Savings | Start your savings pot (then "How savings work") | Add to savings · Set a goal (only with no goals) |

While one of these shows, the phone's floating "+" is hidden, so it never
sits over the card's buttons (on a short phone too); it's back once there's
an entry, a group or a budget.

### K2. Form pages (no form dialogs)

Every form that fills in data is its own page with a ← arrow (which is also
Cancel); only yes/no confirmations and the one-time prompts (passkey,
notifications, the legal gate, the setup wizard, delete account) are small
dialogs. The receipt scanner's crop-and-check overlay stays too: it's a
camera step inside the expense page, and it never submits that page.

| Page | Opened from |
| --- | --- |
| `/groups/new` | Groups → New group (lands in the new group; ← from it goes to Groups) |
| `/groups/<id>/settle` | a group's Settle up |
| `/groups/<id>/expenses/new`, `/groups/<id>/expenses/<expenseId>` | a group's Add expense; tapping an expense you may edit |
| `/groups/<id>/comments/<itemId>` | the comment icon on an expense or settlement |
| `/groups/<id>/members` | the member stack under the group's name |
| `/groups/<id>/edit` | ⋯ → Rename group (owner) |
| `/recurring/new?kind=…`, `/recurring/<id>` | Recurring → Add; a rule's Edit; Plan's "Open payment" |
| `/savings/goals/new`, `/savings/goals/<id>` | Savings → Goal; a goal's Edit (the old `/insights/goals/…` links redirect here) |
| `/insights/accounts/new`, `/insights/accounts/<id>` | Insights → Account; an account's Edit |
| `/settings/categories/new?kind=…` | Settings → Categories → Add (Edit opens the category's page with its Edit panel, like Budgets → Edit) |
| `/settings/data/export`, `/settings/data/restore` | Settings → Your data |
| `/settings/privacy/request` | Settings → Privacy → Send a request |

For each, at 390px and on desktop, light and dark:

1. Open it from its screen, fill it in, save → you're back where you came
   from and the change shows there (the list or group refetches). ← without
   saving changes nothing.
2. Reload the page, or open its address in a new tab: it loads (a spinner,
   then the form), filled in for an edit; ← then goes to its parent
   (the group, Recurring, Insights, Savings, Categories, Your data, Privacy).
   Signed out, the address goes to sign-in and comes back to it.
3. The phone's floating "+" is not on any of these pages; the bottom bar
   keeps the section lit (Groups, or More).
4. Settle up opens on the top suggestion; each suggestion is a row that
   fills the form; "I received" shows the payment-details ask when you have
   none saved. Group expense: empty Save shows the inline errors, the payer
   starts as "You", Percent starts even, and Delete asks "Delete this
   expense?" first. Coming back from a settlement's comments lands on the
   Settlements tab; from an income rule, on Recurring's Income tab.
5. Type something, tap outside the field, then deploy a new version (or
   wait for one): the page doesn't reload until you save or leave.
6. Restore: ← is disabled while the restore runs; a bad file says why and
   offers "Choose another file".

### K3. Savings

Fake data with savings entries in several months (some from income, some
received, one in a foreign currency), an expense paid from savings this
month, a monthly savings rule and two goals (one with a target date). Check
at 390px (light and dark), desktop 1280, and sideways at 844×390 and 667×375.

1. More lists Savings ("Your pot, goals & history") between Insights
   ("Trends & net worth") and Recurring; the desktop sidebar has it under
   Insights; the bottom bar is unchanged and More stays lit on `/savings`.
2. Pot: the all-time total equals Insights' net worth Savings line (entries
   in another currency count at their captured rate). The chart shows the
   month-end total from the first savings month (2–12 months).
3. Chip: a month where the pot grew shows a green "+€X this month"; a month
   with money paid from savings and no growth shows the muted "€X spent from
   savings this month"; never red.
4. Add to savings opens New income with the Savings category picked and
   "Taken from my income" on. `/transactions/new?kind=income&category=<an
   expense category's id or nonsense>` opens with no category picked.
5. This month: From income, Received and From savings tiles (a muted €0.00
   when nothing came out), the net change, and each active savings rule
   ("€200.00 every month", repeat icon) opening its page.
6. Goals: ring in the logo's amber → gap → coral with the percentage; the
   pace line ("€X/mo to reach it by May 2027", "No deadline", "Target date
   passed", "Reached 🎉"); + / − a tenth, Edit (`/savings/goals/<id>`),
   Delete and "+ Goal" work; `/insights/goals/<id>` lands on the edit page.
7. History: only entries that move the pot, by month, newest first; each
   month's header net is green when positive, muted otherwise. All / In /
   Out filters the rows (the header keeps the whole month's net). Two months
   show, then "Show older" adds more. Rows show date · from income /
   received / from savings, no category tag, a repeat icon for rule entries,
   one line each; Edit opens the entry, Delete asks first.
8. Live: add a savings entry in another tab → the pot, chart, tiles and
   history update without a reload.
9. Empty (no savings entries): "Start your savings pot", Add to savings,
   Set a goal, and "How savings work" with "Make it automatic".
10. Sideways: the pot is a strip (total, chip, Add beside the chart) over two
    stacks (This month and Goals | History) under the slim header; at 667
    the rows fold their actions into ⋯ and the cards drop their header tiles.
11. Home's "Saved €X this month" and Insights' "See savings ›" open Savings.

### K4. Add to a group from Add ("Who's it for?")

Fake data: an account in three groups (one owned by someone else, one in
another currency), plus an account with no groups and one with eight. Check
at 390px (light and dark), desktop 1280, and sideways at 844×390.

1. No groups: New expense is exactly as before — no "Who's it for?", no
   placeholder, nothing moves in while it loads.
2. With groups: under Expense/Income, "Just me" (picked) then the groups,
   last added to first, then newest first; each with its picture or mark.
   Eight groups scroll sideways with a fade at the edge that has more; the
   picked chip is scrolled into view. Income (or editing an entry) shows no row.
3. Keyboard / screen reader: Tab reaches the row as one radio group
   ("Who's it for?"); ← / → move the pick and keep the focus on the chips.
   Each chip is at least 44px tall.
4. Pick a group: the page becomes "<Group> · Shared expense" — amount first,
   date and Paid by on one row, the split as one card ("Split equally · All
   4 · €21.15 each"); Adjust opens the usual split editor. The button reads
   "Add to <group>". The URL gains `?group=<id>` without a new history entry
   (Back still leaves Add); reloading keeps the group; a `?group=` that isn't
   one of your groups opens on Just me.
5. Carry-over: type an amount, description and date, switch Just me ↔ group
   ↔ another group — they stay. An untouched currency follows each side's
   default (base ↔ group currency); a currency you picked stays. A foreign
   currency shows the conversion line on both sides.
6. Income from a group's form returns to Just me as New income, keeping
   what was typed.
7. Save: back to where Add was opened (Home, Transactions…), toast "Added to
   <group> — Your share, €X, is in your expenses."; the share is in your
   expenses, the group shows the expense live, and the group now comes first
   in the row. The in-group page (`/groups/<id>/expenses/new`) keeps its
   layout.
8. Sideways: the fields and chips on the left, the split card on the right,
   "Add to <group>" in the slim header.

### K5. Plan mode

Fake data: an account with a salary, rent (Housing), a yearly insurance, a
savings transfer ("Taken from my income") and one rule in USD, plus nine
payments in one broad "Subscriptions" category: Mobile Vikings, JIMS,
Revolut, Apple iCloud, Apple Music, YouTube Premium, KBC monthly charges,
Flighty, Amazon Prime. Add a monthly "Car insurance" with two charges at
different prices (it went up), and a budget on a category that went over
last month. Check at 390px (light and dark, English and Greek), desktop
1280, and sideways at 844×390.

Nothing on Plan opens a pop-up except Apply, Clear plan and Undo (real
confirmations). Every editor opens in place, one at a time on the whole
page: its button says `aria-expanded`, focus moves to its first field, it
scrolls into view (above the tab bar), and Escape or Done / Cancel closes it
and puts focus back on what opened it.

1. Entry: the sidebar has Plan right after Recurring; on a phone it's in
   More (More stays lit on `/plan`); sideways, through the rail's More.
   Nothing new on Home or Recurring.
2. The impact card: "Net a month" = recurring income − recurring payments,
   yearly ones at ÷ 12 and the USD rule at today's rate (with the rates
   note); the savings transfer isn't anywhere on the page. Month/Year
   changes every figure on the page (card, groups, rows, ideas).
3. Rows sit under Income, Bills (rent, insurance, utilities…) and
   Subscriptions, each with its total. Turn a switch off → the row's amount
   is struck through, "Cancelled" (income: "Stopped"), the chip shows the
   gain, and "Your changes" appears with 1 change and its saving.
4. Tap a row → it opens in place under the row: type a new amount → the
   delta updates live; change how often; Keep/Cancel; Reset puts it back;
   Done closes it. Tapping another row closes the first. A changed row
   shows the old amount struck through. Income (a raise) works the same.
5. "What if I add…" → the form opens in place (name, amount, currency, how
   often, start, category, Cancel and "Add to plan") → it's listed as "New"
   and moves the net; tap it to edit it in place; its switch removes it.
6. Ideas to save: at most three cards and one tag per row. × dismisses one
   for good (also after a reload); a card also goes once any of its
   payments is changed by hand.
   - Overlap is by what a service does, never by category: with the nine
     subscriptions above the only overlap is "2 music services" (YouTube
     Premium and Apple Music); nothing groups Mobile Vikings, Revolut, KBC
     or Amazon Prime. Its Try it opens the picker in place under the ideas:
     most expensive first, none ticked, "Add 1 to plan" disabled until one
     is ticked, the saving follows the ticks, Cancel closes it.
   - Car insurance that went up shows "Car insurance went up 12% · worth
     comparing offers" with "Up €6.43/mo"; "Try a lower price" opens that
     payment's editor (scrolled to) and cancels nothing. A price rise on a
     non-essential payment keeps "Try it", which cancels it in the plan.
   - Biggest saver and over budget never pick an essential (rent,
     insurance, utilities, health, loans, taxes, school, pension, savings:
     by category or by a word in the name, in English, Dutch, French or
     Greek). Essential rows only ever carry "Price up".
7. "Your changes": each change with its saving a month and a year, "Undo
   this change" (an added one: "Remove") which drops just it with no
   question asked, "Open payment" (the rule's page), the net change, then
   "Apply to my recurring…" and "Clear plan" at the end of the list
   (nothing floats over the page). Tap a change → the same editor opens
   there (an added one: its form); the row above follows. Clear plan asks
   first, then clears the changes and adds; dismissed ideas stay
   dismissed.
8. Saved: once the plan has a change the header says "Plan saved" (never
   with no changes); reload, or open the page on another
   device → the same plan. Edit a planned rule on Recurring (another
   amount) → back on Plan the row says "Updated since your plan" and the
   banner lists it; delete a planned rule → its change leaves the plan with
   a note. OK clears the banner.
9. Apply: "Apply to my recurring…" → every change ticked, "Net after
   applying" follows the ticks, the amber warning (real payments change,
   nothing is cancelled with providers, undo for 24 hours) shows above the
   button without scrolling. Apply → toast, the applied changes leave the
   plan (unticked ones stay), Recurring shows the cancelled rule paused
   (history kept), the edit from its next charge, the add as a new rule.
10. Undo (in the green banner, for 24 hours): the dialog says entries
    already added today stay → Undo → every rule exactly as before (paused
    ones running again, added ones gone). After 24 hours the server refuses
    it and the page shows a quiet "Applied yesterday · N changes · View in
    Recurring".
11. Backup: a backup made with a saved plan restores it into an account
    that has none (changes follow the matching recurring entries); Settings
    → Privacy → Download my data includes `recurring_plan`. A plan with a
    salary change (step 12) keeps it through backup and restore.
12. Salary from entries: a second account with no recurring salary rule
    but salary entries (the Salary category, or the one chosen in Settings
    → Monthly spending) in the last three full months. Income shows a
    "Salary" row, "Average of the last 3 months · from your entries", equal
    to the average of the months that had entries (one month only: that
    month; this month's salary never counts). Tap it → its editor has
    the amount (no "How often") and a note that the change stays in the
    plan; the switch turns it off. "Your changes" shows it with "Only in
    your plan" (no "Open payment"); the Apply sheet leaves it out with a
    one-line note, and after Apply it's still in the plan; Clear plan
    clears it. A salary-only plan survives a reload. Add a recurring salary
    rule in that category → the derived row goes and the banner says its
    change left the plan. No idea ever points at the Salary row.
13. No recurring income: an account with recurring payments only (no income
    rule, no salary entries). The card reads "Recurring payments a month"
    (Year: "…a year") with the total as a positive amount; cancelling one
    strikes the old total through and the chip says "€13.99 less" in
    green. The hint "Add your salary as recurring income to see your net."
    with "Add recurring income" opens the Recurring form set to Income.
    "Your changes" totals "Change in payments" (a saving is a minus, in
    green) and the Apply sheet says "Payments after applying". Adding a
    recurring income (or salary entries, or an income in "What if I add…")
    switches the card back to the net.

### L. Privacy & legal (GDPR)

39. Sign-up: the "I'm 16 or older and I accept the Terms of Use and the
    Privacy Notice" box is required (links open in a new tab); the hobby /
    no-financial-advice line sits under it. After confirming the email and
    signing in, no legal prompt appears, and Settings → Privacy → consent
    history shows both documents "accepted when you signed up".
    "Check your inbox" shows "Waiting for you to confirm…"; opening the
    link on another device (a phone) signs this tab in by itself within
    ~15 s, and after 15 minutes the line reads "Still waiting? Log in once
    you've confirmed." Every link in the auth emails (confirm, reset, sign-in)
    starts with the site's own address (`<site>/auth/confirm?…`, never
    supabase.co); opening one again shows "Link expired or invalid" with a
    way to a fresh link, and a reset link opens "Choose a new password".
40. Sign-up screen, "Sign up with Google": unticked, it shows the consent
    error under the box and doesn't leave; ticked, it goes to Google and, back
    in the app, no prompt appears and the consent history shows both documents
    accepted. Any account without the current versions (Google via the Log in
    screen for a new account, or after a `LEGAL_VERSIONS` bump): the loader,
    then ONLY a blocking "Before you continue" / "We've updated our terms"
    prompt listing the changes (no app behind it, nothing reachable by Tab);
    its Privacy Notice / Terms links open the document full-page, ← returns to
    the prompt; "I don't agree" offers Download my data, Delete my account and
    Sign out; Accept records it and the prompt doesn't return.
    Consent fails closed: signed in, the app never shows before the check
    answers. Offline (DevTools → Offline) in a fresh browser profile after
    signing in: "We couldn't check your account" with Try again / Log out;
    going back online re-checks by itself. Once the app has opened online on
    this device, an offline reload opens the app (the device remembers the
    acceptance of the current versions); after Log out it no longer does.
41. Settings → Privacy: Download my data saves `budgeer-my-data-<date>.json`
    with your profile, consents, notifications, records and your part of each
    group (no other user's ids/emails). "Send a request" opens its own page
    (`/settings/privacy/request`) and emails the privacy inbox (Reply-To = your address; 4th request in a day is refused). The
    switches record history rows. Weekly summary is off for a new account.
42. Delete account: the confirmation dialog lists what's deleted and what
    stays; afterwards co-members see "Former member" in the group and its
    change log.
43. Footer / Settings links: Help, Privacy, Terms, Contact (support@) on the
    landing page; Privacy, Privacy Notice and Terms of Use in Settings.
44. /privacy and /terms: the "A free hobby project" notice sits under the
    intro. Signed out, ← goes back to the previous page (the landing page when
    opened directly); signed in, they open inside the app (More is lit) and ←
    goes back, or to Settings when opened directly.

### M. Landing & Help

45. Landing "How it works": the three cards fade in as they scroll into view
    and each loops a small illustration (link copied → friends join; an
    expense split → your share; payments → all balances €0.00). With reduced
    motion they show the final state, still. No layout shift, no sideways
    scroll at 390px; check light and dark.
    The "Optional AI helpers" row after Multi-currency: a phone on Add where
    "coffee 3.60 yesterday" types itself, "Filling in the form…" shows, and
    amount, category, date, description and Paid from fill in one by one,
    each marked Suggested; then "salary 2450 today" fills an income, and it
    loops (Greek lines in Greek). It pauses off-screen and in a background
    tab; with reduced motion it shows the filled coffee form, still. The card
    keeps its height throughout; the three helper chips and the one-line note
    sit beside it, and "How it works" opens Help#ai-helpers.
46. Help & FAQ: the hobby-project notice is at the top; "Install Budgeer on
    your phone" has steps and a sketch per browser (the landing footer's
    "Install the app" opens it). Opening an answer with a clip loads only
    that clip: it plays muted and looped while in view, pauses with its
    button, and with reduced motion shows the still with a play button.
    "Copy link to this answer" on the live site copies a
    https://www.budgeer.com/help#… link.

### K6. Meal vouchers

Fake data: a Belgian-style setup (€8.00 a working day, top-up day 5, €34.50
on the card) and a few lunches and groceries paid with vouchers. Check at
390px (light and dark, English and Greek), desktop 1280 and sideways.

1. Settings → Meal vouchers: the switch, amount per working day (required),
   working days (Belgian or Greek holidays), the next top-up picked on a
   calendar (its day repeats monthly; 31 lands on a shorter month's last
   day), what's on the card today. Save → the Meal vouchers page (opened from
   its ⚙ button: back to it). Back returns to where the page was opened
   from. Settings shows the row between Monthly spending and Notifications.
   With a setup, More → Money lists Meal vouchers after Plan (desktop: the
   sidebar, after Plan), lit on /vouchers; without one it isn't listed.
2. Home: the Meal vouchers card sits under the totals (only with a setup):
   what's on the card and "+€X on <day>" with "<month> · N working days ×
   €8.00"; the › opens the page. Without a setup there's no card.
3. The page: what's on the card = the balance at setup + top-ups since −
   expenses paid with vouchers since; this month's top-ups and spending;
   Next top-up counts last month's weekdays minus that country's holidays
   (e.g. November in Belgium: 11 Nov off; April in Greece: Good Friday and
   Easter Monday off). Fix days opens in place: −/+ changes the amount, Save
   keeps it ("your days"), Cancel doesn't; setting it back to the calendar's
   count removes the fix.
4. History: month by month, newest first, each month's net; top-ups, the
   expenses (tap → the entry) and "On your card" at the setup date; "Show
   older" adds months.
5. Add → New expense: "Paid from" offers Bank · Savings · Meal vouchers
   (Savings only with a savings category, Meal vouchers only with a setup);
   Meal vouchers saves the expense as paid with vouchers: it's in Spent,
   categories and budgets, the ⓘ on Home says so, and the Net doesn't move.
   The ledger row says "meal vouchers". Editing keeps the choice; switching
   to income drops it.
6. Switch meal vouchers off in Settings → the Home card goes; the expenses
   keep their flag. Back up and restore into an empty account → the setup
   and the flag come back. The data export includes the setup.
7. Import the same bank statement twice → the second import adds nothing
   ("already there"), even when the rows' descriptions were saved in an
   older format; a row with a new date, amount or currency still imports.
8. Insights: tap a month in "Last 6 months" → that bar lights up, "Where your
   money went" shows that month (its name as the subtitle) with "All <month>
   expenses ›" opening Transactions filtered to it.


### K7. Touch targets, rows and help lines

At 390px (English and Greek, light and dark) and sideways at 844×390:

1. Touch targets: every icon button (the row ⋮, the ⓘ buttons, the header's
   bell, theme and avatar, a page header's + and ⋯, the goal −/+, comment
   icons, Home's chart/table toggle, segmented tabs, switches) answers a tap
   anywhere in a 44×44 area around it, without taking its neighbour's tap
   (the invisible area in `theme.js` HIT_AREA; neighbours sit 12–14px apart).
2. Recurring: tapping a rule's row opens it (`/recurring/<id>`); ⋮ still
   opens its menu, and the switch (from `sm` up) still pauses it.
3. Meta lines that wrap (a transaction's "· meal vouchers", "⟳ Repeats every
   month", a rule's "next 5 Oct") never start a line with "·"; sideways they
   stay on one line with an ellipsis. Savings history in Greek shows "από
   αποταμιεύσεις" in full (the line wraps), the ⟳ beside it.
4. A group's Balances: the highlighted line sums your side — "Léa owes you
   €184.17" for one person, "2 people owe you €233.22" for several, "You owe
   2 people …" the other way — and matches "Who owes whom".
5. One short line with an ⓘ that opens the rest in place: Import's start
   card, Budgets' "Tap a budget…" (the ⓘ only when the month was carried
   over), Edit expense's type ("Expense ⓘ": why it can't change), Settings ›
   Account's locked currency, Settings › Monthly spending's two switches.
6. Settings › Account: "Save changes" in both cards, the same size.
7. Pages with an eyebrow and a ← (Edit expense, Import, a category, Settings
   pages): the arrow sits level with the title, not the eyebrow.

### K8. Your salary

Fake data: a few years of net salary on the 28th (a January indexation each
year, a raise in September 2024), holiday pay as a second payment in May (in
2024 inside June's pay), a 13th month in December, overtime in October and
two bonuses in the Bonus category. Check at 390px (light and dark, English
and Greek), desktop 1280 and sideways 844×390.

1. Insights: "Your salary" sits under Income vs expenses: the regular pay a
   month, "+x% in <month>" (or "No raise yet"), a small step line; the › and
   "History and projections" open /insights/salary. With no salary entries
   the card says how to start and links to the page.
2. The page's pay card: the pay, the last raise, the step chart with the
   extras as small bars under it (colours as in the legend). One month only:
   no chart, a note to add earlier payslips.
3. Raises: months since the last raise, the average a year (compound; "—"
   under a year of pay), the changes newest first: Indexation (a Belgian
   January rise up to last year's inflation + 1 point), Raise, Pay down.
   A one-month blip is not a raise. With the salary shift on (Settings →
   Monthly spending) a salary paid from that day counts for the next month.
4. Extras: by year, newest first, two years then "Show older". A guessed one
   says "Guessed". Fix opens in place: pick Holiday pay / 13th month / Bonus
   / Not an extra, Save → "You set this", the chart and totals follow;
   Cancel changes nothing. "Not an extra" stays listed (muted) so it can be
   changed back. Reload → the corrections are still there (saved to the
   account). Without a category whose default is Bonus the card asks which
   income category holds bonuses (saved at once).
5. If things go on: 1/3/5/10 years; three lines (My trend only after a year
   of pay; Indexation only = the average inflation of the last three full
   years; What if with the 0–10% slider in 0.5% steps); each with the pay a
   month at the end and the total earned (regular pay, holiday pay and 13th
   month; no bonuses). The ⓘ explains it.
6. Against prices: Belgium / Greece (default: the meal-voucher country, else
   Greek → Greece, otherwise Belgium; a switch is saved), "Since" years; pay
   change, prices, real change and "€X a month more than / short of keeping
   up". The ⓘ names the source.
7. Year by year: each year's regular pay, extras and total ("so far" this
   year).
8. Empty states: no Salary category → add one; a Salary category with no
   entries → Add income (opens a new income in Salary).
9. Back up and restore into an empty account → the corrections come back on
   the restored entries. The data export has "salary_history".

### K9. AI helpers

Needs `ANTHROPIC_API_KEY` set for `ai-helper` on TEST. Fake data only: a
throwaway account with a few categories, a budget and some months of
entries. Check at 390px (light and dark, English and Greek) and desktop 1280.

1. Settings → AI helpers: three switches, all off for a new account; each
   says what is sent; the note says it goes to Anthropic, isn't used for
   training and is deleted within 30 days. Turning one on or off shows at
   once and survives a reload; Settings → Privacy → consent history lists
   each change. The demo account can't turn one on.
2. All off: no "Type it" on Add, no Suggested chips on Import, no summary on
   Insights or Home.
3. Type to add (Add, new entries only): "coffee 3.60 yesterday" fills
   Expense, 3.60, the main currency, yesterday, a matching category and
   "coffee", each marked Suggested; "μισθός 2792 στις 28" fills Income,
   Salary, the 28th; "sushi ¥1800 last friday" fills JPY 1800 and last
   Friday's date. With meal vouchers set up, "lunch 9 with meal vouchers" or
   "sandwich 6 ticket restaurant" sets Paid from to Meal vouchers, marked
   Suggested; with a savings category, "from savings 200 flight" sets
   Savings; a line with no hint leaves Bank, unmarked. Without vouchers or a
   savings category the line isn't asked about them (Paid from stays hidden).
   Undo puts the form back, Paid from included. A line with no amount says it
   couldn't tell. Nothing is saved until Save.
4. Import a statement with new merchants: under the review text, "Finding
   categories…", then "Suggested for n of m" and Suggested chips on the rows
   it could place (only your own categories, expense for money out, income
   for money in); a
   private person's name stays blank. Keeping a suggestion and importing
   saves the rule like a hand-picked one.
5. Month in plain words: Home's overview gets a Numbers | In words switch
   (This month only; none for last month, a year or all time, and none with
   the helper off). In words shows "✦ September in short" and 2–3 lines about
   this month, written once, every amount formatted as the app shows money
   ("€1,030.00"; Greek "1.030,00 €"; the usual in whole units), and the card
   is at least as tall as Numbers (nothing below jumps); reload → the same
   text and the same side, no new call. Add an entry → "Your totals changed
   since this was written." with Update; Update writes a new one. Switch the
   language → it's rewritten in that language. Insights has no summary. Turn
   the helper off → the switch is gone and the stored summaries are gone.
6. Failures: with the key removed every helper says AI helpers aren't available, and
   Add, Import and Insights still work normally. The data export has
   "ai_month_summaries".
