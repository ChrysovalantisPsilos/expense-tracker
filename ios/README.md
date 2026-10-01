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
declares the file as a resource); CI runs it in `.github/workflows/ios-core.yml`.

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
4. `npm test` replays it on Linux; the `ios-core` workflow replays it on a
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
                         MainTabView (tabs, the Add sheet, More's pages), LiveRefresh
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
    More/                MoreView (Money pages, account, sign out, language, build)
    Theme/               Theme (tokens), Kit (Panel, Figure, ProgressRow, buttons), FormKit (form rows, fields),
                         CategoryBadge (the web's icons as SF Symbols, the category colour)
    Support/             AppLanguage, L10n (the generated strings), JSONValue, CoreHelpers, CategoryLook, ISODay
    Resources/Fonts/     Poppins, Nunito Sans, Manrope (OFL, static TTFs)
    Resources/Generated/ <lang>.lproj/Localizable.strings — generated, not committed
  BudgeerTests/          view models over FakeStore, the parity tests, the strings, snapshots
    Fixtures/*.json      the web's figures for fake inputs: home, ledger, budgets, recurring, insights
                         (npm run ios:fixture)
```

### What is real and what is not (phase 2)

Every figure, label, grouping, validation and form ↔ row mapping below is
a core call (the web's function); Swift reads, lays out and draws.

- **Sign-in** with email and password, or **Google** (`signInWithOAuth`
  through `ASWebAuthenticationSession`, back to `budgeer://auth-callback`;
  a cancelled sheet is not an error). supabase-swift is pinned to 2.49.0,
  the last release on Swift tools 5.10, which Xcode 15.4 builds. The
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
  deleted after a confirm. Not yet: receipts, splitting with a group.
- **Transactions**: the month picker, search, the rows and their
  "Counts for October" notes, 20 at a time. Not yet: the advanced filters.
- **Budgets**: this month's bars and tones, set or change a budget inline
  (the web's RPC), the carried-over label, copy last month's.
- **Recurring** (from More): Subscriptions and Income, the totals per
  frequency, pause, tap to edit the rule. Rules are added from Add with
  Repeat on, as on the web.
- **Insights** (from More): "Where your money went" (tap a month in the
  last six) and "Income vs expenses". Not yet: spending abroad, net worth,
  the statement, the other cards.
- **Home**: the period picker (months, years, all time, next month once its
  salary is in), the overview with the recurring payments still to come,
  pending rates filled, spending by category and the Recurring card ("Show
  all N charges"). Not yet: the categories' "Show all", the vouchers card,
  In words.
- **Groups**: "Coming to the app soon". **More**: the Money pages, who is
  signed in, sign out, the language, the version.

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

### Theme and fonts

`Theme.swift` ports the kit's tokens: the raw ramps of
`src/shared/ui/palette.js`, the light and dark semantic tokens of
`src/app/theme.js`, the radii, shadows and the 4pt spacing scale. Poppins
(headings), Nunito Sans (body) and Manrope (Greek headings) are bundled as
static TTFs under the SIL Open Font License, with the licence texts beside
them. Nunito Sans has no Greek, so Greek body text uses the system font (the
web falls back to Noto Sans, which is not bundled).

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
  `CategoryBadgeTests`.
- Parity: each screen's fixture inputs through its `…Figures` (every step a
  core call) must give what the web's functions wrote into
  `Fixtures/{home,ledger,budgets,recurring,insights}.json`, in English and
  Greek. `npm run ios:fixture` (`mobile-core/homeFigures.mjs`,
  `mobile-core/screenFigures.mjs`) rewrites them from the web's source;
  `test/iosHome.test.js` and `test/iosScreens.test.js` (in `npm test`) fail
  when a committed file no longer matches the web.
- `L10nTests`: both languages bundled, the web's keys, the fallback, the
  language preference.
- `SnapshotTests`: PNGs of Sign-in, Home (with the picker and the Recurring
  card), Add (an expense with Repeat on), Edit, Transactions, Budgets,
  Recurring and Insights, each light, dark and Greek, with the fixtures'
  data; attached to the test run and written to `SNAPSHOT_DIR` when set
  (`TEST_RUNNER_SNAPSHOT_DIR=… xcodebuild test`).

CI is `.github/workflows/ios-app.yml` (macos-14, Xcode 15.4): XcodeGen, a
Simulator build, the tests, and the snapshots as the `snapshots` artifact.

### Running on a device

A simulator build needs no signing. For a device, put `DEVELOPMENT_TEAM =
<your team id>` in `ios/Budgeer/Config/Local.xcconfig` and let Xcode manage
the profile.
