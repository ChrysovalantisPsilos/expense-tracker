# Budgeer for iOS

Two parts: the **core** (the web's JavaScript in JavaScriptCore) and the
**app** (SwiftUI) that shows what the core answers. The core first.

## The core

The native app is SwiftUI. Its maths and wording are **the web app's own
JavaScript**, bundled into one file and run in Apple's JavaScriptCore. One
engine, not two: a figure the app shows is computed by the same function the
website runs, from the same source file, so the two can't disagree.

### Why JavaScriptCore

Budgeer's logic (splits, spreads, salary shifts, plan maths, statement
parsing, vouchers, the wording of every period and row) is pure JavaScript
that the web app already tests. Rewriting it in Swift would give two
implementations that drift. JavaScriptCore ships with iOS, needs no
dependency, starts in milliseconds, and runs the bundle exactly as Safari
would.

| Swift | JavaScript (the core) |
| --- | --- |
| UI (SwiftUI), navigation, storage, Supabase auth and data, push, keychain, biometrics | every calculation and every derived label: `currency`, `splitMath`, `planMath`, `periods`, `planText`, the import parsers, … (the list is `mobile-core/modules.js`) |

**The rule:** maths is never re-implemented in Swift. If the app needs a
figure the core doesn't give, add it to the web's pure module (with its unit
test) and expose the module, then call it from Swift.

### Layout

```
mobile-core/
  index.js          the entry: one namespace per module, setLanguage, the JSON bridge
  modules.js        the module list (name → source file), the forbidden packages
  vectorCodec.js    how undefined / Date / Set / Map / a thrown error travel as JSON
  build.mjs         esbuild → core.js (IIFE, globalThis.BudgeerCore), with the graph guard
  record/           the vector recorder (loader hooks + wrapper + driver)
ios/BudgeerCore/    the Swift package (iOS 17 / macOS 14, no dependencies)
  Sources/BudgeerCore/BudgeerCore.swift      the JSContext wrapper
  Sources/BudgeerCore/Resources/core.js      generated, not committed
  Tests/BudgeerCoreTests/                    load, language and vector replay tests
  Tests/BudgeerCoreTests/Resources/vectors.json   the recorded vectors (committed)
```

### Building the core

```bash
npm run core:build      # → ios/BudgeerCore/Sources/BudgeerCore/Resources/core.js
```

An ES2020 bundle (about 1.3 MB, unminified so stack traces name the web
function) that sets `globalThis.BudgeerCore`. It contains no React, Supabase
or browser code: the build fails on any such module in the graph, and
`test/mobileCore.test.js` loads it in a bare context with only the engine's
globals. Run it before opening the Swift package in Xcode (the package
declares the file as a resource); CI runs it in `.github/workflows/ios-app.yml`.

From Swift:

```swift
let core = BudgeerCore.shared
try core.setLanguage("el")
let shares: [Int] = try core.call("splitMath", "splitEqually", [1000, 3])   // [334, 333, 333]
let label = try core.money.format(123_456)                                   // "1.234,56 €"
```

`call` takes any `Encodable` arguments and decodes any `Decodable` result;
`JSDate` and `JSUndefined` pass a Date or `undefined`. A missing function, a
JavaScript exception and an error the web's code throws on purpose each
come back as a `BudgeerCoreError`. The context is shared and every call is
serialised on one queue. Dates format in the process time zone; English
uses the device's Intl locale, as the web does.

### How the vectors work

The proof that bundle = source lives in `vectors.json`. Nobody writes it by
hand:

```bash
npm run core:vectors    # → ios/BudgeerCore/Tests/BudgeerCoreTests/Resources/vectors.json
```

