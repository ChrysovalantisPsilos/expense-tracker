# Budgeer for iOS: the core

The native app is SwiftUI. Its maths and wording are **the web app's own
JavaScript**, bundled into one file and run in Apple's JavaScriptCore. One
engine, not two: a figure the app shows is computed by the same function the
website runs, from the same source file, so the two can't disagree.

## Why JavaScriptCore

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

## Layout

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

## Building the core

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

## How the vectors work

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

## Adding a module

1. Keep the module pure: a function of its arguments and the active
   language. Data access stays in the feature's data module.
2. Add it to `CORE_MODULES` in `mobile-core/modules.js` and as an
   `import * as name` plus a `modules` entry in `mobile-core/index.js`.
3. `npm run core:build` (the guard says if it reaches something it mustn't),
   then `npm run core:vectors` and commit the new `vectors.json`.
4. `npm test` replays it on Linux; the `ios-core` workflow replays it on a
   Mac.
