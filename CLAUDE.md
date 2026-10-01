# Budgeer — AI Guide

Workflow facts (environments, commands, commit rules, release steps, brand)
live in `.claude/project.md`; the process skills are in `.claude/skills/`
(start with `choose-skill` to pick the right one).

Budgeer is a financial **PWA**: personal expense/income tracker + friend
bill-splitter. React + Vite + Chakra UI on the client; Supabase (Postgres +
RLS + SECURITY DEFINER functions + Edge Functions + Auth + Realtime) on the
back end. Money is stored as **integer minor units**; multi-currency uses a
captured `exchange_rate` and zero-decimal currencies (JPY/KRW/VND/CLP) carry
no fractional part.

## Standing quality bar (do not regress)

Every change must keep all seven true. Treat them as acceptance criteria, not
aspirations — if a change would break one, fix the cause, don't paper over it.

1. **Maintainable structure.** By-feature layout (below). New behavior lands in
   the feature it belongs to, or in `shared/` if two+ features need it.
2. **Separation of concerns.** UI never talks to Supabase directly — data
   access lives in a feature's `*.js` data module (or `shared/lib`). Pure math
   lives in its own tested module (`splitMath`, `importMath`, `recurringMath`,
   `currency`, …), never inline in a component. `shared/` must **never** import
   from `features/` (wrong dependency direction).
3. **No code duplication.** Before copying logic, look for an existing helper.
   Client↔edge-function parity (CORS/auth/money/email) is factored into
   `supabase/functions/_shared/`. JS↔SQL "preview vs authoritative" pairs
   (e.g. split math) are the one intentional exception — keep them in lockstep.
4. **Every feature is tested.** Pure logic → a `test/*.test.js` unit test
   (`node --test`). Security-relevant DB behavior (RLS, definer functions,
   triggers) → a rolled-back assertion in `supabase/tests/db_tests.sql`. Adding
   a feature without a test is incomplete work — write the test.
5. **Cyber-security proof.** No secrets in tracked files (keys are injected at
   runtime / stored in Supabase Vault). Escape all HTML in emails/reports.
   Every SECURITY DEFINER function pins `search_path` and revokes EXECUTE from
   `anon`/`authenticated` unless deliberately callable. No `dangerouslySetInnerHTML`.
6. **No unsafe RLS.** RLS on every user table. Write policies are split per-verb
   (select/insert/update/delete), not a blanket `FOR ALL`. Server-authoritative
   columns (`created_by`, ownership) are forced by a BEFORE trigger, never
   trusted from the client. Mutations that fan out (push/email) are rate-limited.
7. **No dead code.** No unused imports, unreferenced exports, or orphan files.

## Architecture map

