// Savings: the figures equal the web's (Fixtures/savings.json, written by
// mobile-core/screenFigures.mjs) in both languages, from the entries, from
// savings accounts, filtered and before anything was saved; the model reads
// what the web reads, refilters without reading again, saves a goal's quick
// add whole, deletes goals and entries; a goal's page says what's missing
// and saves what goalToSave answers.
import XCTest
import BudgeerCore
@testable import Budgeer

/// Fixtures/savings.json.
struct SavingsFixture: Decodable {
    struct View: Decodable {
        let name: String
        let accounts: JSONValue
        let filter: String
        let empty: Bool?
    }
    struct Input: Decodable {
        let now: String
        let profile: JSONValue
        let categories: JSONValue
        let income: JSONValue
        let fromSavings: JSONValue
        let rules: JSONValue
        let goals: JSONValue
        let payDays: JSONValue?
        let views: [View]
    }
    let input: Input
    let expected: [String: [String: SavingsFigures]]

    static func load() throws -> SavingsFixture {
        try JSONDecoder().decode(SavingsFixture.self, from: fixtureData("savings"))
    }

    var now: Date { ISO8601DateFormatter.fractional.date(from: input.now)! }

    func picked(_ name: String) -> View { input.views.first { $0.name == name }! }

    /// A store answering the page's reads for `view`, with an active savings category to add to.
    func store(_ name: String = "entries") -> FakeStore {
        let view = picked(name)
        let store = FakeStore()
        let empty = view.empty == true
        let income = empty ? JSONValue.array([]) : input.income
        let fromSavings = empty ? JSONValue.array([]) : input.fromSavings
        store.profileResult = .success(input.profile)
        store.savingsResult = .success(input.categories)
        store.categoriesResult = .success([
            ["id": "22222222-2222-4222-8222-222222222222", "name": "Savings", "kind": "income", "is_savings": true,
             "is_archived": false, "icon": .null, "color": .null, "default_key": "savings"],
        ])
        store.rowsFor = { query in
            if query.kind == "income" { return income }
            return query.paidFromSavings ? fromSavings : []
        }
        store.rulesResult = .success(input.rules)
        store.accountRows = view.accounts
        store.goalRows = input.goals
        store.payCalendarResult = ["days": input.payDays ?? [], "today": .null]
        return store
    }
}

final class SavingsParityTests: XCTestCase {
    override func tearDown() {
        try? BudgeerCore.shared.setLanguage("en")
        super.tearDown()
    }

    func testFiguresEqualTheWebsInBothLanguages() throws {
        let fixture = try SavingsFixture.load()
        for lang in ["en", "el"] {
            try BudgeerCore.shared.setLanguage(lang)
            for view in fixture.input.views {
                let empty = view.empty == true
                let figures = try SavingsFigures.compute(
                    profile: fixture.input.profile, categories: fixture.input.categories,
                    income: empty ? [] : fixture.input.income, fromSavings: empty ? [] : fixture.input.fromSavings,
                    accounts: view.accounts, rules: fixture.input.rules, goals: fixture.input.goals, filter: view.filter,
                    now: fixture.now,
                    cal: payCal(profile: fixture.input.profile, payDays: fixture.input.payDays, now: fixture.now),
                    core: .shared)
                let expected = try XCTUnwrap(fixture.expected[lang]?[view.name])
                XCTAssertEqual(figures.pot, expected.pot, "\(lang) \(view.name)")
                XCTAssertEqual(figures.month, expected.month, "\(lang) \(view.name)")
                XCTAssertEqual(figures.history, expected.history, "\(lang) \(view.name)")
                XCTAssertEqual(figures.goals, expected.goals, "\(lang) \(view.name)")
                XCTAssertEqual(figures, expected, "\(lang) \(view.name)")
            }
        }
    }
}

@MainActor
final class SavingsModelTests: XCTestCase {
    override func setUpWithError() throws {
        try super.setUpWithError()
        try BudgeerCore.shared.setLanguage("en")
    }

    private func makeModel(_ store: FakeStore, _ fixture: SavingsFixture) -> SavingsModel {
        let now = fixture.now
        return SavingsModel(data: store.data, core: .shared, now: { now })
    }

    func testTheWebsReadsThenTheFilterWithoutReadingAgain() async throws {
        let fixture = try SavingsFixture.load()
        let store = fixture.store()
        let model = makeModel(store, fixture)
        await model.load()
        XCTAssertEqual(Set(store.queries), [TxnQuery(kind: "income"), TxnQuery(kind: "expense", paidFromSavings: true)])
        XCTAssertEqual(model.state, .loaded(try XCTUnwrap(fixture.expected["en"]?["entries"])))
        XCTAssertEqual(model.savingsCategory, "22222222-2222-4222-8222-222222222222")
        XCTAssertEqual(model.rule(id: "r8")?["kind"], "income")
        let reads = store.queries.count
        model.setFilter("out")
        XCTAssertEqual(model.figures?.history, fixture.expected["en"]?["out"]?.history)
        XCTAssertEqual(store.queries.count, reads)
        XCTAssertEqual(model.filters.map(\.label), ["All", "In", "Out"])
    }