It runs the web's unit tests once (TZ=UTC) with loader hooks that wrap every
exported function of every core module. Each call whose arguments and
result are JSON-encodable, that read no clock or randomness (`new Date()`,
`Date.now`, `Math.random` and `crypto` taint the call), that answers the
same a second time, and that ran in UTC becomes one vector:
`{ m, f, l?, a, r }`: module, function, language when not English, the
arguments as JSON text (an object's key order is part of the call) and the
result. The recorder keeps one vector per distinct call, at most 80 per
function, and prints which exported functions no test reached.

Two replays check every vector:

- `test/mobileCore.test.js` (in `npm test`) builds the core with esbuild
  and replays it in a Node `vm` context with the engine's globals only.
- `VectorReplayTests` (`cd ios/BudgeerCore && TZ=UTC swift test`) replays it
  through JavaScriptCore and compares the results as JSON values: exact for
  strings, booleans, integers and structure, 1e-9 relative for fractions.

A vector that differs between engines points at an engine difference
(Intl's spacing or month abbreviations, say), which is exactly what the
suite is for.

### Adding a module

1. Keep the module pure: a function of its arguments and the active
   language. Data access stays in the feature's data module.
2. Add it to `CORE_MODULES` in `mobile-core/modules.js` and as an
   `import * as name` plus a `modules` entry in `mobile-core/index.js`.
3. `npm run core:build` (the guard says if it reaches something it mustn't),
   then `npm run core:vectors` and commit the new `vectors.json`.
4. `npm test` replays it on Linux; the `ios-app` workflow replays it on a
   Mac.

## The app

`ios/Budgeer` is a SwiftUI app for iOS 17, bundle id `com.budgeer.app`. Its
Xcode project is generated, never committed:

```bash
brew install xcodegen
npm run ios:prepare     # core.js, the strings, then xcodegen generate
open ios/Budgeer/Budgeer.xcodeproj
```

Pick the **Budgeer Dev** scheme (the default: the TEST Supabase project,
dev.budgeer.com's accounts) or **Budgeer Prod** (PROD; release builds only).
Each scheme's pre-action runs `scripts/prebuild.sh`, which rebuilds the core
and the strings from the web's source, and the target's first build phase
fails with a clear message when they are missing.

### Configuration

`Config/Dev.xcconfig` and `Config/Prod.xcconfig` hold the project URL and its
public anon key (the same key the website ships; Row Level Security is the
guard, and no secret key ever goes here). They reach Swift through Info.plist
(`AppConfig.load()`); a build without them shows what is missing instead of
talking to nowhere. A developer's own settings (`DEVELOPMENT_TEAM` for a
device build) go in `Config/Local.xcconfig`, which is not tracked.

### Layout

```
ios/Budgeer/
  project.yml            the XcodeGen spec (targets, schemes, packages, the budgeer:// URL scheme)
  Config/                Base / Dev / Prod xcconfig
  scripts/prebuild.sh    core + strings before a build
  Budgeer/
    BudgeerApp.swift     the entry: AppConfig → AppContainer → RootView
    App/                 AppContainer (the client, the data layer, the cache, the live feed, the lock, the join
                         link waiting), RootView (sign-in, the legal gate, the frame, the lock over it, a
                         budgeer://join link), AppFrame (the tabs, each tab's
                         stack of pages (AppRoute), the Add sheet, AppRouter), AddSlot (what Add does on a page
                         that lends it its own add), NotificationsView (the bell's page), AppLock + LockView (Face
                         ID), AppPin (the lock's PIN: rules, backoff) + PinKeychain (the Keychain item, PBKDF2) +
                         LockPinEntry (the lock screen's "Use PIN" slot, PinPad), ShellModel (your picture, the
                         bell's feed), LiveRefresh, AppPaths (a web address as a tab and its pages), WelcomeModel +
                         WelcomeLayer (the default categories, the setup wizard or What's new, once per session) +
                         OnboardingView + WhatsNewStoryView, TourModel + TourOverlay (the tour's coach marks,
                         tourTarget)
    Auth/                AuthService + SupabaseAuthService (email, Google), SessionStore, SignInView, LegalGateView,
                         AccountSecurity (Settings › Security's calls: identities, the token's claims, the
                         password, linking Google), AccountAccess + SupabaseAccountAccess (sign up, the
                         confirmation again, a reset link), AccountForms (their models), AccountPages
                         (AuthFlowView: Sign up, Check your inbox, Forgot password)
    Data/                Repositories (the protocols, DataLayer), SupabaseStore (the web's RPCs and tables;
                         +Groups, +Settings: the profile, the payment details, the photo, categories, privacy;
                         +Savings: the net-worth accounts, the goals, the meal vouchers' setup; +Plan: the
                         plan, apply and undo, the what-if helper, the salary's corrections, saving and removing
                         a net-worth account, the statement),
                         QueryCache (offline reads on disk), RealtimeFeed + LiveHub (postgres_changes → debounced
                         refetch), FxRates (ECB rates as fx.js), PeriodSource (the period pickers' options)
    Home/                HomeFigures (Dashboard's steps as core calls), HomeViewModel, HomeView (the month pager,
                         the sections, HomeCategoriesPage)
    Transactions/        EntryFormModel + AddSheet (Add/Edit/a rule: the amount, the keypad, the details),
                         ReceiptModel + ReceiptCard + ReceiptReader (Scan a receipt: Vision on the device, the
                         check, CameraPicker),
                         LedgerFigures + LedgerModel + ActivityView (the month's header, the chips, the rows by
                         day, the month pill, search, swipes), TransactionWords (the delete question)
    Budgets/             BudgetFigures, BudgetsModel, BudgetsView
    Recurring/           RecurringFigures, RecurringModel, RecurringView
    Insights/            InsightsFigures, InsightsModel, InsightsView (Swift Charts draws, the core computes; the
                         salary card, net worth, the statement and its share sheet), NetWorthFigures,
                         AccountEditorModel + AccountEditView (+ AccountEditHost: a net-worth account's page)
    Plan/                PlanFigures (Plan.jsx's steps as core calls), PlanModel (the page, the edits, the save,
                         apply and undo, the what-if), PlanView (the header, the notices, the ideas, the rows,
                         Your changes), PlanEditors (a row's editor, What if I add…, the overlap picker, Type a
                         what-if, the Apply sheet)
    Salary/              SalaryFigures (salary.js's steps), SalaryModel, SalaryView (the pay and its chart, the
                         raises, the extras with Fix, If things go on, Against prices, year by year)
    Savings/             SavingsFigures (Savings.jsx's steps as core calls), SavingsModel, SavingsView (the pot and
                         its line, This month, the goals, the history), GoalEditorModel + GoalEditView (+ GoalEditHost)
    Vouchers/            VoucherFigures (Vouchers.jsx's steps), VouchersModel + VouchersView (the card, the next top-up
                         with Fix days, the history), VoucherSetupModel + VoucherSetupView (Settings › Meal vouchers)
    Groups/              GroupFigures (the groups' figures as core calls), GroupsModel + GroupsView (the tab's
                         grid, Join with a link), NewGroupModel + NewGroupView (the new-group flow; the cover
                         picker and its upload, GroupCoverPicker + GroupCoverFile), GroupModel (+ GroupInvite) +
                         GroupTimeline + GroupPageView (a group's page, its timeline, the statement),
                         EditGroupView (the name and the picture), BalancesView, GroupExpenseModel +
                         SettleUpModel + GroupForms (the expense sheet and Add's quick group form, Settle up
                         with the payment-details ask, Members), CommentsModel, MyGroupsModel (Add's "Who's it
                         for?"), JoinModel + JoinView (a group from an invite link; JoinInbox)
    More/                MoreView (you over "Account & settings", Money (Budgets, Savings, Recurring, Plan; Meal
                         vouchers once set up), Insights)
    Settings/            SettingsView (the list, its rows, the demo note), AccountModel + AccountView,
                         PreferencesModel + PreferencesViews (Monthly spending, Notifications, Appearance, AI
                         helpers), SecurityModel + SecurityView (+ DeleteAccountSheet), PrivacyModel +
                         PrivacyView (+ PrivacyRequestView, WhatsNewView), LanguageView, LockSettingsView (Face ID
                         lock: the switch and the app PIN), SettingsFigures (the
                         plain pages' core calls), WebPage (the website's pages in Safari), HelpView (Help & FAQ)
    Categories/          CategoriesModel (+ CategoryEditorModel), CategoriesView (+ DeleteCategorySheet),
                         CategoryEditView (+ CategoryEditHost), CategoryPageFigures + CategoryPageModel +
                         CategoryPageView (a category's page, + CategoryPageHost)
    Theme/               Theme (the web's colour tokens), NativeStyle (the coral tint, Poppins titles and money
                         figures), NativeAppearance (the bars' title faces), NativeGlass (Liquid Glass on iOS 26,
                         the standard material on iOS 17–18), NativeTabs (the floating tab bar with Add beside
                         it), NativeParts (section headers, money, bars, the brand's icon tones and tiles,
                         avatars, loading and failure states, rich text), NativeMotion (the springs, the ⓘ and
                         its explanation, rolling figures, NativeFlow for wrapping tags), NativeChrome (the bell
                         and your picture, the confetti), NativeSwatch, NativeHaptics, CategoryBadge (+
                         RepeatingBadge), BrandMark (+ BrandIntro, the sign-in's wordmark)
    Support/             AppLanguage, ProfileLanguage (the account's language), L10n (the generated strings),
                         AppAppearance (light, dark or the phone's), JSONValue, CoreHelpers, CategoryLook, ISODay
    Resources/Fonts/     Poppins and Manrope, semibold and bold (OFL, static TTFs)
    Resources/AppIcon.icon/     the layered iOS 26 icon (Icon Composer: icon.json + the mark's stem and two arcs as
                                SVG layers in two glass groups, on the cream; dark: the ink); AppIcon-Dev.icon the Dev
                                configurations' (the same mark on the ink, an amber DEV band as its own layer)
    Resources/Assets.xcassets/  AppIcon and AppIcon-Dev: one opaque 1024 px PNG each, the same name's fallback for a
                                build that can't read the .icon
    Resources/Icons.xcassets/   the web's Lucide category icons as template SVGs (npm run ios:icons; committed)
    Resources/LUCIDE-LICENSE.txt  Lucide's ISC licence
    Resources/Generated/ <lang>.lproj/Localizable.strings and InfoPlist.strings — generated, not committed
  BudgeerTests/          view models over FakeStore, the parity tests, the strings, snapshots
    Fixtures/*.json      the web's figures for fake inputs: home, ledger, budgets, recurring, insights,
                         savings, vouchers, groups, plan, salary, networth (npm run ios:fixture)
```

### What is real and what is not

Every figure, label, grouping, validation and form ↔ row mapping below is
a core call (the web's function); Swift reads, lays out and draws.

- **Sign-in** under the wordmark, whose mark draws itself once as the
  website's loading ring does (loaderTiming.ringIntro: the amber arc, then
  the coral one, the stem stretching and settling, the word brightening;
  still under Reduce Motion), with email and password, or **Google** (`signInWithOAuth`
  through `ASWebAuthenticationSession`, back to `budgeer://auth-callback`;
  a cancelled sheet is not an error). supabase-swift is pinned to 2.49.0,
  the last release on Swift tools 5.10 (picked when CI ran Xcode 15.4; it builds on 26 too). The
  session lives in the Keychain. Apple and passkeys are still refused.
  **Sign up** is its own page, as the web's sign-up mode: email and
  password with the password's rules (`authChecks.authErrors`, shown from
  the first try), the "I'm 16 or older and I accept…" tick with the Terms
  of Use and the Privacy Notice opening in Safari inside the app, and the
  consent the web records as the account's metadata
  (`legal.signupConsentMetadata`); Sign up with Google needs the same tick
  (its consent is then the legal gate's). Without a session it goes to
  **Check your inbox**, which signs in by itself once the link is opened on
  any device (`confirmWait`'s schedule, the password kept in memory only),
  with Log in when it gives up, "resend it" (then a minute's wait) and "use
  a different email". The confirmation link itself is the website's
  (`/auth/confirm`, as every Supabase Auth email links). **Forgot
  password** sends the reset link (`resetPasswordForEmail`, the same answer
  whether or not the address has an account); the email's link opens the
  website's reset page, as the emails link to the website and the app has
  no Universal Links yet (Associated Domains need a paid developer
  account), so the new password is chosen there.
- **The legal gate**: `my_legal_status` after every sign-in, failing
  closed; the app cannot record consent yet (the gate says to accept on the
  website, then "Retry").
- **What greets an account** (`WelcomeModel`, once per signed-in
  session): the default categories when it has none (`seed_default_categories`,
  as the web's ensureSeeded); then for a new account (`profiles.onboarded_at`
  empty, `onboardingMath.needsOnboarding`) the **setup wizard** full screen,
  the web's four steps: Welcome (your name and currency), Split costs with
  friends (a first group, optional), Stay in the loop (Enable notifications:
  the `WelcomeModel.pushOptIn` hook, off until the app's APNs push lands;
  the web's passkey offer waits for the app's passkeys), and the tour
  (Start tour or Skip tour); closing it stamps it done
  (`onboardingMath.finishFields`, the tour marked seen unless it follows);
  a group made on the way is where it ends up. Then the **app tour**
  (`tourSteps.tourStops('mobile')`: the web's stops and words) as coach
  marks over the real tabs: each stop opens its tab and page, dims the
  screen around what it is about (a page's view marked `tourTarget`, the
  tab bar's tabs and Add, the bell and initials) with "Step 3 of 12", Skip,
  Back and Next; a stop whose mark isn't there is passed; it picks up by
  itself when never finished (`tourPending`), ends marked seen
  (`profiles.tour_done`) and is in Settings as Take the tour again.
  Otherwise **What's new** (`whatsNewMath.storyFor` over
  `profiles.whats_new_seen`, marked seen as it opens): the story full
  screen, a page per change with the brand's ring and its chips, "New · 1
  of 2 · 2 Oct", the action opening that screen (`AppPaths`), Skip and Next.
- **The data layer** (`Data/`): repositories over the web's RPCs and
  tables, every read cached on disk (per account, cleared on sign-out) and
  served when offline, and one realtime channel whose changes refetch the
  open screens (debounced, plus a catch-up when the app comes to the
  foreground), as `useLiveRefetch` does.
- **The frame**: iOS's own. Four tabs in a floating bar (Home, Activity,
  Groups, More) with Add beside them as its own button; on iOS 26 the
  system's Liquid Glass tab bar (Add in its separate trailing slot, the bar
  shrinking while you scroll), on iOS 17–18 a bar of the same shape in the
  standard material. Every tab is a stack of pages under a large title, with
  the bell (its unread count; the notifications as a page pushed on the
  tab you're on, each with when it came, the new ones marked) and your
  picture or initials (Settings) top right. The appearance follows the phone unless
  Settings › Appearance picks light or dark. Add is the only add button:
  no page carries a + in its bar; a page whose own thing is added lends Add
  its action while it's on top (`AddSlot`): Budgets a new budget,
  Categories a new category of the kind shown, Recurring a recurring entry
  of the kind shown, a group's page an expense in that group; anywhere else
  it's a new entry. Things open and close in place on one spring
  (`NativeMotion`), every ⓘ opens its explanation the same way, and figures
  roll their digits when they change.
- **Add / Edit an entry** (Add; a row in Activity; a rule in Recurring), a
  sheet: the amount first, on a keypad, the category chips and the day; pull
  it up for the rest, in the web's words: Type it when the AI switch is on
  (`ai-helper` `parse_entry`), Repeat, the currency with the ECB preview
  (or a rate typed), Paid from (savings, meal vouchers), "Who's it for?"
  (Just me or a group, most recently used first; a group turns the sheet
  into its quick form, carrying what was typed) and Notes. Saved with
  `save_transactions` / `update_transaction` / `save_recurring_rule`,
  deleted after a confirm. **Scan a receipt** on a new expense (a pill
  beside the day and the currency: Take a photo, or Choose a photo): the
  phone reads the words with Apple's Vision (`VNRecognizeTextRequest`, on
  the device), the core turns its boxes into the receipt's lines
  (`receiptRead.receiptText`) and reads them as the web does
  (`readReceipt`); the check shows the merchant, total, currency and date
  to correct in place (`receiptFields`, the web's "Correct anything…" or,
  when little was read, its note), and Use these fills the form as the
  web's (`receiptResult`, `receiptFill`: the amount in the receipt's
  currency, the date, the shop while the description is empty). The photo
  is never uploaded or kept, as on the web; the website's crop and turn
  step isn't here (Vision reads a photo upright and whole). The camera's
  reason is `NSCameraUsageDescription` (`ios:native.receipt.cameraUsage`,
  in both languages' InfoPlist.strings). A new group expense scans one
  too (its sheet, and Add's quick group form), filling only the total in
  the currency paid and the date, as the web's group form does.
- **Home**: a month per page you swipe between (the months since the first
  entry), the month's spend with Income and Net (the ⓘ: How Net adds up);
  "every budget held" on a past month that kept them all (a burst of
  confetti the first time), and what was put aside with "See savings ›"
  (Savings); then Budgets, the month in plain words (when its AI switch is
  on), Coming up (or what a past month was charged), By category and Meal
  vouchers, a few rows each with See all (Meal vouchers' opens their page).
- **Activity**: the month at a glance (spent, income and net, a bar per
  day, the biggest day; rowParts.monthPulse), chips for the kind and the
  categories (and Groups: only your shares of group expenses, txnFilter's
  shared filter), then the month's entries by day, each day in its own card
  with what it spent; a floating glass pill for the month; search over all
  history.
  Swipe left to Delete (after the web's question), right to Duplicate (Add
  with today's date) or Split with a group (the group's quick form; the
  personal entry goes once the group's is saved); a tap opens Edit.
- **Budgets** (from Home): the month's bars and tones, set or change a
  budget (Add sets a new one here), the carried-over label, copy last month's.
- **Recurring** (from More): Subscriptions and Income, the totals per
  frequency, pause, tap to edit the rule, add one (Add, with Repeat on and
  the kind shown).
- **Insights** (from More): "Where your money went" (tap a month in the
  last six: the bars, the split and its shares spring to it, the rows kept
  by name so nothing flickers), "Income vs expenses", Spending abroad, then the web's other
  cards: **Your salary** (the regular pay, the last raise and a small step
  line of the pay; it opens the salary page, or says how it works before any
  pay), **Net worth** (Assets and Debts, the savings accounts with "See
  savings ›", the savings pot's line when there are none (red, "More paid
  from savings than saved", below zero), the other accounts, the net worth;
  "+ Account" and a tap open an account's page: its name, what it is (an
  asset, a debt, savings, with the savings note), its balance in its own
  currency, Add account / Save changes, Delete; a delete asks first, from
  the page or a swipe, as on the web) and **Export statement**, one
  compact row (From and To, this month by default; a small Export button
  offers PDF or Excel, off before anything
  was logged; the file comes from the `generate-report` edge function, the
  same builder (`statementFile.ts`) the website runs on the device, named as
  the web names it (`statementFilename`), then the share sheet, and a Share
  row to send it again). Reads: my_accounts, every income entry and expense
  paid from savings (the pot), every category, my_salary_history,
  my_meal_vouchers, the oldest entry; writes: save_account, deleting an
  account.
- **Plan** (More › Money), as the web's page: the header (what's left over
  a month or a year after the plan, Month / Year, the move as a chip, "was"
  struck through, what goes into savings; the ⓘ opens how it adds up in
  place, each step with today's figure struck through where the plan moves
  it), the last apply ("Applied 2 changes", Undo for 24 hours after a
  question, View Recurring; then the quiet note), "Your recurring changed
  since you planned" with OK, the ideas to save as cards you swipe through
  (an overlap's Try it opens its picker in place: tick which to cancel, the
  saving follows the ticks; a price rise on an essential opens the payment
  to try a lower price; × dismisses), the rows by group (Income, Savings,
  Bills, Subscriptions; the switch keeps or cancels, a tap opens the row's
  editor in place: the amount with the live delta, how often, keep or
  cancel, Reset, Done; a Salary or Savings row from the entries stays
  monthly and says its change is only in the plan), "What if I add…" (a
  cost, income or savings, its name, amount and currency, how often, the
  start, the category, the live delta), "Type a what-if" when its helper is
  on (`ai-helper` `plan_whatif`: the proposals to check, untick or edit in
  place, Add to plan, Undo), then Your changes (each with what it does a
  month and a year, Undo this change or Remove, Open payment for a real
  rule; the total; Apply, a sheet with every change ticked, the figure
  after, the warning, Apply N changes or Not now; Clear plan after a
  question). One editor is open at a time. The plan is read once and saved
  800 ms after the last edit (save_recurring_plan, or clear_recurring_plan
  for an empty one), and at once when the page goes; a failed save says so
  with Try again. Every figure, word, edit and selection is the core's
  (planMath, planPage, planText, whatIfMath); the page refreshes on the
  rules, categories, budgets and entries.
- **Your salary** (Insights' card), as the web's page: the regular pay with
  its last raise; the pay chart (each month's pay a dot over the regular
  pay's steps, hollow off the level; the extras as stacked bars under it; a
  tick a year; the legend), the raises (since the last, the average a year,
  each change newest first, Show all), the extras by year (Guessed / You set
  this; Fix opens the four kinds in place, then Save or Cancel; without a
  Bonus category, which income category holds them; Show older), If things
  go on (1, 3, 5 or 10 years, the three ways as step lines with what each
  adds up to, the yearly raise on a slider, the estimate's note behind the
  ⓘ), Against prices (Belgium or Greece, saved; since which year; the three
  tiles and the monthly gap) and year by year. Before a Salary category or
  any pay it says how to start (a new income category; Add income in the
  Salary category). Corrections (an extra's kind, the country, the Bonus
  category) are saved whole with save_salary_history, shown at once and put
  back when the save fails, as on the web.
- **Groups**: the tab shows the invites as banner cards (Accept /
  Decline), then the groups as a grid of square cards: the picture (or the
  group's own colour with its letters; groupCover.groupColour, as on the
  website), the name, the avatars and your balance as a chip in the
  corner; New group last. New group is one flow: a picture (a photo
  from the library, or an emoji on a colour, uploaded as the web's
  `uploadGroupImage` does), the name and currency, people to invite (by
  email, as the Members page sends them, and a share link), what happens
  next; then how each went and the link to share. A group's page: its
  picture and name as the title, the members under it, the balance card
  (your balance, the line that matters most, Settle up and Balances), then
  one timeline of expenses, settlements and their comments, newest at the
  bottom, with the comment field floating over its foot (a comment goes on
  the item picked, else the newest). Settling the group up bursts confetti
  behind the cards. Add or edit an expense in any currency with every
  split mode (Equally, Amounts, Percent, Shares); delete it after a
  confirm. Balances is a page: everyone's balance with a bar from the
  middle, then who pays whom. Settle up opens on your biggest payment
  (from → to with both circles, the amount in big figures), with the
  suggestions, the reminder bell and Pay directly (Revolut, PayPal, a bank QR drawn on
  the device from the core's EPC payload, the IBAN to copy). When you're
  the one being paid and have no payment details, Settle up asks for them
  as the web does (`payLinks.askForPaymentDetails`): Add payment details
  opens Getting paid's three fields in place, saved as Settings › Account
  saves them (`paymentDetailsToSave`, `set_payment_info`); Not now is kept
  on the phone (the web's `budge:paymentAsk`). The timeline's expenses wear
  the badge their description suggests (`categoryStyle.categoryLook` over
  the name, as an uncategorised entry's). Add (the floating one) adds an
  expense to the group. The owner renames the group in place (tap its
  name: the field, Save, Cancel) and changes its picture any time (tap the
  picture: **Edit group**, the name and the picture, as a new group's (a
  photo or an emoji on a colour over the photo now), sent by the same
  upload). The … menu: Members (remove, invite by email or a share link),
  **Share summary** (the group's PDF report: the `group-report` edge
  function's file, named as the website names it,
  `reportFiles.groupStatementFilename`, then the share sheet), Edit group,
  Leave (or leave silently) and Delete (type the name on a small sheet;
  the web's "can't yet" while others are in it). **Joining from an invite link**: a
  `budgeer://join/<token>` link opens the join page on the Groups tab
  (kept until you're signed in), and the tab's "Join with a link" takes a
  pasted link or its code (Paste reads the clipboard only when tapped;
  `groupFormat.inviteToken`); the page is the web's (`preview_link_invite`
  through `joinParts`: the picture, the name, the members), Accept & join
  (`join_via_link`) or Decline; a group you're in opens at once, and the
  server's refusals (an expired link, the shared demo account, too many
  joins) are the web's words. The website's https links stay as they
  are: opening them in the app needs Universal Links (Associated Domains,
  a paid developer account). Everything is the web's RPCs and tables,
  cached for offline and live through the groups' tables on the realtime
  channel.
- **Savings** (More › Money, Home's savings line), as the web's page: the
  pot (its total, from the savings accounts when there are any, else the
  entries, with the web's line saying which; this month's chip, "since May ·
  5 months", the month-end line as a soft coral area in Swift Charts, Add to
  savings: Add on the first savings category), This month (from income,
  received, from savings, the net change, the savings that repeat: tap to
  edit the rule), the goals (a ring in the logo's amber and coral, "€X of
  €Y", the pace or status, "+ / −" a tenth of the target saved in place,
  tap for the goal's page: name, target, saved so far, an optional target
  date, Save, Delete; swipe to delete; a goal's delete asks first, as on the
  web), and the history (All / In / Out, month by month with each
  month's net, tap to edit, swipe to delete after the web's question, Show
  older). Before anything was saved: the web's explainer, Add to savings,
  Set a goal, How savings work and Make it automatic (Add with Repeat on).
  Reads: every income entry, the expenses paid from savings, my_accounts,
  my_goals, the rules; writes: save_goal, deleting a goal or an entry. The
  net-worth accounts themselves are Insights': Savings only sums their
  savings ones, as on the web. A goal's page says what's missing only once
  Save is tapped, and stops saying it as soon as the form is edited (the
  web's toast).
- **Meal vouchers** (Home's card, More › Money once set up): what's on the
  card (red below zero) with this month's top-ups and spending, the next
  top-up and why, Fix days in place (a stepper, "× €8.00 = **€160.00**",
  the calendar's count, Save or Cancel; the calendar's own count removes the
  fix), and the card's history by month (expenses open in Edit; top-ups;
  the starting balance; Show older). The gear opens the setup; without one
  the page offers to set it up. **Settings › Meal vouchers**: the switch,
  the amount per working day (its message once Save is tapped without it),
  Belgium's or Greece's working days, the next top-up's date, what's on the
  card today; Save says what it did in place (off: the setup goes, the
  expenses keep their flag). save_meal_vouchers with voucherMath's
  newSettings / withDays.
- **More**: you (your picture, name and email over "Account & settings":
  the way in to Settings), Money (Budgets, Savings, Recurring, Plan, and
  Meal vouchers once set up, as on the web) and Insights (Your salary opens
  from its card there, as on the web). Every tile is in the category
  badges' style in the brand's tones (`NativeTone`: coral, amber, green,
  sand), Settings' too. One place to edit each thing: Categories live in
  Settings only (More no longer lists them); net-worth accounts in
  Insights' Net worth; a salary's corrections on its page; the meal
  vouchers' setup in Settings (their page links there).
- **Settings** (from More or your initials), as iOS's own Settings, the
  web's groups in its order, every page pushed and edited in place
  (a sheet only to confirm deleting):
  - **Account**: your picture (Change photo, uploaded as the web's
    `uploadAvatar`; not on the shared demo account), name and default
    currency (fixed once entries depend on it, `base_currency_locked`, with
    the web's note), Save; then Getting paid (IBAN, Revolut tag, PayPal.me
    name, tidied by `payLinks.paymentDetailsToSave`), Save.
  - **Categories**: Expenses or Income, your categories (active A–Z, then
    archived, dimmed; "New" on the new default ones; "Savings, not income"),
    swipe to archive or unarchive or delete (after choosing where its
    entries go, `delete_category`), Add for a new one of the kind shown. A category's page: the badge
    as it will look, the name (`categoryNameError`), the colour and the
    icon (`categoryStyle.categoryPicker`, the web's Lucide icons), "Counts
    as savings" on an income one, Archive and Delete; Save writes what
    changed (`categoryPatch`) or the new row (`newCategoryRow`). Not here:
    reordering (the web has none).
  - **A category's page** (the web's `/categories/:id`; from the list,
    Home's By category rows and its See all, the budget rows on Home and
    Budgets, as `categoryLinks` links them, a group's share to its group):
    the badge, what kind it is, the period's total (Spent, Earned or
    Saved, by the app's spread rule: `categoryPeriod`) with the period
    picker, the month's budget (`categoryBudget`: its bar with a carried
    cap's month, Set a budget this month, none in a past month, monthly
    only for a longer period), then the entries paid in the period (a tap
    opens Edit). Its pencil opens Edit in place on an expense category:
    this month's cap (`budgetChange`: set it, clear it to remove it, or
    "Nothing to save"; `edit_budget`, `delete_budget`) and the category's
    editor above; an income category's pencil opens that editor. The
    uncategorised bucket ("none") reads the period's expenses.
  - **Monthly spending**: yearly subscriptions in monthly spending, the
    salary shift with its day and category (`spendingPrefs`).
  - **Notifications**: the email and weekly-summary messages (off on the
    demo account). The web's push switch is not here: it is about the
    browsers allowed on the website, and this app has no push yet (that
    needs APNs and a paid developer account).
  - **Appearance**: light, dark or the phone's, on this device (as the
    web keeps it per browser). **Language** and the **Face ID lock**, its
    own page (off by default; turning it on asks for Face ID or the passcode
    first; once on, Budgeer asks when it opens and after a minute away, and
    the app switcher shows the lock, not the money), with the **app PIN**
    for when Face ID fails or isn't there: set up (4–6 digits, then again),
    changed or removed (each after the current PIN), all in place. It's kept
    on this iPhone only, as a salted PBKDF2-SHA256 hash in the Keychain
    (this device only, never the digits); wrong tries back off from the
    fifth (30 s, doubling, up to an hour), kept with the hash so a relaunch
    doesn't reset them. The lock screen offers "Use PIN" (`LockPinEntry`),
    and shows the pad at once on a phone that can't check its owner;
    removing the PIN there turns the lock off.
  - **AI helpers**: the four switches, what each sends, the privacy note;
    the demo note on the demo account.
  - **Security**: the sign-in methods (email & password, Google; passkeys
    stay the website's, so they are not listed, as on a browser without
    them), Connect Google (the system's web sheet, then the session) and
    Disconnect (never the last way in), Set a password (Google-only) or
    Change password (the current one checked, then GoTrue's PUT /user with
    it), and Delete account (the password, or a sign-in in the last ten
    minutes and DELETE typed; the delete-account edge function). Connecting,
    disconnecting and deleting without a password need a fresh sign-in
    (`reauth.isRecentClaims`), with Log in again. The demo note on the demo
    account.
  - **Privacy**: each GDPR right with its way here (Download my data as
    the web's JSON file, then Share; Edit profile; your transactions in
    Activity; Delete account; Send a request, its own page; email), the
    message switches as consent, the consent history.
  - **Help & FAQ**, native: the intro and the hobby-project notice, a
    search over every question (`faqContent.faqSections`: every word must
    match; "3 answers found", or the web's line and Show all questions),
    the sections with each question opening its answer in place (the
    paragraphs, the numbered steps, the app's clip played from the
    website, Copy link to this answer: `faqMath.questionLink`), then the
    Privacy page and the service status; `/help#<question>` opens with it
    open. The web's install sketches (drawings of a browser's menus) stay
    on the website. **Take the tour again** starts the tour.
  - The **Privacy Notice**, **Terms of Use** and the **status page** open
    in Safari inside the app (the legal documents are the website's, one
    source); **What's new** lists every release's pages; **Contact
    support** opens Mail. Then Sign out and the version.
  - **Meal vouchers**: the setup (above), after Monthly spending as on
    the web.
  - Not yet, and not offered: Import rules (they only act on an import),
    Your data's backup and restore (with import), and the live/test
    switch (the website's own).

### Strings

The app never writes a user-facing string in Swift. `npm run ios:strings`
(`mobile-core/strings.mjs`) turns `src/locales/{en,el}` into one
`Localizable.strings` per language, every leaf as the web's `"ns:path.key"`,
and refuses to build when Greek is out of step with English. `L10n.string`
reads a plain string; a string with `{{placeholders}}` or plural forms goes
through the core's `i18n.t` (`AppLanguage.t(key, vars)`), so it is worded
exactly as on the web. The few words only the app needs are the `ios`
namespace (`src/locales/{en,el}/ios.js`).

The language preference ('system', 'en', 'el') is the web's own rule
(`language.resolveLanguage` in the core) and the result goes to
`BudgeerCore.setLanguage`, so every figure the core answers is in it.
"Follow my device" reads only the device's first preferred language, which
is what iOS Safari reports to the web: the whole list would make an English
phone with Greek as a second language Greek. Signed in, the profile's
language wins and a choice in Settings › Language is saved to it
(`ProfileLanguage`, the core's `reconcileLanguage` and `profileValue`, as the
web's ProfileLanguage and Settings › Language); the shared demo account keeps
it on the device. As on the web, only a new profile value reconciles, and
once a choice is made here, reads that still answer the old language are
passed over until the profile says what was saved (choosing "Follow my
device" while the profile held Greek used to put Greek straight back); a
save that fails keeps the choice on this device. A change cross-fades the
words, and the bars already on screen take the new title face.

### Theme and fonts

`Theme.swift` keeps the web's colour tokens the app draws with (the raw
ramps of `src/shared/ui/palette.js`, the light and dark semantic tokens of
`src/app/theme.js`). Everything else is iOS's own: inset-grouped lists,
large titles, sheets with detents, swipe actions, the system's fonts for
text. Poppins (large titles and money figures) and Manrope (the same in
Greek, which Poppins lacks) are bundled as static TTFs under the SIL Open
Font License, with the licence texts beside them. The controls that float
(the tab bar, Add, the pills, the comment field) are Liquid Glass on iOS 26
(`NativeGlass`, behind `#if compiler(>=6.2)` and `#available(iOS 26.0, *)`)
and the standard material below it.

Category icons are the web's own Lucide icons: `npm run ios:icons`
(`mobile-core/icons.mjs`) writes every category icon of
`src/shared/lib/icons.jsx` as a template SVG into `Resources/Icons.xcassets`;
`test/iosIcons.test.js` fails when the committed files no longer match.
Lucide's ISC licence is in `Resources/LUCIDE-LICENSE.txt`. Everything else
is an SF Symbol.

### Tests

```bash
npm run ios:prepare
xcodebuild test -project ios/Budgeer/Budgeer.xcodeproj -scheme "Budgeer Dev" \
  -destination "platform=iOS Simulator,name=iPhone 17"
```

- View models over fakes (`FakeStore` behind every repository,
  `FakeAuthService`): `SessionStoreTests`, `SignInViewModelTests` (email and
  Google: success, cancelled, failed), `DataLayerTests` (the cache, live
  refresh), `EntryFormModelTests`, `LedgerTests`, `BudgetsTests`,
  `RecurringTests`, `InsightsTests`, `HomeViewModelTests`,
  `CategoryBadgeTests` (every category icon bundled), `GroupsModelTests` (the list and invites, a
  new group with its picture, invites and link, a group's page and its
  actions, invites, the expense form, settle up, comments, Who's it for's
  order), `GroupLinksTests` (Edit group's rename and upload, the
  statement's file, joining from a pasted or opened link and the refusals,
  Settle up's payment-details ask and Not now), `ReceiptTests` (a receipt
  read, checked and filling the form, a group expense's fill, little read, a new
  expense only),
  `ShellModelTests` (the bell's feed, opening it), `AppLockTests` (off by default, the
  owner's check, locked on launch and after the grace, off unlocks), `SettingsModelTests`
  (Account, the switches, Security over `FakeSecurity`, Privacy), `CategoriesModelTests` (the
  list, archive, delete with a move, adding and editing), `SavingsModelTests` (the web's reads, the
  filter without a read, savings accounts as the total, the first run, Show older, a goal's quick
  add, deleting goals and entries, a goal's page), `VouchersModelTests` (the card, Fix days and the
  calendar's count, no setup, the setup's form, turning vouchers off),
  `PlanModelTests` (the web's reads, a row's editor and the save, a failed save, What if I add…, the
  ideas and the picker, Apply and Undo, Clear plan, the salary from the entries, Type a what-if,
  the year view), `SalaryModelTests` (the reads, the cards refigured without reading, before any pay,
  a correction saved whole and put back), `InsightsCardsTests` (net worth, the salary card, the
  statement's file, an account's page), `CategoryPageModelTests` (the web's reads, the
  uncategorised bucket, this month's cap set, cleared and unchanged, a past month, another period,
  an unknown id), `AppPathsTests` (the web's addresses as tabs and pages, a category link's period,
  every What's new action), `WelcomeModelTests` (the wizard for a new account and its writes, the
  push step's hook, a tour never finished, What's new once and marked seen, none for a new
  account), `TourModelTests` (a phone's stops, Back and Next, seen once), `AccountFormsTests`
  (sign-up's checks and consent, a refusal's words, Google's tick, Check your inbox signing in by
  itself and giving up, resend's minute, the reset link).
- Parity: each screen's fixture inputs through its `…Figures` (every step a
  core call) must give what the web's functions wrote into
  `Fixtures/{home,ledger,budgets,recurring,insights,savings,vouchers,groups,plan,salary,networth,category}.json`, in
  English and Greek. `npm run ios:fixture` (`mobile-core/homeFigures.mjs`,
  `mobile-core/screenFigures.mjs`, `mobile-core/groupFigures.mjs`,
  `mobile-core/categoryFigures.mjs`) rewrites
  them from the web's source; `test/iosHome.test.js`,
  `test/iosScreens.test.js`, `test/iosGroups.test.js` and `test/iosCategory.test.js` (in `npm test`)
  fail when a committed file no longer matches the web.
- `L10nTests`: both languages bundled, the web's keys, the fallback, the
  language preference. `AppLanguageTests`: the device's first language only,
  the profile's language first, the demo account left alone, "Follow my
  device" after Greek staying put (an old read, a failed save).
  `AppPinTests` and `AppLockTests`: the PIN's rules (4–6 digits, a salted
  hash, the backoff, a relaunch keeping the wait), the PIN unlocking when
  Face ID fails, and the lock on a phone without Face ID.
- `SnapshotTests`: PNGs at an iPhone 17's size (402×874) inside the frame
  (the floating tab bar, the screen's tab picked) of Sign-in (and three
  moments of its intro), Sign up (and its checks), Check your inbox, Forgot
  password (and the link sent), the legal gate, the lock (with "Use PIN", and the
  PIN pad on a phone without Face ID), the setup wizard's four steps, the
  What's new story, the tour (its first stop over Home, More in the tab
  bar), a category's page (its budget being edited, the uncategorised
  bucket), Help & FAQ (and an answer open), Home (this month, a past
  month that held its budgets, By category's See all), the Add sheet (as it
  comes up, Edit pulled up, Split with a group, a receipt's check and the
  receipt used), Activity, Groups (the
  tab, New group empty, filled and made,
  a group's page, settled with its confetti caught mid-fall, Balances, an
  expense split by amounts, a new one from a receipt, Settle up, its payment-details ask open, Edit
  group, Delete's sheet, Members, Join with a link: the link pasted, the group it opens,
  an expired one), More, Settings and its
  pages (Face ID lock without and with a PIN, Account, Monthly spending, Notifications, Appearance, AI helpers,
  What's new, Security with Delete account and a Google-only account,
  Privacy and its request), Categories (both kinds, a category's page, a
  new one with a name taken, deleting), the notifications, Budgets,
  Recurring and Insights, Savings (from the entries, from savings accounts,
  before anything was saved, a goal's page, a new goal as it opens),
  Meal vouchers (the page, Fix days open, no setup, the setup, More with
  their row), Plan (the page, a row's editor, the overlap picker, What if I
  add…, Type a what-if, a plan with changes and its Apply sheet, just
  applied, the salary from the entries, no income, nothing to plan), Your
  salary (the page, an extra being fixed, before any pay), Insights' net
  worth (accounts with the pot line, a savings account) and an account's
  page (and a new one), each light, dark and Greek, with the fixtures'
  data (`<name>-<variant>.png`, and `-long` for the pages worth seeing
  whole); attached to the test run and written to `SNAPSHOT_DIR` when set
  (`TEST_RUNNER_SNAPSHOT_DIR=… xcodebuild test`).

CI is `.github/workflows/ios-app.yml` (macos-26, Xcode 26.5, iPhone 17 on iOS 26.5): the core's
replay, XcodeGen, a Simulator build, the tests, and the snapshots as the `snapshots` artifact. It runs
on develop and pull requests; a feature branch runs it by hand (Actions → ios-app → Run workflow).

### Running on a device

A simulator build needs no signing. For a device, put `DEVELOPMENT_TEAM =
<your team id>` in `ios/Budgeer/Config/Local.xcconfig` and let Xcode manage
the profile.
