// Import a statement, Settings › Import rules and Settings › Your data:
// every step of each, light, dark and Greek, with fake files (the import's
// parity fixture, the backups the web's code made).
import SwiftUI
import XCTest
import BudgeerCore
@testable import Budgeer

extension SnapshotTests {
    func testImportSnapshots() async throws {
        let fixture = try ImportFixture.load()
        let now = fixture.now
        for (lang, dark) in SnapshotTests.variants {
            _ = language(lang)
            let page = { (model: ImportModel) in
                self.framed(.activity) { NavigationStack { ImportView(model: model) } }
            }
            let make = { (store: FakeStore) in
                ImportModel(data: store.data, userId: fixture.input.userId, defaults: freshDefaults(), now: { now })
            }
            // The file to pick.
            let upload = make(fixture.store())
            try await shots(page(upload), name: "import", lang: lang, dark: dark)
            // The layout (unsure: the columns open), the preview, Import.
            let map = make(fixture.store())
            await map.load()
            await map.read(data: Data(fixture.input.csv.utf8), name: fixture.input.name)
            try await shots(page(map), name: "import-map", lang: lang, dark: dark, long: 2600)
            // The new merchants, with the AI's ideas.
            let ideasStore = fixture.store()
            ideasStore.profileResult = .success(fixture.input.profile.with("ai_import_categories", true))
            ideasStore.ideasResult = .success([["index": 0, "category_id": "44444444-4444-4444-8444-444444444444"]])
            let review = make(ideasStore)
            await review.load()
            await review.read(data: Data(fixture.input.csv.utf8), name: fixture.input.name)
            await review.prepare()
            try await shots(page(review), name: "import-review", lang: lang, dark: dark, long: 1500)
            // Done.
            await review.importReviewed()
            try await shots(page(review), name: "import-done", lang: lang, dark: dark)
            // A rate the ECB couldn't give.
            let rates = make(fixture.store())
            await rates.load()
            await rates.read(data: Data("Date,Description,Amount,Currency\n2026-09-01,TAXI NYC,-20.00,USD\n".utf8), name: "trip.csv")
            await rates.prepare()
            try await shots(page(rates), name: "import-rates", lang: lang, dark: dark)

            // Settings › Import rules, a rule's page, and none yet.
            let rulesStore = FakeStore()
            rulesStore.allCategoriesResult = .success(fixture.input.categories)
            rulesStore.importRuleRows = [
                ["id": "r1", "pattern": "LIDL", "category_id": "33333333-3333-4333-8333-333333333333",
                 "created_at": "2026-08-01T09:00:00.000Z"],
                ["id": "r2", "pattern": "CAFE ROMA", "category_id": "44444444-4444-4444-8444-444444444444",
                 "created_at": "2026-09-02T09:00:00.000Z"],
                ["id": "r3", "pattern": "ACME PAYROLL", "category_id": "11111111-1111-4111-8111-111111111111",
                 "created_at": "2026-09-03T09:00:00.000Z"],
            ]
            let rules = ImportRulesModel(data: rulesStore.data)
            await rules.load()
            try await shots(framed(.more) { NavigationStack { ImportRulesView(model: rules) } },
                            name: "import-rules", lang: lang, dark: dark)
            let editor = try XCTUnwrap(rules.editor(id: "r2"))
            editor.setPattern("CAFE ROMA LEUVEN")
            try await shots(framed(.more) { NavigationStack { ImportRuleView(model: editor, rules: rules) } },
                            name: "import-rule", lang: lang, dark: dark)
            let none = ImportRulesModel(data: FakeStore().data)
            await none.load()
            try await shots(framed(.more) { NavigationStack { ImportRulesView(model: none) } },
                            name: "import-rules-empty", lang: lang, dark: dark)
        }
    }

    /// Nothing logged yet, on Home and Activity: Add your first expense, or import a statement.
    func testFirstEntrySnapshots() async throws {
        let now = TestData.now
        for (lang, dark) in SnapshotTests.variants {
            _ = language(lang)
            let store = FakeStore()
            store.categoriesResult = .success(TestData.categories)
            let home = HomeViewModel(data: store.data, core: .shared, now: { now })
            await home.load()
            try await shots(framed(.home) { NavigationStack { HomeView(model: home, chrome: SnapshotTests.chrome) } },
                            name: "home-first", lang: lang, dark: dark)
            let ledger = LedgerModel(data: store.data, core: .shared, now: { now })
            await ledger.load()
            try await shots(framed(.activity) {
                NavigationStack {
                    ActivityView(model: ledger, chrome: SnapshotTests.chrome, open: { _ in }, duplicate: { _ in }, split: { _ in })
                }
            }, name: "activity-first", lang: lang, dark: dark)
        }
    }

    func testBackupSnapshots() async throws {
        let now = TestData.now
        let plain = String(decoding: try fixtureData("backup-plain"), as: UTF8.self)
        let sealed = String(decoding: try fixtureData("backup-sealed"), as: UTF8.self)
        for (lang, dark) in SnapshotTests.variants {
            _ = language(lang)
            try await shots(framed(.more) { NavigationStack { YourDataView() } }, name: "data", lang: lang, dark: dark)
            // Export: as it opens, then the file made and ready to share.
            let store = FakeStore()
            store.allCategoriesResult = .success(TestData.categories)
            let export = ExportBackupModel(data: store.data, userId: "u-1", now: { now })
            try await shots(framed(.more) { NavigationStack { ExportBackupView(model: export) } },
                            name: "export", lang: lang, dark: dark)
            await export.export()
            try await shots(framed(.more) { NavigationStack { ExportBackupView(model: export) } },
                            name: "export-ready", lang: lang, dark: dark)
            // Restore: the file to pick, a sealed one's password, what's in one, done, and a file that isn't one.
            let make = { RestoreBackupModel(data: FakeStore().data, userId: "u-1", email: "sam@example.com", now: { now }) }
            let choose = make()
            try await shots(framed(.more) { NavigationStack { RestoreBackupView(model: choose) } },
                            name: "restore", lang: lang, dark: dark)
            let locked = make()
            await locked.read(text: sealed)
            try await shots(framed(.more) { NavigationStack { RestoreBackupView(model: locked) } },
                            name: "restore-password", lang: lang, dark: dark)
            let review = make()
            await review.read(text: plain)
            try await shots(framed(.more) { NavigationStack { RestoreBackupView(model: review) } },
                            name: "restore-review", lang: lang, dark: dark, long: 1400)
            await review.restore()
            try await shots(framed(.more) { NavigationStack { RestoreBackupView(model: review) } },
                            name: "restore-done", lang: lang, dark: dark)
            let wrong = make()
            await wrong.read(text: "{}")
            try await shots(framed(.more) { NavigationStack { RestoreBackupView(model: wrong) } },
                            name: "restore-error", lang: lang, dark: dark)
        }
    }
}