    func testSavingsAccountsMakeTheTotal() async throws {
        let fixture = try SavingsFixture.load()
        let model = makeModel(fixture.store("accounts"), fixture)
        await model.load()
        XCTAssertEqual(model.figures?.pot, fixture.expected["en"]?["accounts"]?.pot)
    }

    func testNothingSavedYetExplains() async throws {
        let fixture = try SavingsFixture.load()
        let model = makeModel(fixture.store("first"), fixture)
        await model.load()
        XCTAssertEqual(model.figures?.first, true)
    }

    func testShowOlderAddsMonths() async throws {
        let fixture = try SavingsFixture.load()
        let model = makeModel(fixture.store(), fixture)
        await model.load()
        let months = try XCTUnwrap(model.figures?.history.groups.count)
        XCTAssertEqual(model.window.shown, min(2, months))
        XCTAssertEqual(model.window.more, months > 2)
        model.showOlder()
        XCTAssertEqual(model.window.shown, min(5, months))
    }

    func testAGoalsQuickAddSavesTheWholeGoal() async throws {
        let fixture = try SavingsFixture.load()
        let store = fixture.store()
        let model = makeModel(store, fixture)
        await model.load()
        let trip = try XCTUnwrap(model.figures?.goals.first { $0.id == "g1" })
        await model.addTo(trip, step: trip.step)
        let saved = try XCTUnwrap(store.savingsWrites.last)
        XCTAssertEqual(saved.name, "saveGoal")
        XCTAssertEqual(saved.args["saved_minor"]?.intValue, 115000 + trip.step)
        XCTAssertEqual(saved.args["name"], "Summer trip")
        await model.addTo(trip, step: -1_000_000)
        XCTAssertEqual(store.savingsWrites.last?.args["saved_minor"]?.intValue, 0)
    }

    func testDeletingAGoalAndAnEntry() async throws {
        let fixture = try SavingsFixture.load()
        let store = fixture.store()
        let model = makeModel(store, fixture)
        await model.load()
        XCTAssertEqual(model.deleteGoalQuestion(id: "g3"), "Delete the goal “New laptop”?")
        await model.deleteGoal(id: "g3")
        XCTAssertEqual(store.savingsWrites.last?.name, "deleteGoal")
        XCTAssertEqual(store.savingsWrites.last?.args, "g3")
        let bike = try XCTUnwrap(model.figures?.history.groups.first?.rows.first { $0.id == "s7" })
        await model.delete(entry: bike.row)
        XCTAssertEqual(store.deleted, ["s7"])
        XCTAssertEqual(model.message, "Expense deleted")
    }

    func testAGoalsPageSaysWhatIsMissingThenSaves() async throws {
        let fixture = try SavingsFixture.load()
        let store = fixture.store()
        let now = fixture.now
        let editor = GoalEditorModel(goal: nil, data: store.data, core: .shared, now: { now })
        await editor.load()
        XCTAssertEqual(editor.currency, "EUR")
        XCTAssertEqual(editor.saved, "0")
        // Nothing is said before Save is tapped; once it is, what's missing,
        // until the form is edited again.
        XCTAssertNil(editor.error)
        let missing = await editor.save()
        XCTAssertFalse(missing)
        XCTAssertEqual(editor.error, "Name it")
        editor.setName(" Bike ")
        XCTAssertNil(editor.error)
        editor.setTarget("1200")
        editor.setDated(true)
        XCTAssertEqual(editor.targetDate, "2020-09-15")
        let saved = await editor.save()
        XCTAssertTrue(saved)
        XCTAssertEqual(store.savingsWrites.last?.args, [
            "id": .null, "name": "Bike", "target_minor": 120000, "saved_minor": 0, "currency": "EUR",
            "target_date": "2020-09-15",
        ])
    }

    func testEditingAGoalStartsFromIt() async throws {
        let fixture = try SavingsFixture.load()
        let store = fixture.store()
        let goal = try XCTUnwrap(fixture.input.goals.arrayValue?.first)
        let editor = GoalEditorModel(goal: goal, data: store.data)
        await editor.load()
        XCTAssertEqual([editor.name, editor.target, editor.saved, editor.targetDate],
                       ["Summer trip", "3000.00", "1150.00", "2021-06-30"])
        XCTAssertTrue(editor.dated)
        XCTAssertEqual(editor.targetLabel, "Target (EUR)")
        let deleted = await editor.delete()
        XCTAssertTrue(deleted)
        XCTAssertEqual(store.savingsWrites.last?.args, "g1")
    }
}
