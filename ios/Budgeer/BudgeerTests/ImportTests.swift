// Import a bank statement and Settings › Import rules: the walk through a
// fake export equals the web's (Fixtures/import.json, written by
// mobile-core/importFigures.mjs) in both languages, ids included; a workbook
// is read on the phone (SheetJS in the core); the rates step, the AI's
// category ideas, the file's problems and this phone's memory of a layout;
// the rules' list, search, filter, pages, edit (a taken text) and delete.
import XCTest
import BudgeerCore
@testable import Budgeer

/// Fixtures/import.json.
struct ImportFixture: Decodable {
    struct Input: Decodable {
        let now: String
        let userId: String
        let name: String
        let csv: String
        let profile: JSONValue
        let categories: JSONValue
        let rules: JSONValue
        let existing: JSONValue
        let assign: [String: String]
    }
    struct Done: Decodable, Equatable {
        let title: String
        let dated: String?
        let notes: [String]
    }
    struct Expected: Decodable {
        let headers: [String]
        let rowsLabel: String
        let detection: String
        let ready: Int
        let preview: [JSONValue]
        let note: String?
        let merchants: [JSONValue]
        let rules: JSONValue
        let saved: JSONValue
        let done: Done
    }
    let input: Input
    let expected: [String: Expected]

    static func load() throws -> ImportFixture {
        try JSONDecoder().decode(ImportFixture.self, from: fixtureData("import"))
    }

    var now: Date { ISO8601DateFormatter.fractional.date(from: input.now)! }

    func store() -> FakeStore {
        let store = FakeStore()
        store.profileResult = .success(input.profile)
        store.categoriesResult = .success(input.categories)
        store.importRuleRows = input.rules
        store.rowsResult = .success(input.existing)
        return store
    }
}

/// A fresh, empty memory for a test (the web's localStorage).
func freshDefaults() -> UserDefaults {
    let name = "import-tests-\(UUID().uuidString)"
    let defaults = UserDefaults(suiteName: name)!
    defaults.removePersistentDomain(forName: name)
    return defaults
}

@MainActor
final class ImportParityTests: XCTestCase {
    override func tearDown() {
        try? BudgeerCore.shared.setLanguage("en")
        super.tearDown()
    }

    func testTheWalkEqualsTheWebsInBothLanguages() async throws {
        let fixture = try ImportFixture.load()
        for lang in ["en", "el"] {
            try BudgeerCore.shared.setLanguage(lang)
            let expected = try XCTUnwrap(fixture.expected[lang])
            let store = fixture.store()
            let now = fixture.now
            let model = ImportModel(data: store.data, userId: fixture.input.userId, defaults: freshDefaults(), now: { now })
            await model.load()
            await model.read(data: Data(fixture.input.csv.utf8), name: fixture.input.name)
            XCTAssertEqual(model.step, .map, lang)
            XCTAssertEqual(model.headers, expected.headers, lang)
            XCTAssertEqual(model.rowsLabel, expected.rowsLabel, lang)
            XCTAssertEqual(model.detectionText, expected.detection, lang)
            XCTAssertTrue(model.showMapping, "an unsure layout opens the columns (\(lang))")
            XCTAssertEqual(model.ready, expected.ready, lang)
            XCTAssertEqual(model.previewRows.map { row -> JSONValue in
                ["title": .string(row.title), "meta": .string(row.meta), "amount": .string(row.amount), "income": .bool(row.income)]
            }, expected.preview, lang)
            XCTAssertEqual(model.previewNote, expected.note, lang)

            await model.prepare()
            XCTAssertEqual(model.step, .review, lang)
            XCTAssertEqual(model.merchants.map { merchant -> JSONValue in
                ["id": .string(merchant.id), "pattern": .string(merchant.pattern), "kind": .string(merchant.kind),
                 "meta": .string(merchant.meta)]
            }, expected.merchants, lang)
            for (id, category) in fixture.input.assign { model.choose(id, category) }
            await model.importReviewed()
            XCTAssertEqual(model.step, .done, lang)
            let rules = store.importWrites.filter { $0.name == "saveRule" }.map(\.args)
            XCTAssertEqual(JSONValue.array(rules), expected.rules, lang)
            let saved = store.importWrites.filter { $0.name == "saveTransactions" }.flatMap { $0.args.arrayValue ?? [] }
            XCTAssertEqual(JSONValue.array(saved), expected.saved, "the same rows and ids as the web (\(lang))")
            let done = try XCTUnwrap(model.done)
            XCTAssertEqual(ImportFixture.Done(title: done.title, dated: done.dated, notes: done.notes), expected.done, lang)
        }
    }
}

@MainActor
final class ImportModelTests: XCTestCase {
    private func model(_ store: FakeStore, defaults: UserDefaults = freshDefaults()) -> ImportModel {
        let now = TestData.now
        return ImportModel(data: store.data, userId: "u-1", defaults: defaults, now: { now })
    }

