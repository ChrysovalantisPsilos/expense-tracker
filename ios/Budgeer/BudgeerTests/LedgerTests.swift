// The Transactions list: its figures equal the web's (Fixtures/ledger.json,
// written by mobile-core/screenFigures.mjs) in both languages, and the
// model reads the web's queries (this month; all history for a search),
// switches type and period, and opens the saved row.
import XCTest
import BudgeerCore
@testable import Budgeer

/// Fixtures/ledger.json.
struct LedgerFixture: Decodable {
    struct Period: Decodable {
        let value: String
        let from: String
        let to: String
        let labels: [String: String]
    }
    struct View: Decodable {
        let name: String
        let kind: String?
        let period: Period
        let text: String
    }
    struct Input: Decodable {
        let now: String
        let profile: JSONValue
        let categories: JSONValue
        let rows: JSONValue
        let oldest: String?
        let views: [View]
    }
    let input: Input
    let expected: [String: [String: LedgerFigures]]

    static func load() throws -> LedgerFixture {
        try JSONDecoder().decode(LedgerFixture.self, from: fixtureData("ledger"))
    }

    var now: Date { ISO8601DateFormatter.fractional.date(from: input.now)! }

    /// The rows my_transactions answers for `kind` (filtered on the server).
    func rows(kind: String?) -> JSONValue {
        guard let kind else { return input.rows }
        return .array((input.rows.arrayValue ?? []).filter { $0["kind"]?.stringValue == kind })
    }
}

final class LedgerParityTests: XCTestCase {
    override func tearDown() {
        try? BudgeerCore.shared.setLanguage("en")
        super.tearDown()
    }

    func testFiguresEqualTheWebsInBothLanguages() throws {
        let fixture = try LedgerFixture.load()
        for lang in ["en", "el"] {
            try BudgeerCore.shared.setLanguage(lang)
            for view in fixture.input.views {
                let figures = try LedgerFigures.compute(
                    rows: fixture.rows(kind: view.kind), profile: fixture.input.profile, categories: fixture.input.categories,
                    kind: view.kind, periodLabel: view.period.labels[lang] ?? "", text: view.text,
                    oldest: fixture.input.oldest, core: .shared)
                let expected = try XCTUnwrap(fixture.expected[lang]?[view.name])
                XCTAssertEqual(figures.title, expected.title, "\(lang) \(view.name)")
                XCTAssertEqual(figures.subtitle, expected.subtitle, "\(lang) \(view.name)")
                XCTAssertEqual(figures.rows, expected.rows, "\(lang) \(view.name)")
                XCTAssertEqual(figures, expected, "\(lang) \(view.name)")
            }
        }
    }
}

@MainActor
final class LedgerModelTests: XCTestCase {
    override func setUpWithError() throws {
        try super.setUpWithError()
        try BudgeerCore.shared.setLanguage("en")
    }

    private func store(_ fixture: LedgerFixture) -> FakeStore {
        let store = FakeStore()
        store.profileResult = .success(fixture.input.profile)
        store.savingsResult = .success(fixture.input.categories)
        store.oldest = .success(fixture.input.oldest)
        store.rowsFor = { query in fixture.rows(kind: query.kind) }
        return store
    }

    func testThisMonthsExpensesThenTheOtherViews() async throws {
        let fixture = try LedgerFixture.load()
        let store = store(fixture)
        let now = fixture.now
        let model = LedgerModel(data: store.data, core: .shared, now: { now })
        await model.load()
        // The periods from the first transaction (March 2020) up to now; this month picked.
        XCTAssertEqual(model.periodValue, "m:2020-9")
        XCTAssertEqual(model.periods.first?.value, "m:2020-9")
        XCTAssertTrue(model.periods.contains { $0.value == "all" })
        XCTAssertEqual(store.queries.last, TxnQuery(kind: "expense", from: "2020-09-01", to: "2020-09-30"))
        guard case .loaded(let figures) = model.state else { return XCTFail("\(model.state)") }
        XCTAssertEqual(figures.title, "Expenses")
        XCTAssertEqual(figures.subtitle, "This month · 8 entries")

        await model.setType("all")
        XCTAssertEqual(store.queries.last, TxnQuery(kind: nil, from: "2020-09-01", to: "2020-09-30"))
        await model.setPeriod("m:2020-8")
        XCTAssertEqual(store.queries.last, TxnQuery(kind: nil, from: "2020-08-01", to: "2020-08-31"))
        XCTAssertEqual(model.row(id: "a4")?["description"], "Diner")
    }

    func testASearchSpansAllHistoryAndTypingOnlyRefinesIt() async throws {
        let fixture = try LedgerFixture.load()
        let store = store(fixture)
        let now = fixture.now
        let model = LedgerModel(data: store.data, core: .shared, now: { now })
        await model.load()
        await model.setType("all")
        model.setText("mus")
        await model.settleSearch()
        XCTAssertEqual(store.queries.last, TxnQuery(kind: nil, limit: 1000))
        let reads = store.queries.count
        model.setText("music")
        await model.settleSearch()
        XCTAssertEqual(store.queries.count, reads)
        guard case .loaded(let figures) = model.state else { return XCTFail("\(model.state)") }
        XCTAssertEqual(figures.subtitle, "1 result · Net −€12.99")
        XCTAssertEqual(figures.rows.map(\.id), ["a6"])
    }

    func testNothingLoggedShowsTheFirstEntry() async throws {
        let store = FakeStore()
        store.oldest = .success(nil)
        let now = EntryFormModelTests.now
        let model = LedgerModel(data: store.data, core: .shared, now: { now })
        await model.load()
        guard case .loaded(let figures) = model.state else { return XCTFail("\(model.state)") }
        XCTAssertTrue(figures.firstRun)
        XCTAssertEqual(model.periods.map(\.value), ["m:2026-9"])
    }

    func testAFailedFirstReadShowsTheError() async {
        let store = FakeStore()
        store.rowsResult = .failure(FakeError(description: "offline"))
        let now = EntryFormModelTests.now
        let model = LedgerModel(data: store.data, core: .shared, now: { now })
        await model.load()
        XCTAssertEqual(model.state, .failed("offline"))
    }
}
