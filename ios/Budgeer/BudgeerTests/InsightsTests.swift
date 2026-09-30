// Insights: the figures equal the web's (Fixtures/insights.json, written by
// mobile-core/screenFigures.mjs) in both languages, for this month and a
// tapped one; the model reads the six months with p_spread and re-splits a
// tapped month without reading again.
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
        XCTAssertEqual(store.queries, [TxnQuery(from: "2020-04-01", to: "2020-09-30", spread: true)])
        XCTAssertEqual(model.state, .loaded(try XCTUnwrap(fixture.expected["en"]?["thisMonth"])))
        model.pick(4)
        XCTAssertEqual(model.state, .loaded(try XCTUnwrap(fixture.expected["en"]?["august"])))
        XCTAssertEqual(store.queries.count, 1)
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