    private func store() -> FakeStore {
        let store = FakeStore()
        store.profileResult = .success(["base_currency": "EUR", "display_name": "Sam Morgan"])
        store.categoriesResult = .success(TestData.categories)
        return store
    }

    func testAWorkbookIsReadOnThePhone() async throws {
        let url = try XCTUnwrap(Bundle(for: FakeStore.self).url(forResource: "statement", withExtension: "xlsx"))
        let model = model(store())
        await model.load()
        await model.read(data: try Data(contentsOf: url), name: "statement.xlsx")
        XCTAssertNil(model.notice)
        XCTAssertEqual(model.step, .map)
        XCTAssertEqual(model.headers, ["Date", "Description", "Amount", "Currency"])
        XCTAssertEqual(model.rowsLabel, "3 rows")
        XCTAssertEqual(model.ready, 3)
        XCTAssertEqual(model.previewRows.first?.title, "LIDL LEUVEN 1234")
        XCTAssertEqual(model.previewRows.last?.income, true)
    }

    func testTheFilesProblemsAreTheWebsWords() async {
        let model = model(store())
        await model.read(data: Data(count: 6 * 1024 * 1024), name: "big.csv")
        XCTAssertEqual(model.notice?.title, "Couldn’t read that file")
        XCTAssertTrue(model.notice?.text?.hasPrefix("That file is 6.0 MB") == true, model.notice?.text ?? "")
        await model.read(data: Data([0x50, 0x4B, 0x03, 0x04, 1, 2, 3]), name: "broken.xlsx")
        XCTAssertTrue(model.notice?.text?.hasPrefix("This spreadsheet couldn’t be read. Re-export it as CSV") == true)
        await model.read(data: Data("Date,Amount\n".utf8), name: "empty.csv")
        XCTAssertEqual(model.notice?.title, "That file has no rows")
        XCTAssertEqual(model.step, .upload)
    }

    func testAForeignRowWithoutARateAsksForOneAndNeverBooks1To1() async {
        let store = store()
        let model = model(store)
        await model.load()
        await model.read(data: Data("Date,Description,Amount,Currency\n2026-09-01,TAXI NYC,-20.00,USD\n2026-09-02,LIDL,-5.00,EUR\n".utf8),
                         name: "trip.csv")
        await model.prepare()
        XCTAssertEqual(model.step, .rates)
        XCTAssertEqual(model.missingRates.map(\.currency), ["USD"])
        XCTAssertEqual(model.rateLabel("USD", count: 1), "1 USD = ? EUR · 1 row")
        XCTAssertFalse(model.ratesReady)
        model.setRate("USD", "0,92")
        XCTAssertTrue(model.ratesReady)
        await model.continueWithRates()
        XCTAssertEqual(model.step, .review)
        await model.importReviewed()
        let saved = store.importWrites.filter { $0.name == "saveTransactions" }.flatMap { $0.args.arrayValue ?? [] }
        XCTAssertEqual(saved.first { $0["currency"] == "USD" }?["exchange_rate"]?.doubleValue, 0.92)
    }

    func testTheAIsIdeasFillTheMerchantsUntilChanged() async {
        let store = store()
        store.profileResult = .success(["base_currency": "EUR", "ai_import_categories": true])
        store.ideasResult = .success([["index": 0, "category_id": "c-fun"]])
        let model = model(store)
        await model.load()
        await model.read(data: Data("Date,Description,Amount\n2026-09-01,CINEMA CITY,-12.00\n".utf8), name: "s.csv")
        await model.prepare()
        XCTAssertEqual(model.step, .review)
        XCTAssertEqual(model.ideas, .done)
        let cinema = try? XCTUnwrap(model.merchants.first)
        XCTAssertEqual(model.assign[cinema?.id ?? ""], "c-fun")
        XCTAssertTrue(model.isSuggested(cinema?.id ?? ""))
        XCTAssertEqual(model.ideasNote, "Suggested for 1 of 1. Change any that look wrong.")
        model.choose(cinema?.id ?? "", "c-food")
        XCTAssertFalse(model.isSuggested(cinema?.id ?? ""))
    }

    func testAConfirmedLayoutAndTheHoldersNameAreRemembered() async {
        let defaults = freshDefaults()
        let csv = Data("Date,Description,Amount\n2026-09-01,LIDL,-5.00\n".utf8)
        let first = model(store(), defaults: defaults)
        await first.load()
        await first.read(data: csv, name: "a.csv")
        first.setHolderName("Sam  Morgan ")
        await first.prepare()
        XCTAssertNotNil(defaults.string(forKey: ImportModel.mappingsKey))
        XCTAssertEqual(defaults.string(forKey: ImportModel.holderKey), "Sam Morgan")
        let again = model(store(), defaults: defaults)
        await again.load()
        await again.read(data: csv, name: "b.csv")
        XCTAssertTrue(again.detectionText.hasPrefix("Using the columns you confirmed for this layout last time."))
        XCTAssertFalse(again.showMapping)
        XCTAssertEqual(again.holderName, "Sam Morgan")
    }
}

