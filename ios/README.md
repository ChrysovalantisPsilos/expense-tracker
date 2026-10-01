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
    App/                 AppContainer (the client, the data layer, the cache, the live feed, the lock), RootView
                         (sign-in, the legal gate, the frame, the lock over it), AppFrame (the tabs, each tab's
                         stack of pages (AppRoute), the Add sheet, AppRouter), NotificationsView (the bell's page),
                         AppLock + LockView (Face ID), ShellModel (your initials, the bell's feed), LiveRefresh
    Auth/                AuthService + SupabaseAuthService (email, Google), SessionStore, SignInView, LegalGateView,
                         AccountSecurity (Settings › Security's calls: identities, the token's claims, the
                         password, linking Google)
    Data/                Repositories (the protocols, DataLayer), SupabaseStore (the web's RPCs and tables;
                         +Groups, +Settings: the profile, the payment details, the photo, categories, privacy;
                         +Savings: the net-worth accounts, the goals, the meal vouchers' setup),
                         QueryCache (offline reads on disk), RealtimeFeed + LiveHub (postgres_changes → debounced
                         refetch), FxRates (ECB rates as fx.js), PeriodSource (the period pickers' options)
    Home/                HomeFigures (Dashboard's steps as core calls), HomeViewModel, HomeView (the month pager,
                         the sections, HomeCategoriesPage)
    Transactions/        EntryFormModel + AddSheet (Add/Edit/a rule: the amount, the keypad, the details),
                         LedgerFigures + LedgerModel + ActivityView (the month's header, the chips, the rows by
                         day, the month pill, search, swipes), TransactionWords (the delete question)
    Budgets/             BudgetFigures, BudgetsModel, BudgetsView
    Recurring/           RecurringFigures, RecurringModel, RecurringView
    Insights/            InsightsFigures, InsightsModel, InsightsView (Swift Charts draws, the core computes)
    Savings/             SavingsFigures (Savings.jsx's steps as core calls), SavingsModel, SavingsView (the pot and
                         its line, This month, the goals, the history), GoalEditorModel + GoalEditView (+ GoalEditHost)
    Vouchers/            VoucherFigures (Vouchers.jsx's steps), VouchersModel + VouchersView (the card, the next top-up
                         with Fix days, the history), VoucherSetupModel + VoucherSetupView (Settings › Meal vouchers)
    Groups/              GroupFigures (the groups' figures as core calls), GroupsModel + GroupsView (the tab's
                         grid), NewGroupModel + NewGroupView (the new-group flow), GroupModel (+ GroupInvite) +
                         GroupTimeline + GroupPageView (a group's page, its timeline), BalancesView,
                         GroupExpenseModel + SettleUpModel + GroupForms (the expense sheet and Add's quick group
                         form, Settle up, Members), CommentsModel, MyGroupsModel (Add's "Who's it for?")
    More/                MoreView (your profile, Money (Savings; Meal vouchers once set up), Insights)
    Settings/            SettingsView (the list, its rows, the demo note), AccountModel + AccountView,
                         PreferencesModel + PreferencesViews (Monthly spending, Notifications, Appearance, AI
                         helpers), SecurityModel + SecurityView (+ DeleteAccountSheet), PrivacyModel +
                         PrivacyView (+ PrivacyRequestView, WhatsNewView), LanguageView, SettingsFigures (the
                         plain pages' core calls), WebPage (the website's pages in Safari)
    Categories/          CategoriesModel (+ CategoryEditorModel), CategoriesView (+ DeleteCategorySheet),
                         CategoryEditView (+ CategoryEditHost)
    Theme/               Theme (the web's colour tokens), NativeStyle (the coral tint, Poppins titles and money
                         figures), NativeAppearance (the bars' title faces), NativeGlass (Liquid Glass on iOS 26,
                         the standard material on iOS 17–18), NativeTabs (the floating tab bar with Add beside
                         it), NativeParts (section headers, money, bars, tiles, avatars, loading and failure
                         states, rich text), NativeChrome (the bell and initials, the confetti), NativeSwatch,
                         NativeHaptics, CategoryBadge, BrandMark (+ BrandIntro, the sign-in's wordmark)
    Support/             AppLanguage, ProfileLanguage (the account's language), L10n (the generated strings),
                         AppAppearance (light, dark or the phone's), JSONValue, CoreHelpers, CategoryLook, ISODay
    Resources/Fonts/     Poppins and Manrope, semibold and bold (OFL, static TTFs)
    Resources/Assets.xcassets/  AppIcon: one 1024 px opaque PNG of public/pwa-icon.svg (the apple-touch-icon art)
    Resources/Icons.xcassets/   the web's Lucide category icons as template SVGs (npm run ios:icons; committed)
    Resources/LUCIDE-LICENSE.txt  Lucide's ISC licence
    Resources/Generated/ <lang>.lproj/Localizable.strings and InfoPlist.strings — generated, not committed
  BudgeerTests/          view models over FakeStore, the parity tests, the strings, snapshots
    Fixtures/*.json      the web's figures for fake inputs: home, ledger, budgets, recurring, insights,
                         savings, vouchers, groups (npm run ios:fixture)
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
- **The legal gate**: `my_legal_status` after every sign-in, failing
  closed; the app cannot record consent yet (the gate says to accept on the
  website, then "Retry").
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
  initials (Settings) top right. The appearance follows the phone unless
  Settings › Appearance picks light or dark.
- **Add / Edit an entry** (Add; a row in Activity; a rule in Recurring), a
  sheet: the amount first, on a keypad, the category chips and the day; pull
  it up for the rest, in the web's words: Type it when the AI switch is on
  (`ai-helper` `parse_entry`), Repeat, the currency with the ECB preview
  (or a rate typed), Paid from (savings, meal vouchers), "Who's it for?"
  (Just me or a group, most recently used first; a group turns the sheet
  into its quick form, carrying what was typed) and Notes. Saved with
  `save_transactions` / `update_transaction` / `save_recurring_rule`,
  deleted after a confirm. Not yet: receipts.
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
  budget, the carried-over label, copy last month's.
- **Recurring** (from More): Subscriptions and Income, the totals per
  frequency, pause, tap to edit the rule, add one (Add with Repeat on).
- **Insights** (from More): "Where your money went" (tap a month in the
  last six), "Income vs expenses" and Spending abroad. Not yet: your
  salary, net worth, the statement.
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
  the device from the core's EPC payload, the IBAN to copy). The … menu:
  Members (remove, invite by email or a share link), Share summary, Rename
  (the owner), Leave (or leave silently) and Delete (type the name; the
  web's "can't yet" while others are in it). Everything is the web's RPCs
  and tables, cached for offline and live through the groups' tables on
  the realtime channel. Not yet: changing an existing group's photo, the
  PDF statement, joining from an invite link, the payment-details ask
  on Settle up.
- **Savings** (More › Money, Home's savings line), as the web's page: the
  pot (its total, from the savings accounts when there are any, else the
  entries, with the web's line saying which; this month's chip, "since May ·
  5 months", the month-end line as a soft coral area in Swift Charts, Add to
  savings: Add on the first savings category), This month (from income,
  received, from savings, the net change, the savings that repeat: tap to
  edit the rule), the goals (a ring in the logo's amber and coral, "€X of
  €Y", the pace or status, "+ / −" a tenth of the target saved in place,
  tap for the goal's page: name, target, saved so far, an optional target
  date, Save, Delete; swipe to delete; a goal's delete asks first, which the
  web doesn't), and the history (All / In / Out, month by month with each
  month's net, tap to edit, swipe to delete after the web's question, Show
  older). Before anything was saved: the web's explainer, Add to savings,
  Set a goal, How savings work and Make it automatic (Add with Repeat on).
  Reads: every income entry, the expenses paid from savings, my_accounts,
  my_goals, the rules; writes: save_goal, deleting a goal or an entry. The
  net-worth accounts themselves are Insights' (not yet here): Savings only
  sums their savings ones, as on the web.
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
- **More**: your profile (to Settings), Money (Budgets, Savings, Recurring,
  Categories, and Meal vouchers once set up, as on the web) and Insights.
  The web's Plan and Salary pages are not built yet and are not offered.
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
    entries go, `delete_category`), + to add. A category's page: the badge
    as it will look, the name (`categoryNameError`), the colour and the
    icon (`categoryStyle.categoryPicker`, the web's Lucide icons), "Counts
    as savings" on an income one, Archive and Delete; Save writes what
    changed (`categoryPatch`) or the new row (`newCategoryRow`). Not here:
    a category's entries and its budget (the web's category page; budgets
    are on Budgets), reordering (the web has none).
  - **Monthly spending**: yearly subscriptions in monthly spending, the
    salary shift with its day and category (`spendingPrefs`).
  - **Notifications**: the email and weekly-summary messages (off on the
    demo account). The web's push switch is not here: it is about the
    browsers allowed on the website, and this app has no push yet (that
    needs APNs and a paid developer account).
  - **Appearance**: light, dark or the phone's, on this device (as the
    web keeps it per browser). **Language** and the **Face ID lock** (off
    by default; turning it on asks for Face ID or the passcode first; once
    on, Budgeer asks when it opens and after a minute away, and the app
    switcher shows the lock, not the money).
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
  - The **Privacy Notice**, **Terms of Use**, **Help & FAQ** and the
    **status page** open in Safari inside the app; **What's new** lists
    every release's pages; **Contact support** opens Mail. Then Sign out
    and the version.
  - **Meal vouchers**: the setup (above), after Monthly spending as on
    the web.
  - Not yet, and not offered: Import rules (they only act on an import),
    Your data's backup and restore (with import), the tour and the
    live/test switch (the website's own).

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
language wins and a choice in More is saved to it (`ProfileLanguage`, the
core's `reconcileLanguage` and `profileValue`, as the web's ProfileLanguage
and Settings › Language); the shared demo account keeps it on the device.

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
  order), `ShellModelTests` (the bell's feed, opening it), `AppLockTests` (off by default, the
  owner's check, locked on launch and after the grace, off unlocks), `SettingsModelTests`
  (Account, the switches, Security over `FakeSecurity`, Privacy), `CategoriesModelTests` (the
  list, archive, delete with a move, adding and editing), `SavingsModelTests` (the web's reads, the
  filter without a read, savings accounts as the total, the first run, Show older, a goal's quick
  add, deleting goals and entries, a goal's page), `VouchersModelTests` (the card, Fix days and the
  calendar's count, no setup, the setup's form, turning vouchers off).
- Parity: each screen's fixture inputs through its `…Figures` (every step a
  core call) must give what the web's functions wrote into
  `Fixtures/{home,ledger,budgets,recurring,insights,savings,vouchers,groups}.json`, in
  English and Greek. `npm run ios:fixture` (`mobile-core/homeFigures.mjs`,
  `mobile-core/screenFigures.mjs`, `mobile-core/groupFigures.mjs`) rewrites
  them from the web's source; `test/iosHome.test.js`,
  `test/iosScreens.test.js` and `test/iosGroups.test.js` (in `npm test`)
  fail when a committed file no longer matches the web.
- `L10nTests`: both languages bundled, the web's keys, the fallback, the
  language preference. `AppLanguageTests`: the device's first language only,
  the profile's language first, the demo account left alone.
- `SnapshotTests`: PNGs at an iPhone 17's size (402×874) inside the frame
  (the floating tab bar, the screen's tab picked) of Sign-in (and three
  moments of its intro), the legal gate, the lock, Home (this month, a past
  month that held its budgets, By category's See all), the Add sheet (as it
  comes up, Edit pulled up, Split with a group), Activity, Groups (the
  tab, New group empty, filled and made,
  a group's page, settled with its confetti caught mid-fall, Balances, an
  expense split by amounts, Settle up, Members), More, Settings and its
  pages (Account, Monthly spending, Notifications, Appearance, AI helpers,
  What's new, Security with Delete account and a Google-only account,
  Privacy and its request), Categories (both kinds, a category's page, a
  new one with a name taken, deleting), the notifications, Budgets,
  Recurring and Insights, Savings (from the entries, from savings accounts,
  before anything was saved, a goal's page, a new goal missing its name),
  Meal vouchers (the page, Fix days open, no setup, the setup, More with
  their row), each light, dark and Greek, with the fixtures'
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
