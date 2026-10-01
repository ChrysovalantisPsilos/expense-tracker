// Recurring: the figures equal the web's (Fixtures/recurring.json, written
// by mobile-core/screenFigures.mjs) in both languages, and the model reads
// today's rates for the foreign rules, pauses, resumes and removes through
// the web's calls, and hands the saved rule to the form.
import XCTest
import BudgeerCore
@testable import Budgeer

/// Fixtures/recurring.json.
struct RecurringFixture: Decodable {
    struct Input: Decodable {
        let profile: JSONValue
        let categories: JSONValue
        let rates: JSONValue
        let rules: JSONValue
    }
    let input: Input
    let expected: [String: RecurringFigures]

    static func load() throws -> RecurringFixture {
        try JSONDecoder().decode(RecurringFixture.self, from: fixtureData("recurring"))
    }

    /// A store answering the page's reads, with the fixture's rates.
    func store() -> FakeStore {
        let store = FakeStore()
        store.profileResult = .success(input.profile)
        store.savingsResult = .success(input.categories)
        store.rulesResult = .success(input.rules)
        for (currency, rate) in input.rates.objectValue ?? [:] {
            if let value = rate.doubleValue { store.rates["\(currency)>EUR"] = value }
        }
        return store
    }
}

final class RecurringParityTests: XCTestCase {
    override func tearDown() {
        try? BudgeerCore.shared.setLanguage("en")
        super.tearDown()
    }

    func testFiguresEqualTheWebsInBothLanguages() throws {
        let fixture = try RecurringFixture.load()
        for lang in ["en", "el"] {
            try BudgeerCore.shared.setLanguage(lang)
            let figures = try RecurringFigures.compute(profile: fixture.input.profile, categories: fixture.input.categories,
                                                       rules: fixture.input.rules, rates: fixture.input.rates, core: .shared)
            let expected = try XCTUnwrap(fixture.expected[lang])
            XCTAssertEqual(figures.groups, expected.groups, lang)
            XCTAssertEqual(figures.income, expected.income, lang)
        }
    }
}

@MainActor
final class RecurringModelTests: XCTestCase {
    override func setUpWithError() throws {
        try super.setUpWithError()
        try BudgeerCore.shared.setLanguage("en")
    }

    func testTheRulesAtTodaysRates() async throws {
        let fixture = try RecurringFixture.load()
        let model = RecurringModel(data: fixture.store().data, core: .shared)
        await model.load()
        XCTAssertEqual(model.state, .loaded(try XCTUnwrap(fixture.expected["en"])))
        XCTAssertEqual(model.rule(id: "r2")?["description"], "Rent")
    }

    func testPauseResumeAndRemove() async throws {
        let fixture = try RecurringFixture.load()
        let store = fixture.store()
        let model = RecurringModel(data: store.data, core: .shared)
        await model.load()
        guard case .loaded(let figures) = model.state else { return XCTFail("\(model.state)") }
        let music = try XCTUnwrap(figures.groups.flatMap(\.rows).first { $0.id == "r1" })
        await model.setActive(music, false)
        XCTAssertEqual(store.savedRules.first?.id, "r1")
        XCTAssertEqual(store.savedRules.first?.fields, ["is_active": false])
        XCTAssertEqual(model.removeBody(music), "“Music” will stop repeating. Transactions it already created stay.")
        await model.remove(music)
        XCTAssertEqual(store.deletedRules, ["r1"])
        XCTAssertEqual(model.message, "Recurring entry removed")
    }

    func testAFailedPauseSaysSo() async throws {
        let fixture = try RecurringFixture.load()
        let store = fixture.store()
        let model = RecurringModel(data: store.data, core: .shared)
        await model.load()
        guard case .loaded(let figures) = model.state else { return XCTFail("\(model.state)") }
        store.writeError = FakeError(description: "offline")
        await model.setActive(figures.income.rows[0], false)
        XCTAssertEqual(model.message, "Couldn’t update the recurring entry. Please try again.")
    }
}
