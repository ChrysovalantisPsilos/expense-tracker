// swift-tools-version:5.9
// BudgeerCore: the web app's maths and wording, run in JavaScriptCore.
// Sources/BudgeerCore/Resources/core.js is generated (npm run core:build)
// and never committed; the tests replay Tests/.../Resources/vectors.json
// (npm run core:vectors). See ios/README.md.
import PackageDescription

let package = Package(
    name: "BudgeerCore",
    platforms: [.iOS(.v17), .macOS(.v14)],
    products: [
        .library(name: "BudgeerCore", targets: ["BudgeerCore"]),
    ],
    targets: [
        .target(
            name: "BudgeerCore",
            // SheetJS (inside core.js) is Apache-2.0: its licence ships with it.
            resources: [.copy("Resources/core.js"), .copy("Resources/SHEETJS-LICENSE.txt")]
        ),
        .testTarget(
            name: "BudgeerCoreTests",
            dependencies: ["BudgeerCore"],
            resources: [.copy("Resources/vectors.json")]
        ),
    ]
)
