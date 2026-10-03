// Budgets: the figures equal the web's (Fixtures/budgets.json, written by
// mobile-core/screenFigures.mjs) in both languages, and the model reads the
// web's queries and writes through the same RPCs (set a cap, change one
// from its row, delete, copy last month's).
import XCTest
import BudgeerCore
@testable import Budgeer

/// Fixtures/budgets.json.
struct BudgetsFixture: Decodable {
    struct View: Decodable {
        let name: String
        let budgets: JSONValue
        let previous: JSONValue
    }
    struct CardView: Decodable {
        let name: String
        let view: String
        let periodValue: String?
        let sets: JSONValue?
    }
    struct Input: Decodable {
        let now: String
        let profile: JSONValue
        let rows: JSONValue
        let payDays: JSONValue?
        let views: [View]
        let cards: [CardView]
    }
    let input: Input
    let expected: [String: [String: BudgetFigures]]
    /// Home's Budgets card per language and case.
    let cards: [String: [String: BudgetCardFigures]]

    static func load() throws -> BudgetsFixture {
        try JSONDecoder().decode(BudgetsFixture.self, from: fixtureData("budgets"))
    }

    var now: Date { ISO8601DateFormatter.fractional.date(from: input.now)! }

    /// The pay months the figures are cut by (my_pay_calendar's dates).
    var cal: JSONValue { payCal(profile: input.profile, payDays: input.payDays, now: now) }

    /// A store answering the page's reads for `view`.
    func store(_ view: String) -> FakeStore {
        let store = FakeStore()
        let chosen = input.views.first { $0.name == view }!
        store.profileResult = .success(input.profile)
        store.budgetsByPeriod = ["2020-09-01": chosen.budgets, "2020-08-01": chosen.previous]
        store.rowsResult = .success(input.rows)
        store.categoriesResult = .success(TestData.categories)
        store.payCalendarResult = ["days": input.payDays ?? [], "today": .null]
        return store
    }
}

final class BudgetsParityTests: XCTestCase {
    override func tearDown() {
        try? BudgeerCore.shared.setLanguage("en")
        super.tearDown()
    }

    func testFiguresEqualTheWebsInBothLanguages() throws {
        let fixture = try BudgetsFixture.load()
        for lang in ["en", "el"] {
            try BudgeerCore.shared.setLanguage(lang)
            for view in fixture.input.views {
                let figures = try BudgetFigures.compute(profile: fixture.input.profile, budgets: view.budgets,
                                                        previous: view.previous, rows: fixture.input.rows,
                                                        now: fixture.now, cal: fixture.cal, core: .shared)
                let expected = try XCTUnwrap(fixture.expected[lang]?[view.name])
                XCTAssertEqual(figures.items, expected.items, "\(lang) \(view.name)")
                XCTAssertEqual(figures, expected, "\(lang) \(view.name)")
            }
        }
    }

    func testHomesCardEqualsTheWebsInBothLanguages() throws {
        let fixture = try BudgetsFixture.load()
        for lang in ["en", "el"] {
            try BudgeerCore.shared.setLanguage(lang)
            for card in fixture.input.cards {
                let view = try XCTUnwrap(fixture.input.views.first { $0.name == card.view })
                let sets = try card.sets ?? BudgeerCore.shared.json("budgetMath", "monthSets", [view.budgets])
                let figures = try BudgetFigures.card(profile: fixture.input.profile, sets: sets, rows: fixture.input.rows,
                                                     periodValue: card.periodValue, now: fixture.now, cal: fixture.cal,
                                                     core: .shared)
                XCTAssertEqual(figures, try XCTUnwrap(fixture.cards[lang]?[card.name]), "\(lang) \(card.name)")
            }
        }
    }
}

@MainActor
final class BudgetsModelTests: XCTestCase {
    override func setUpWithError() throws {
        try super.setUpWithError()
        try BudgeerCore.shared.setLanguage("en")
    }

    private func model(_ store: FakeStore, _ fixture: BudgetsFixture) async -> BudgetsModel {
        let now = fixture.now
        let model = BudgetsModel(data: store.data, core: .shared, now: { now })
        await model.load()
        return model
    }

    func testTheMonthsCapsAgainstItsSpend() async throws {
        let fixture = try BudgetsFixture.load()
        let store = fixture.store("own")
        let model = await model(store, fixture)
        XCTAssertEqual(store.queries.last, TxnQuery(kind: "expense", from: "2020-08-27", to: "2020-09-30", spread: true))
        XCTAssertEqual(model.figures, fixture.expected["en"]?["own"])
        XCTAssertEqual(model.categoryOptions.map(\.id), ["c-food", "c-fun"])
        XCTAssertEqual(model.copyBody, "This month’s 3 caps are replaced by last month’s 1.")
    }

    func testSetAChangedCapAndDeleteOne() async throws {
        let fixture = try BudgetsFixture.load()
        let store = fixture.store("carried")
        let model = await model(store, fixture)
        XCTAssertEqual(model.figures?.subtitle, "Carried over from August")
        let groceries = try XCTUnwrap(model.figures?.items.first { $0.name == "Groceries" })
        model.edit(groceries)
        XCTAssertEqual(model.formAmount, "350.00")
        model.setAmount("420,5")
        await model.setCap()
        XCTAssertEqual(store.budgetEdits.count, 1)
        XCTAssertEqual(store.budgetEdits[0].categoryId, groceries.categoryId)
        XCTAssertEqual(store.budgetEdits[0].amountMinor, 42050)
        XCTAssertEqual(store.budgetEdits[0].currency, "EUR")
        XCTAssertEqual(store.budgetEdits[0].period, "2020-09-01")
        XCTAssertEqual(model.message, "Budget saved")
        XCTAssertEqual(model.formCategory, "")

        await model.delete(groceries)
        XCTAssertEqual(store.budgetDeletes.first?.categoryId, groceries.categoryId)
        XCTAssertEqual(store.budgetDeletes.first?.period, "2020-09-01")
        XCTAssertEqual(model.message, "Groceries budget removed")
    }

    func testCopyLastMonths() async throws {
        let fixture = try BudgetsFixture.load()
        let store = fixture.store("own")
        let model = await model(store, fixture)
        XCTAssertEqual(model.figures?.canCopy, true)
        await model.copyPrevious()
        XCTAssertEqual(store.copies, ["2020-09-01"])
        XCTAssertEqual(model.message, "Copied 2 budgets from last month")
    }

    func testAFailedSaveSaysSo() async throws {
        let fixture = try BudgetsFixture.load()
        let store = fixture.store("own")
        let model = await model(store, fixture)
        store.writeError = FakeError(description: "offline")
        model.formCategory = "c-food"
        model.setAmount("10")
        await model.setCap()
        XCTAssertEqual(model.message, "Couldn’t save the budget. Please try again.")
    }
}
