// Your salary: the page equals the web's (Fixtures/salary.json, written by
// mobile-core/screenFigures.mjs) in both languages, with pay and before any;
// the model reads what the web reads, refigures the projection and the
// prices without reading again, and saves a correction whole (an extra's
// kind, the country, the Bonus category), putting it back when the save fails.
import XCTest
import BudgeerCore
@testable import Budgeer

/// Fixtures/salary.json.
struct SalaryFixture: Decodable {
    struct Input: Decodable {
        let now: String
        let profile: JSONValue
        let categories: JSONValue
        let income: JSONValue
        let notes: JSONValue
        let vouchers: JSONValue
    }
    let input: Input
    let expected: [String: [String: SalaryFigures]]

    static func load() throws -> SalaryFixture {
        try JSONDecoder().decode(SalaryFixture.self, from: fixtureData("salary"))
    }

    var now: Date { ISO8601DateFormatter.fractional.date(from: input.now)! }

    func store(empty: Bool = false) -> FakeStore {
        let store = FakeStore()
        store.profileResult = .success(input.profile)
        store.allCategoriesResult = .success(input.categories)
        store.rowsResult = .success(empty ? [] : input.income)
        store.salaryNotes = input.notes
        store.vouchersResult = .success(empty ? ["country": "GR"] : input.vouchers)
        return store
    }
}

final class SalaryParityTests: XCTestCase {
    override func tearDown() {
        try? BudgeerCore.shared.setLanguage("en")
        super.tearDown()
    }

    func testThePageEqualsTheWebsInBothLanguages() throws {
        let fixture = try SalaryFixture.load()
        let core = BudgeerCore.shared
        for lang in ["en", "el"] {
            try core.setLanguage(lang)
            for (name, empty) in [("page", false), ("empty", true)] {
                let report = try SalaryFigures.report(
                    profile: fixture.input.profile, categories: fixture.input.categories,
                    income: empty ? [] : fixture.input.income, notes: fixture.input.notes,
                    vouchers: empty ? ["country": "GR"] : fixture.input.vouchers, language: lang, now: fixture.now, core: core)
                let figures = try SalaryFigures.compute(report, profile: fixture.input.profile,
                                                        categories: fixture.input.categories, now: fixture.now, core: core)
                let expected = try XCTUnwrap(fixture.expected[lang]?[name])
                XCTAssertEqual(figures.page?.chart, expected.page?.chart, "\(lang) \(name)")
                XCTAssertEqual(figures.page?.projection, expected.page?.projection, "\(lang) \(name)")
                XCTAssertEqual(figures, expected, "\(lang) \(name)")
            }
        }
    }
}

@MainActor
final class SalaryModelTests: XCTestCase {
    override func setUpWithError() throws {
        try super.setUpWithError()
        try BudgeerCore.shared.setLanguage("en")
    }

    private func model(_ store: FakeStore, _ fixture: SalaryFixture) -> SalaryModel {
        let now = fixture.now
        return SalaryModel(data: store.data, core: .shared, now: { now })
    }

    func testTheWebsReadsThenTheCardsWithoutReadingAgain() async throws {
        let fixture = try SalaryFixture.load()
        let store = fixture.store()
        let salary = model(store, fixture)
        await salary.load()
        XCTAssertEqual(store.queries, [TxnQuery(kind: "income")])
        XCTAssertEqual(salary.figures, fixture.expected["en"]?["page"])
        salary.setYears(10)
        XCTAssertEqual(salary.figures?.page?.projection.total, "Earned in 10 years")
        salary.setWhatIf(4.5)
        XCTAssertEqual(salary.figures?.page?.projection.slider.value, "4.5%")
        let years = try XCTUnwrap(salary.figures?.page?.prices.choices.map(\.value))
        salary.setSince(years.last ?? 0)
        XCTAssertEqual(salary.figures?.page?.prices.from, years.last)
        XCTAssertEqual(store.queries.count, 1)
        XCTAssertEqual(salary.extrasWindow.shown, 1)
        XCTAssertFalse(salary.extrasWindow.more)
        XCTAssertEqual(salary.fixChoices.map(\.value), ["holiday", "thirteenth", "bonus", "regular"])
    }

    func testBeforeAnyPay() async throws {
        let fixture = try SalaryFixture.load()
        let salary = model(fixture.store(empty: true), fixture)
        await salary.load()
        XCTAssertEqual(salary.figures, fixture.expected["en"]?["empty"])
        XCTAssertNil(salary.figures?.page)
    }

    func testACorrectionIsSavedWholeAndPutBackWhenItFails() async throws {
        let fixture = try SalaryFixture.load()
        let store = fixture.store()
        let salary = model(store, fixture)
        await salary.load()
        let holiday = try XCTUnwrap(salary.figures?.page?.extras.first?.rows.first { $0.kind == "holiday" })
        XCTAssertTrue(holiday.guess)
        salary.startFix(holiday)
        XCTAssertEqual(salary.fixing, holiday.id)
        salary.pickFix("bonus")
        await salary.saveFix()
        XCTAssertNil(salary.fixing)
        XCTAssertEqual(store.planWrites.last?.name, "salary")
        XCTAssertEqual(store.planWrites.last?.args["fixes"]?[holiday.id], "bonus")
        let fixed = try XCTUnwrap(salary.figures?.page?.extras.first?.rows.first { $0.id == holiday.id })
        XCTAssertEqual([fixed.kind, fixed.fixed ? "fixed" : ""], ["bonus", "fixed"])
        // The country is saved with the corrections; a failed save goes back.
        await salary.setCountry("GR")
        XCTAssertEqual(salary.figures?.country, "GR")
        XCTAssertEqual(store.planWrites.last?.args["country"], "GR")
        store.writeError = FakeError(description: "offline")
        await salary.setCountry("BE")
        XCTAssertEqual(salary.figures?.country, "GR")
        XCTAssertNotNil(salary.message)
        store.writeError = nil
        await salary.setBonusCategory("88888888-8888-4888-8888-888888888888")
        XCTAssertEqual(salary.figures?.bonusId, "88888888-8888-4888-8888-888888888888")
    }
}