/// Nothing logged yet: Home and Activity offer the two ways to start (the web's FirstEntry).
@MainActor
final class FirstEntryTests: XCTestCase {
    func testHomeAndActivityKnowItsTheFirstRun() async throws {
        let store = FakeStore()
        let now = TestData.now
        let home = HomeViewModel(data: store.data, core: .shared, now: { now })
        await home.load()
        guard case .loaded(let figures) = home.state else { return XCTFail("\(home.state)") }
        XCTAssertTrue(figures.cards.contains("firstEntry"))
        let ledger = LedgerModel(data: store.data, core: .shared, now: { now })
        await ledger.load()
        guard case .loaded(let rows) = ledger.state else { return XCTFail("\(ledger.state)") }
        XCTAssertTrue(rows.firstRun)
    }
}

@MainActor
final class ImportRulesTests: XCTestCase {
    private func store(rules count: Int = 3) -> FakeStore {
        let store = FakeStore()
        store.allCategoriesResult = .success(TestData.categories)
        let base: [JSONValue] = [
            ["id": "r-lidl", "pattern": "LIDL", "category_id": "c-food", "created_at": "2026-09-01T10:00:00.000Z"],
            ["id": "r-acme", "pattern": "ACME PAYROLL", "category_id": "c-pay", "created_at": "2026-09-02T10:00:00.000Z"],
            ["id": "r-gone", "pattern": "OLD SHOP", "category_id": "c-missing", "created_at": .null],
        ]
        let more: [JSONValue] = (0..<max(0, count - 3)).map { index in
            ["id": .string("r-\(index)"), "pattern": .string("SHOP \(index)"), "category_id": "c-fun", "created_at": .null]
        }
        store.importRuleRows = .array(base + more)
        return store
    }

    func testTheListSearchFilterAndPages() async {
        let model = ImportRulesModel(data: store(rules: 20).data)
        await model.load()
        XCTAssertEqual(model.countLabel, "20 rules")
        XCTAssertEqual(model.pages, 2)
        XCTAssertEqual(model.items.count, 15)
        XCTAssertEqual(model.position, "Page 1 of 2")
        model.step(1)
        XCTAssertEqual(model.items.count, 5)
        model.setQuery("acme")
        XCTAssertEqual(model.page, 1)
        XCTAssertEqual(model.items.map(\.id), ["r-acme"])
        XCTAssertTrue(model.items[0].meta.hasPrefix("Salary · Money in · Added "))
        model.setQuery("")
        model.setFilter("income")
        XCTAssertEqual(model.items.map(\.id), ["r-acme"])
        XCTAssertEqual(model.filters.map(\.label), ["All", "Money out", "Money in"])
        model.setFilter("all")
        model.setQuery("old shop")
        XCTAssertEqual(model.items.first?.meta, "Unknown category")
        model.setQuery("nothing like it")
        XCTAssertTrue(model.noMatch)
    }

    func testARulesPageSavesItsTextAndCategory() async throws {
        let store = store()
        let model = ImportRulesModel(data: store.data)
        await model.load()
        let editor = try XCTUnwrap(model.editor(id: "r-lidl"))
        XCTAssertEqual(editor.groups.map(\.kind), ["expense", "income"])
        editor.setPattern("acme payroll")
        editor.touched = true
        XCTAssertEqual(editor.shownProblem, "You already have a rule for that text.")
        editor.setPattern("L")
        XCTAssertEqual(editor.problem, "Use at least 2 characters.")
        editor.setPattern("  LIDL   GENT ")
        XCTAssertTrue(editor.textChanged)
        editor.categoryId = "c-fun"
        let saved = await editor.save()
        XCTAssertTrue(saved)
        XCTAssertEqual(store.importWrites.last?.args, ["id": "r-lidl", "pattern": "LIDL GENT", "category_id": "c-fun"])
        await model.saved()
        XCTAssertEqual(model.notice?.title, "Rule saved")
    }

    func testTheServersTakenRefusalAndDelete() async throws {
        let store = store()
        store.ruleUpdateError = ServerError(code: "23505", message: "duplicate key")
        let model = ImportRulesModel(data: store.data)
        await model.load()
        let editor = try XCTUnwrap(model.editor(id: "r-lidl"))
        editor.setPattern("Lidl Leuven")
        let saved = await editor.save()
        XCTAssertFalse(saved)
        XCTAssertEqual(editor.shownProblem, "You already have a rule for that text.")

        let lidl = try XCTUnwrap(model.item(id: "r-lidl"))
        XCTAssertEqual(model.deleteTitle(lidl), "Delete “LIDL”?")
        model.deleting = lidl
        await model.confirmDelete()
        XCTAssertEqual(store.importWrites.last?.name, "deleteRule")
        XCTAssertEqual(model.notice?.title, "Rule deleted")
        XCTAssertNil(model.item(id: "r-lidl"))
    }

    func testNoRulesYet() async {
        let store = FakeStore()
        let model = ImportRulesModel(data: store.data)
        await model.load()
        XCTAssertTrue(model.isEmpty)
        XCTAssertNil(model.countLabel)
    }
}