| Concern | Where |
| --- | --- |
| App shell, routing, providers | `src/app/`, `src/main.jsx` (zero data access) |
| Cross-feature utilities | `src/shared/lib/` (data: `db.js`, `supabase.js`, `realtime.js`, `fx.js`, `profile.js`, `push.js`, `transactions.js` (transaction reads/writes, `useOldestTransactionDate`, `useNewestCountedDate` = next month in the period pickers once its salary is in), `categories.js` (all category reads/writes, `useSavingsIds`), `accounts.js` (net-worth accounts); pure: `currency.js` (incl. `formatSigned`, `keptRate`/`effectiveRate`), `dates.js`, `periods.js` (month/year/all-time periods, plus next month when an entry counts in it; `thisMonthPeriod` is every picker's default), `categoryLinks.js` (category page URLs), `moneyParse.js`, `paginate.js`, `offlineReads.js`, `txnRollup.js`, `spread.js`, `ruleFx.js`, `salaryShift.js`, `environment.js`, `localeParse.js`, `queryCache.js`, `shortLandscape.js`, `themePref.js`, `categoryName.js` (display name, `entryName`, `NO_CATEGORY`, `presetCategoryId`); browser: `clipboard.js`) |
| Cross-feature UI | `src/shared/ui/` (design-system kit in `src/shared/ui/kit/`; `ShellHeader.jsx` = the sideways header's slots that `PageHeader`/`PageForm` fill; `SettingsSubPage.jsx` = the shell of every Settings sub-page; `ConfirmDialog.jsx` = every confirm modal (`DeleteTransactionDialog.jsx` builds on it); `CurrencySelect.jsx` = every currency dropdown; `chartAxis.js` = the money charts' axis ticks; `SumSteps.jsx` = an ⓘ box's "how it adds up" steps, Home's Net and Plan's left-over) |
| Sideways phones (landscape ≤ 500px tall) | `shortLandscape.js` (query, shell measurements, `landscapeOnly`, `NARROW_STACK`) + `useShortLandscape`; the rail and header live in `AppShell.jsx`; Home's stacks in `dashboardMath.homeStacks`, Savings' in `savingsMath.savingsStacks`; `shared/ui/narrowStacks.js` folds a stack's rows on the narrowest screens |
| Add a group expense from Add ("Who's it for?") | `TransactionPage.jsx` swaps in `GroupExpenseForm`'s `quick` layout; `groups/WhoForChips.jsx` (chips), `groups/myGroups.js` (the viewer's groups + recently used, `STORAGE_KEYS.recentGroups`), pure rules in `groups/quickAddMath.js` (`test/quickAdd.test.js`) |
| One entry form (Add/Edit an expense or income, and a recurring rule's edit page `/recurring/:id`; recurring entries are added only from Add with Repeat on) | `transactions/EntryFields.jsx` (the fields, one order and look; `kindOptions`) + `transactions/useEntryFields.js` (their state, Type it, validation), pure state ↔ row mappings in `transactions/entryForm.js`; `TransactionForm.jsx` adds FX, receipt, notes and the Repeat card; `recurring/RecurringForm.jsx` the rule's version (Repeat always on, the date is the next charge), rule ↔ form in `recurring/ruleForm.js`; the Repeat card and fields in `recurring/RepeatFields.jsx` (`RepeatPanel`); `test/entryForm.test.js`, `test/addLinks.test.js` |
| Plan mode (sandbox over recurring payments/income, `/plan`) | `src/features/plan/`: `Plan.jsx` + `PlanParts`/`PlanEditors` (inline editors: a row, "What if I add…", a change, the overlap picker; one open at a time)/`PlanSheets` (the Apply sheet)/`PlanBanners`, data in `plan.js` (one encrypted plan per account, apply/undo RPCs from 0095, salary edit kept by 0096), the page's state, its edits and every part's figures and words in `planPage.js` (`test/planPage.test.js`; the web's components and the iOS app both lay them out), pure maths in `planMath.js` (`test/planMath.test.js`; also the Savings group (savings taken from income, `_shared/planRules.planKindOf` 'savings', lowering what's left like Home's net, never an idea; savings adds applied with `savings_from_income` by 0107), the derived Salary and Savings rows from entries with plan-only `salary`/`savings` edits (0096/0107), the header ⓘ's `planSteps` shown with `shared/ui/SumSteps.jsx` (Home's "How Net adds up" too), and the payments view when there is no recurring income), the ideas' service catalogue and essentials in `planCatalog.js` (same test file); the wording (a payment per period, row lines, ideas, changes) in `planText.js` (`test/planText.test.js`); DB tests 93–97, 115–116 |
| Meal vouchers (a card topped up per working day, `/vouchers`, Settings → Meal vouchers) | `src/features/vouchers/`: `Vouchers.jsx` (the card, next top-up with Fix days, history), `VoucherCard.jsx` (Home), `VoucherSetup.jsx`, data in `vouchers.js` (one encrypted setup per account, 0097), pure maths in `voucherMath.js` (BE/GR public holidays, working days, top-ups, balance; `test/voucherMath.test.js`); expenses carry `paid_with_vouchers` (the `expense-from-vouchers` effect in `_shared/savings.ts`: spending, not against the net); "Paid from" on Add is `shared/ui/SavingsSwitches.PaidFromChoice`; DB tests 98–100 |
| Your salary (Insights card → `/insights/salary`: pay history, raises, extras, projections, pay against prices) | `src/features/salary/`: `SalaryPage.jsx` + `SalaryParts` (pay chart, raises, years)/`SalaryExtras` (extras with in-place corrections, Bonus picker)/`SalaryOutlook` (If things go on, Against prices), `SalaryCard.jsx` (Insights), data in `salary.js` (one encrypted corrections document per account, 0102), pure maths and the Eurostat HICP table in `salaryMath.js` (`test/salaryMath.test.js`), each card's figures and words in `salaryText.js` (`test/salaryText.test.js`); DB tests 106–107 |
| AI helpers (optional, one switch each in Settings → AI helpers: Type it on Add, category ideas on Import, the month in plain words as the In words side of Home's overview, What-if in your own words in Plan) | `src/features/ai/` (`ai.js` data, pure `aiMath.js` → `test/aiMath.test.js`; `MonthSummary.jsx` is the overview's In words side, the switch in `dashboard/Dashboard.jsx`, `STORAGE_KEYS.overviewTab`); the plan helper is `plan/PlanWhatIf.jsx` ("✦ Type a what-if" under "What if I add…", its preview one of Plan's inline editors) with pure rules in `plan/whatIfMath.js` (proposals → preview rows → `setChange`/`upsertAdd`, and Undo; `test/planWhatIf.test.js`); edge function `supabase/functions/ai-helper/` (Claude Haiku 4.5 via the official SDK; model in `_shared/aiHelper.ts` `AI_MODEL`, validation there incl. `normaliseWhatIf`, `test/aiHelper*.test.js`; the plan's rules filter shared as `_shared/planRules.ts`); switches, gate, rate limits and encrypted summaries in 0103, the what-if switch and its limit (30/hour) in 0105, the shared demo login's helpers (on after each nightly reset, a shared 100 calls/day cap, the note in `ai/DemoAiNote.jsx` and Settings' demo notice) in 0106; DB tests 108–114 |
| Translations (i18n) | engine + `useT`/`t`/`<Trans>` in `src/shared/lib/i18n/`, dictionaries per namespace in `src/locales/{en,el}/`, conventions in `docs/I18N.md`, Greek terms in `docs/i18n-glossary-el.md`, parity test `test/i18n.test.js` |
| Auth context | `src/shared/auth/` |
| Features | `src/features/{ai,auth,backup,budgets,categories,dashboard,groups,help,import,insights,landing,notifications,onboarding,plan,privacy,recurring,salary,savings,settings,transactions,vouchers,whatsnew}/` |
| DB schema & policies | `supabase/migrations/NNNN_*.sql` (append-only, ordered); the current definition of the most-changed functions in `supabase/sql/functions/<name>.sql` (edit there, paste into the migration; `test/sqlFunctions.test.js` keeps them equal) |
| Server logic | `supabase/functions/*` (+ shared code in `functions/_shared/`) |
| DB config (JWT verify per function) | `supabase/config.toml` |
| Service worker (precache, offline reads, push) | `src/sw.js` |
| Public status page (Cloudflare Worker + D1, own deploy) | `status/` (pure logic in `status/src/{state,fxCalendar,uptime,validate,html,time,access}.js`, tests `test/status*.test.js`, deploy `.github/workflows/status-deploy.yml`) |
| iOS core (the web's pure maths and wording run in JavaScriptCore by the native app; never re-implemented in Swift) | `mobile-core/` (`modules.js` the module list, `index.js` the entry, `build.mjs` → `core.js` with a forbidden-import guard, `record/` the vector recorder), `ios/BudgeerCore/` (Swift package, `BudgeerCore.swift`, `vectors.json`), `ios/README.md`; `npm run core:build`, `npm run core:vectors`; replay tests `test/mobileCore.test.js` (Node) and `VectorReplayTests` (the `ios-app` workflow, macOS) |
| iOS app (SwiftUI, iOS 17, native iOS design with Liquid Glass on iOS 26; every figure, label, grouping, validation and form ↔ row mapping from the core, the strings from `src/locales`) | `ios/Budgeer/` (`project.yml` → XcodeGen, Dev/Prod schemes over `Config/*.xcconfig`; `Budgeer/App` the frame (`AppFrame`: the floating tab bar Home · Activity · Groups · More with Add beside it, each tab's stack of pages (`AppRoute`), the Add sheet, the bell's page `NotificationsView`), `AppLock` + `LockView` (the optional Face ID lock; its app PIN `AppPin` (a salted PBKDF2 hash in the Keychain, `PinKeychain`, with backoff) and the lock screen's "Use PIN" slot `LockPinEntry`; Settings › Face ID lock `LockSettingsView`), `AddSlot` (the floating Add is the only add button; a page lends it its own add), `ShellModel` (initials, the bell via `bellMath`), `Auth` email + Google sign-in, `SessionStore`, the legal gate, `Data` = repositories over the web's RPCs (`SupabaseStore`), the offline `QueryCache`, realtime `RealtimeFeed`/`LiveHub`, `FxRates`, `PeriodSource`; one folder per screen with its `…Figures` (the web's steps as core calls), model and view: `Home` (month pager, sections), `Transactions` (`AddSheet` = Add/Edit/a rule, with Scan a receipt (`ReceiptReader` = Apple's Vision on the device, its boxes read by the web's `shared/lib/receiptRead.js` (`receiptText`, `readReceipt`, `receiptFields`/`receiptResult`, `receiptFill`; also the web's `ReceiptScanner`/`TransactionForm`), `ReceiptModel`'s check in place, also on a new group expense (`GroupExpenseModel.useReceipt`: the total and date only), the camera's `NSCameraUsageDescription`), `ActivityView` = the month's header (`rowParts.monthPulse`), the chips and the rows by day with swipes), `Budgets`, `Recurring`, `Insights` (+ the salary card, net worth over `insightsMath.netWorthParts` with `AccountEditorModel` over `accountDraft`/`accountToSave`, the statement from the `generate-report` function named by `_shared/files.statementFilename` and handed to the share sheet), `Plan` (`PlanFigures` over `planPage.planReads`/`planState`/`planPageParts`, `PlanModel`: every edit a `planPage`/`planMath` call, one editor open at a time, the debounced save, apply/undo and the what-if in `SupabaseStore+Plan`), `Salary` (`SalaryFigures` over `salaryMath.salaryReport` and `salaryText`'s parts, the charts in Swift Charts, corrections saved whole), `Savings` (`SavingsFigures` over `savingsMath.savingsPage`/`savingsHistory`/`goalParts`, the pot's line in Swift Charts, `GoalEditorModel` over `goalDraft`/`goalToSave`; accounts and goals in `SupabaseStore+Savings`), `Vouchers` (`VoucherFigures` over `voucherText.voucherPageParts`/`daysFixParts`/`voucherHistoryParts`, Fix days in place, `VoucherSetupModel` = Settings › Meal vouchers over `voucherMath.setupDraft`/`setupToSave`), `More`, `Settings` (the web's Settings pages but Import rules and Your data, which come with their features: `AccountModel` (profile, photo, payment details), `PreferencesModel` (Monthly spending, Notifications' email and summary switches, AI helpers), Appearance (`Support/AppAppearance`), Language, `SecurityModel` over `Auth/AccountSecurity` (sign-in methods, password, Google, delete account), `PrivacyModel` (rights, data file, request, consent history), What's new, the website's legal/help/status pages in Safari via `WebPage`; the pure rules in `spendingPrefs`, `authMethods`, `legal`, `whatsNewMath`, `themePref`, `contact`, `reauth.isRecentClaims`), `Categories` (`CategoriesModel` + `CategoryEditorModel`: the list by kind, archive, delete with a move, add/edit name, icon, colour, savings via `categoryMath`, `categoryStyle.categoryPicker`, `categoryName.newCategoryRow`/`categoryUpdateRow`), `Groups` (the tab's grid of group cards, the new-group flow `NewGroupModel`/`NewGroupView` (cover upload as `uploadGroupImage`; the cover choices and each group's own colour from the web's `groups/groupCover.js`, which the web's `CoverPicker`/`GroupMark` use too, invites via `GroupInvite`), a group's page with its timeline (`GroupTimeline`) and the PDF statement (the `group-report` function, named by `_shared/files.groupStatementFilename`, to the share sheet), `EditGroupView` (the owner's name and picture, the cover picker `GroupCoverPicker`/`GroupCoverFile` shared with the new-group flow), `BalancesView`, `GroupForms` = expense sheet / Add's quick group form, settle up (with the web's payment-details ask, `payLinks.askForPaymentDetails`, saved as Getting paid), members; joining from an invite link (`JoinModel`/`JoinView`: `budgeer://join/<token>` through `JoinInbox`, or Join with a link on the tab; `groupFormat.inviteToken`/`joinParts`, `preview_link_invite`, `join_via_link`); figures in `GroupFigures` from `groupFormat`'s parts incl. `timelineParts`, `groupExpenseForm.js`, `settleForm.js`, `avatarLook.js`); `Theme` = the web's colour tokens + the native kit (`NativeStyle`, `NativeMotion` (the springs, the one ⓘ, rolling figures, `NativeFlow`), `NativeTone` (the brand's icon tones; every tile in the category-badge style), `NativeGlass` behind `#if compiler(>=6.2)`/`#available(iOS 26.0, *)`, `NativeTabs`, `NativeParts`, `NativeChrome` incl. the confetti) + `CategoryBadge` + `BrandMark` (`BrandIntro`: the sign-in's wordmark, `loaderTiming.ringIntro`), the web's Lucide category icons as template SVGs in `Resources/AppIcon.icon` + `AppIcon-Dev.icon` (the layered iOS 26 icons, Icon Composer; Dev configurations take the Dev one via project.yml, PNG fallbacks of the same names in `Assets.xcassets`), `Resources/Icons.xcassets` (`mobile-core/icons.mjs`, `npm run ios:icons`, `test/iosIcons.test.js`, ISC licence beside them), `Support/L10n` + `AppLanguage`; `BudgeerTests` = view models over `FakeStore` (and `FakeSecurity`), `AppLockTests`, parity against `Fixtures/{home,ledger,budgets,recurring,insights,savings,vouchers,groups,plan,salary,networth}.json`, snapshots at 402×874), generators `mobile-core/strings.mjs` (`npm run ios:strings`, also each language's `InfoPlist.strings`; parity fails the build), `mobile-core/homeFigures.mjs` + `screenFigures.mjs` + `groupFigures.mjs` (`npm run ios:fixture`; `test/iosHome.test.js`, `test/iosScreens.test.js`, `test/iosGroups.test.js`, `test/iosStrings.test.js`); what is real in `ios/README.md`; CI `.github/workflows/ios-app.yml` (macos-26, Xcode 26.5: xcodegen, Simulator build, the core's replay, tests, snapshot PNGs; on develop and PRs, else by manual dispatch) |
| Lint / CI | `eslint.config.js`, `.github/workflows/test.yml` |

Each feature folder holds its components (`*.jsx`), its data module (`*.js`
wrapping Supabase calls), and its pure math module where applicable.

## Data & realtime conventions

- Read/write owned tables through `shared/lib/db.js` and the feature data hooks;
  don't scatter `supabase.from(...)` across components.
- Live updates use the `useLiveRefetch` pattern (subscribe to `postgres_changes`,
  debounced refetch, catch-up on reconnect + tab-visible). Realtime is primary;
  any polling is only a backstop.
- Two Supabase projects: **TEST/DEV** `ctvdljzybbujuywppixo` (dev.budgeer.com)
  and **PROD** `tuxfpylowcxazinqtrzx` (budgeer.com). Schema changes and function
  deploys must be applied to **both**. Delivery is env-agnostic via Vault
  (`project_url`, `x-cron-secret`).

## Verification (run before declaring done)

- **Unit tests:** `npm test` (node --test over `test/*.test.js`).
- **Lint:** `npm run lint`.
- **DB security tests:** run `supabase/tests/db_tests.sql` against the TEST
  project (rolled-back; safe on live data). It must end with
  `ALL DATABASE TESTS PASSED`.
- **Manual:** `npm run dev`, exercise the changed feature; for schema changes,
  apply the migration to TEST first and verify, then PROD.
- **Release notes:** every production release adds a new entry at the top of `src/features/whatsnew/releases.js` (dated the release day; ids are unique `YYYY-MM-DD`).
- See `docs/TESTING.md` for the full manual plan.

When you change the schema or a policy, add the matching rolled-back assertion
to `db_tests.sql` in the same change — that is how principle #4 stays true for
the back end.
