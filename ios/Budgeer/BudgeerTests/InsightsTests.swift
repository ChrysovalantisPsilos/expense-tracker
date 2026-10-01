// Insights: the figures equal the web's (Fixtures/insights.json and
// networth.json, written by mobile-core/screenFigures.mjs) in both
// languages, for this month and a tapped one; the model reads the six months
// with p_spread and re-splits a tapped month without reading again; then the
// cards' own reads: Your salary's card, net worth, the statement shared as
// the file generate-report makes; an account's page saves what
// accountToSave answers and says what's missing only once Save is tapped.
import XCTest
import BudgeerCore
@testable import Budgeer

/// Fixtures/insights.json.
struct InsightsFixture: Decodable {
    struct View: Decodable {
        let name: String
        let picked: Int?
    }
    struct Input: Decodable {
        let now: String
        let profile: JSONValue
        let categories: JSONValue
        let rows: JSONValue
        let views: [View]
    }
    let input: Input
    let expected: [String: [String: InsightsFigures]]

    static func load() throws -> InsightsFixture {
        try JSONDecoder().decode(InsightsFixture.self, from: fixtureData("insights"))
    }

    var now: Date { ISO8601DateFormatter.fractional.date(from: input.now)! }

    func store() -> FakeStore {
        let store = FakeStore()
        store.profileResult = .success(input.profile)
        store.savingsResult = .success(input.categories)
        store.rowsResult = .success(input.rows)
        return store
    }
}

final class InsightsParityTests: XCTestCase {
    override func tearDown() {
        try? BudgeerCore.shared.setLanguage("en")
        super.tearDown()
    }

    func testFiguresEqualTheWebsInBothLanguages() throws {
        let fixture = try InsightsFixture.load()
        for lang in ["en", "el"] {
            try BudgeerCore.shared.setLanguage(lang)
            for view in fixture.input.views {
                let figures = try InsightsFigures.compute(profile: fixture.input.profile, categories: fixture.input.categories,
                                                          rows: fixture.input.rows, now: fixture.now, picked: view.picked,
                                                          core: .shared)
                let expected = try XCTUnwrap(fixture.expected[lang]?[view.name])
                XCTAssertEqual(figures.shares, expected.shares, "\(lang) \(view.name)")
                XCTAssertEqual(figures.bars, expected.bars, "\(lang) \(view.name)")
                XCTAssertEqual(figures, expected, "\(lang) \(view.name)")
            }
        }
    }
}

@MainActor
final class InsightsModelTests: XCTestCase {
    override func setUpWithError() throws {
        try super.setUpWithError()
        try BudgeerCore.shared.setLanguage("en")
    }

    func testSixMonthsThenATappedMonth() async throws {
        let fixture = try InsightsFixture.load()
        let store = fixture.store()
        let now = fixture.now
        let model = InsightsModel(data: store.data, core: .shared, now: { now })
        await model.load()
        // The six months first, then the cards' own reads (net worth's pot).
        XCTAssertEqual(store.queries, [TxnQuery(from: "2020-04-01", to: "2020-09-30", spread: true), TxnQuery(kind: "income"),
                                       TxnQuery(kind: "expense", paidFromSavings: true)])
        XCTAssertEqual(model.state, .loaded(try XCTUnwrap(fixture.expected["en"]?["thisMonth"])))
        let reads = store.queries.count
        model.pick(4)
        XCTAssertEqual(model.state, .loaded(try XCTUnwrap(fixture.expected["en"]?["august"])))
        XCTAssertEqual(store.queries.count, reads)
    }

    func testAFailedReadShowsTheError() async {
        let store = FakeStore()
        store.rowsResult = .failure(FakeError(description: "offline"))
        let now = TestData.now
        let model = InsightsModel(data: store.data, core: .shared, now: { now })
        await model.load()
        XCTAssertEqual(model.state, .failed("offline"))
    }

    func testTheChartsAxisIsWordedByTheCore() throws {
        try BudgeerCore.shared.setLanguage("en")
        XCTAssertEqual(InsightsView.axisTick(1600), "1.6k")
        try BudgeerCore.shared.setLanguage("el")
        defer { try? BudgeerCore.shared.setLanguage("en") }
        XCTAssertEqual(InsightsView.axisTick(3000), "3\u{00a0}χιλ.")
    }
}

/// Fixtures/networth.json.
struct NetWorthFixture: Decodable {
    struct View: Decodable {
        let name: String
        let accounts: JSONValue
        let empty: Bool?
    }
    struct Input: Decodable {
        let profile: JSONValue
        let categories: JSONValue
        let income: JSONValue
        let fromSavings: JSONValue
        let views: [View]
    }
    struct Expected: Decodable {
        let pot: Int
        let card: NetWorthCard
        let types: [CoreChoice]
        let draft: JSONValue
    }
    let input: Input
    let expected: [String: [String: Expected]]

    static func load() throws -> NetWorthFixture {
        try JSONDecoder().decode(NetWorthFixture.self, from: fixtureData("networth"))
    }

    func view(_ name: String) -> View { input.views.first { $0.name == name }! }

    /// A store answering Insights' reads, net worth's with `view`'s accounts.
    func store(_ name: String = "accounts") -> FakeStore {
        let view = view(name)
        let store = FakeStore()
        let empty = view.empty == true
        let income = empty ? JSONValue.array([]) : input.income
        let fromSavings = empty ? JSONValue.array([]) : input.fromSavings
        store.profileResult = .success(input.profile)
        store.savingsResult = .success(input.categories)
        store.rowsFor = { query in
            if query.kind == "income" { return income }
            return query.paidFromSavings ? fromSavings : []
        }
        store.accountRows = view.accounts
        return store
    }

