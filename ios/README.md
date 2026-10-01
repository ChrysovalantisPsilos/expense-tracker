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
    App/                 AppContainer (the client, the data layer, the cache, the live feed), RootView,
                         MainTabView (the frame, each tab's stack of pages, the bell's list, ShellRouter),
                         ShellModel (your initials, the bell's feed, where the floating Add shows), LiveRefresh
    Auth/                AuthService + SupabaseAuthService (email, Google), SessionStore, SignInView, LegalGateView
    Data/                Repositories (the protocols, DataLayer), SupabaseStore (the web's RPCs and tables),
                         QueryCache (offline reads on disk), RealtimeFeed + LiveHub (postgres_changes → debounced
                         refetch), FxRates (ECB rates as fx.js), PeriodSource (the period pickers' options)
    Home/                HomeFigures (Dashboard's steps as core calls), HomeViewModel, HomeView
    Transactions/        EntryFormModel + EntryFormView + EntrySheet (Add/Edit), LedgerFigures + LedgerModel +
                         TransactionsView + EntryRowView (the list)
    Budgets/             BudgetFigures, BudgetsModel, BudgetsView
    Recurring/           RecurringFigures, RecurringModel, RecurringView
    Insights/            InsightsFigures, InsightsModel, InsightsView (Swift Charts draws, the core computes)
    Groups/              GroupFigures (the groups' figures as core calls), GroupsModel + GroupsView (the tab),
                         GroupModel + GroupPageView (a group's page, rename, leave, delete), GroupExpenseModel +
                         GroupExpenseView (add or edit an expense, the quick layout), SettleUpModel + SettleUpView,
                         MembersView, CommentsModel + CommentsView, MyGroupsModel + WhoForAdd (Add's "Who's it
                         for?"), GroupKit (avatars, GroupMark, TransferRow, HighlightPill, rich text)
    More/                MoreView (Money, Account), SettingsView (Profile, Appearance, Language, Sign out,
                         the build), LanguageSettingsView, AppearanceSettingsView
    Theme/               Theme (tokens), Kit (the web's kit: Panel + CardHeader, IconTile, Figure, BalanceTile,
                         ProgressRow, ItemRow + RowActionsMenu, SectionLabel, Eyebrow, KitTag, the Chakra
                         buttons, SegmentedControl, LineTabs, PillTabs, Paginator, skeletons, empty states,
                         InfoButton, NavList), FormKit (FormRow, the outline field, SelectMenu, DayField,
                         the Switch), Shell (the top bar, the bottom bar, the floating Add, PageHeader, Page,
                         ShellChrome, the mark, AppAppearance), CategoryBadge, Lucide (generated)
    Support/             AppLanguage, ProfileLanguage (the account's language), L10n (the generated strings),
                         JSONValue, CoreHelpers, CategoryLook, ISODay
    Resources/Fonts/     Poppins, Nunito Sans, Manrope (OFL, static TTFs)
    Resources/Assets.xcassets/  AppIcon: one 1024 px opaque PNG of public/pwa-icon.svg (the apple-touch-icon art)
    Resources/Icons.xcassets/   the web's Lucide icons as template SVGs (npm run ios:icons; committed)
    Resources/LUCIDE-LICENSE.txt  Lucide's ISC licence
    Resources/Generated/ <lang>.lproj/Localizable.strings — generated, not committed
  BudgeerTests/          view models over FakeStore, the parity tests, the strings, snapshots
    Fixtures/*.json      the web's figures for fake inputs: home, ledger, budgets, recurring, insights,
                         groups (npm run ios:fixture)
```

### What is real and what is not (phase 3)

Every figure, label, grouping, validation and form ↔ row mapping below is
a core call (the web's function); Swift reads, lays out and draws.

- **Sign-in** with email and password, or **Google** (`signInWithOAuth`
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
- **Add / Edit an entry** (the "+" on Home and Transactions; a row opens
  Edit): the web's fields in its order and words, Type it when the AI
  switch is on (`ai-helper` `parse_entry`), Repeat, foreign currency with
  the ECB preview, savings and meal-voucher sources; saved with
  `save_transactions` / `update_transaction` / `save_recurring_rule`,
  deleted after a confirm. A new expense asks "Who's it for?" when the
  user is in a group (below). Not yet: receipts.
- **The frame**: the web's own shell, not a tab bar: the top bar (the
  mark, the bell with its unread count and list, the theme toggle, your
  initials to Settings), the bottom bar with the web's Lucide icons, and
  the floating Add where the web shows it (`navMatch.showsAddExpense`).
  Pages are pushed inside each tab with the web's back buttons; the edge
  swipe still goes back. No system navigation bar or sheet chrome.
- **Settings** (your initials, or More): Profile, Appearance (System,
  Light, Dark, also the top bar's toggle) and Language, Sign out, the
  version.
- **Transactions**: the month picker, search, the Filters panel (type,
  category, paid from, the web's `ledgerRead`), the rows with the ⋮ Edit
  and Delete and their "Counts for October" notes, 20 at a time.
- **Budgets**: this month's bars and tones, set or change a budget inline
  (the web's RPC), the carried-over label, copy last month's.
- **Recurring** (from More): Subscriptions and Income, the totals per
  frequency, pause, tap to edit the rule. Rules are added from Add with
  Repeat on, as on the web.
- **Insights** (from More): "Where your money went" (tap a month in the
  last six), "Income vs expenses" and Spending abroad. Not yet: your
  salary, net worth, the statement.
- **Home**: the period picker (months, years, all time, next month once its
  salary is in), the overview with the recurring payments still to come,
  pending rates filled, the ⓘ (How Net adds up), In words (the month in
  plain words when the AI switch is on), the meal vouchers card, spending
  by category (chart or table, "Show all"), the budgets card, the expenses
  and income lists and the Recurring card ("Show all N charges"), in the
  web's order (`dashboardMath.homeCards`). Not yet: the savings, plan,
  vouchers and category pages the cards link to on the web.
- **Groups** (phase 3): the tab lists the invites (Accept / Decline) and
  a card per group (picture, name, the avatar stack, the member count,
  your balance in its tone); New group (a name and a currency). A group's
  page: the header (picture, name over the avatars and member count, which
  open Members, and the Total), the balances card (your balance with Settle
  up, everyone's tiles, the highlight line), Who owes whom, and the history
  (expenses with their split and comment counts, settlements, activity).
  Add or edit an expense in any currency (the ECB rate, or one typed) with
  every split mode (Equally, Amounts, Percent, Shares); delete it after a
  confirm. Settle up opens on your biggest payment, with the suggestions,
  the reminder bell and Pay directly (Revolut, PayPal, a bank QR drawn on
  the device from the core's EPC payload, the IBAN to copy). Members:
  remove (the owner), invite by email (a request in the app, else an
  emailed link) or with a share link shown inline to copy or share.
  Comments on an expense or a settlement. Rename (the owner), Share
  summary, Leave (or leave silently) and Delete (type the name; the web's
  "can't yet" while others are in it). Add's **"Who's it for?"**: Just me
  or a group (most recently used first); a group turns Add into its quick
  form (the split folded into one card with Adjust), carrying what was
  typed. Everything is the web's RPCs and tables, cached for offline and
  live through the groups' tables on the realtime channel (unfiltered:
  Row Level Security scopes them). Not yet: the group photo upload (the
  photo shows), the PDF statement, joining from an invite link, the
  payment-details ask on Settle up, and opening a group from a shared row
  in Transactions.
- **More**: the Money pages (Recurring, Insights) and the Account
  pages.

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

`Theme.swift` ports the kit's tokens: the raw ramps of
`src/shared/ui/palette.js`, the light and dark semantic tokens of
`src/app/theme.js`, the radii, shadows and the 4pt spacing scale. Poppins
(headings), Nunito Sans (body) and Manrope (Greek headings) are bundled as
static TTFs under the SIL Open Font License, with the licence texts beside
them. Nunito Sans has no Greek, so Greek body text uses the system font (the
web falls back to Noto Sans, which is not bundled).

`Kit.swift`, `FormKit.swift` and `Shell.swift` port the web's kit
(`src/shared/ui/kit/`) and shell piece by piece under the same names
(Panel, CardHeader, Figure, ItemRow, SectionLabel, the Chakra buttons,
SegmentedControl, FormRow, SelectMenu, …). Icons are the web's own Lucide
icons: `npm run ios:icons` (`mobile-core/icons.mjs`) writes the icons the
app uses and every category icon of `src/shared/lib/icons.jsx` as template
SVGs into `Resources/Icons.xcassets`, the bold ones of the bottom bar, and
`Theme/Lucide.swift`; `test/iosIcons.test.js` fails when the committed
files no longer match. Lucide's ISC licence is in
`Resources/LUCIDE-LICENSE.txt`. The appearance (System, Light, Dark) is
`AppAppearance`, kept on the device.

### Tests

```bash
npm run ios:prepare
xcodebuild test -project ios/Budgeer/Budgeer.xcodeproj -scheme "Budgeer Dev" \
  -destination "platform=iOS Simulator,name=iPhone 15,OS=17.5"
```

- View models over fakes (`FakeStore` behind every repository,
  `FakeAuthService`): `SessionStoreTests`, `SignInViewModelTests` (email and
  Google: success, cancelled, failed), `DataLayerTests` (the cache, live
  refresh), `EntryFormModelTests`, `LedgerTests`, `BudgetsTests`,
  `RecurringTests`, `InsightsTests`, `HomeViewModelTests`,
  `CategoryBadgeTests` (every category icon bundled), `GroupsModelTests` (the list and invites, a
  group's page and its actions, invites, the expense form, settle up,
  comments, Who's it for's order).
- Parity: each screen's fixture inputs through its `…Figures` (every step a
  core call) must give what the web's functions wrote into
  `Fixtures/{home,ledger,budgets,recurring,insights,groups}.json`, in
  English and Greek. `npm run ios:fixture` (`mobile-core/homeFigures.mjs`,
  `mobile-core/screenFigures.mjs`, `mobile-core/groupFigures.mjs`) rewrites
  them from the web's source; `test/iosHome.test.js`,
  `test/iosScreens.test.js` and `test/iosGroups.test.js` (in `npm test`)
  fail when a committed file no longer matches the web.
- `L10nTests`: both languages bundled, the web's keys, the fallback, the
  language preference. `AppLanguageTests`: the device's first language only,
  the profile's language first, the demo account left alone.
- `SnapshotTests`: PNGs inside the frame (top bar, bottom bar) of Sign-in,
  Home (every card, and In words), Add (an expense with Repeat on), Edit,
  Transactions, Budgets, Recurring, Insights, More, Settings, Groups (the tab, a group's page and its activity,
  an expense split by amounts, settle up, members, Add's quick group
  form), each light, dark and Greek, with the fixtures'
  data, whole and as the first screen (`-top`); attached to the test run and written to `SNAPSHOT_DIR` when set
  (`TEST_RUNNER_SNAPSHOT_DIR=… xcodebuild test`).

CI is `.github/workflows/ios-app.yml` (macos-26, Xcode 26.5, iPhone 17 on iOS 26.5): XcodeGen, a
Simulator build, the tests, and the snapshots as the `snapshots` artifact.

### Running on a device

A simulator build needs no signing. For a device, put `DEVELOPMENT_TEAM =
<your team id>` in `ios/Budgeer/Config/Local.xcconfig` and let Xcode manage
the profile.