    /// Nothing logged, no accounts.
    static func emptyStore() -> FakeStore {
        let store = FakeStore()
        store.profileResult = .success(["base_currency": "EUR"])
        store.oldest = .success(nil)
        return store
    }
}

final class NetWorthParityTests: XCTestCase {
    override func tearDown() {
        try? BudgeerCore.shared.setLanguage("en")
        super.tearDown()
    }

    func testTheCardEqualsTheWebsInBothLanguages() throws {
        let fixture = try NetWorthFixture.load()
        for lang in ["en", "el"] {
            try BudgeerCore.shared.setLanguage(lang)
            for view in fixture.input.views {
                let empty = view.empty == true
                let figures = try NetWorthFigures.compute(profile: fixture.input.profile, categories: fixture.input.categories,
                                                          income: empty ? [] : fixture.input.income,
                                                          fromSavings: empty ? [] : fixture.input.fromSavings,
                                                          accounts: view.accounts, core: .shared)
                let expected = try XCTUnwrap(fixture.expected[lang]?[view.name])
                XCTAssertEqual(figures.pot, expected.pot, "\(lang) \(view.name)")
                XCTAssertEqual(figures.card, expected.card, "\(lang) \(view.name)")
            }
        }
    }
}

@MainActor
final class InsightsCardsTests: XCTestCase {
    override func setUpWithError() throws {
        try super.setUpWithError()
        try BudgeerCore.shared.setLanguage("en")
    }

    func testNetWorthTheSalaryCardAndTheStatementsMonth() async throws {
        let fixture = try NetWorthFixture.load()
        let store = fixture.store()
        store.allCategoriesResult = .success(TestData.categories)
        store.oldest = .success("2020-03-15")
        let now = TestData.now
        let model = InsightsModel(data: store.data, core: .shared, now: { now })
        await model.load()
        XCTAssertEqual(model.netWorth?.card, fixture.expected["en"]?["accounts"]?.card)
        XCTAssertFalse(model.netWorthFailed)
        // The salary category's one payment (August's) is the regular pay so far.
        XCTAssertTrue(model.salaryRead)
        XCTAssertEqual(model.salary, SalaryCardParts(level: "€2,500.00", raise: nil, steps: [250000]))
        XCTAssertEqual([model.statementFrom, model.statementTo], ["2026-09-01", "2026-09-30"])
        XCTAssertFalse(model.noEntries)
    }

    func testNothingLoggedYetTurnsTheStatementOff() async {
        let store = NetWorthFixture.emptyStore()
        let now = TestData.now
        let model = InsightsModel(data: store.data, core: .shared, now: { now })
        await model.load()
        XCTAssertTrue(model.noEntries)
        // Read, but no salary entry yet: the card says how it works.
        XCTAssertTrue(model.salaryRead)
        XCTAssertNil(model.salary)
    }

    func testTheStatementIsTheFunctionsFileToShare() async throws {
        let store = NetWorthFixture.emptyStore()
        let now = TestData.now
        let model = InsightsModel(data: store.data, core: .shared, now: { now })
        await model.load()
        model.setStatementFrom("2026-01-01")
        await model.export("pdf")
        XCTAssertEqual(store.planWrites.last?.name, "statement")
        XCTAssertEqual(store.planWrites.last?.args, ["from": "2026-01-01", "to": "2026-09-30", "format": "pdf"])
        let file = try XCTUnwrap(model.statementFile)
        XCTAssertEqual(file.lastPathComponent, "financial-statement_2026-01-01_2026-09-30.pdf")
        XCTAssertEqual(try Data(contentsOf: file), Data("%PDF-1.7 fake".utf8))
        store.writeError = FakeError(description: "offline")
        await model.export("xlsx")
        XCTAssertNil(model.statementFile)
        XCTAssertEqual(model.statementError, "Could not generate report. Something went wrong. Please try again.")
    }

    func testAnAccountsPageSavesWhatTheWebSavesAndSaysWhatsMissing() async throws {
        let store = FakeStore()
        let fresh = AccountEditorModel(account: nil, data: store.data, core: .shared)
        await fresh.load()
        XCTAssertEqual([fresh.name, fresh.type, fresh.balance, fresh.currency], ["", "asset", "", "EUR"])
        XCTAssertNil(fresh.error)
        let saved = await fresh.save()
        XCTAssertFalse(saved)
        XCTAssertEqual(fresh.error, "Name it")
        fresh.setName("Visa")
        XCTAssertNil(fresh.error)
        fresh.setType("liability")
        fresh.setBalance("-12,50")
        XCTAssertEqual(fresh.balance, "-12.50")
        let ok = await fresh.save()
        XCTAssertTrue(ok)
        XCTAssertEqual(store.savingsWrites.last?.args,
                       ["id": .null, "name": "Visa", "type": "liability", "balance_minor": -1250, "currency": "EUR"])
        XCTAssertEqual(fresh.types.map(\.value), ["asset", "liability", "savings"])
        let existing = AccountEditorModel(account: ["id": "a1", "name": "Current", "type": "asset", "balance_minor": 245000,
                                                    "currency": "EUR"], data: store.data, core: .shared)
        await existing.load()
        XCTAssertEqual(existing.balance, "2450.00")
        let removed = await existing.delete()
        XCTAssertTrue(removed)
        XCTAssertEqual(store.savingsWrites.last?.name, "deleteAccount")
    }
}
