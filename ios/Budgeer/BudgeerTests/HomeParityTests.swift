// The proof Home's figures are the web's: the fixture's inputs through
// HomeFigures (every step a core call) must give the figures the web's
// Dashboard functions wrote into Fixtures/home.json, in English and in
// Greek. test/iosHome.test.js keeps that file equal to the web's answer.
import XCTest
import BudgeerCore
@testable import Budgeer

final class HomeParityTests: XCTestCase {
    override func tearDown() {
        try? BudgeerCore.shared.setLanguage("en")
        super.tearDown()
    }

    func testFiguresEqualTheWebsInBothLanguages() throws {
        let fixture = try HomeFixture.load()
        for lang in ["en", "el"] {
            try BudgeerCore.shared.setLanguage(lang)
            let figures = try HomeFigures.compute(fixture.homeInput, core: .shared)
            let expected = try XCTUnwrap(fixture.expected[lang])
            XCTAssertEqual(figures.period, expected.period, lang)
            XCTAssertEqual(figures.fetchFrom, expected.fetchFrom, lang)
            XCTAssertEqual(figures.spent, expected.spent, lang)
            XCTAssertEqual(figures.income, expected.income, lang)
            XCTAssertEqual(figures.net, expected.net, lang)
            XCTAssertEqual(figures.netTone, expected.netTone, lang)
            XCTAssertEqual(figures.saved, expected.saved, lang)
            XCTAssertEqual(figures.bars, expected.bars, lang)
            XCTAssertEqual(figures, expected, lang)
        }
    }

    func testTheFixtureFoldsInTheWebsRules() throws {
        let fixture = try HomeFixture.load()
        let en = try XCTUnwrap(fixture.expected["en"])
        // A shifted salary (25th) is fetched from late August and counts in September.
        XCTAssertEqual(en.fetchFrom, "2026-08-25")
        XCTAssertEqual(en.earnedTotal, 255_000)
        XCTAssertEqual(en.net, "+€2,050.70")
        XCTAssertEqual(en.bars.map(\.share).reduce(0, +), 100)
        XCTAssertEqual(en.bars.first { $0.name == "Subscriptions" }?.value, 800)
        XCTAssertEqual(try XCTUnwrap(fixture.expected["el"]).period.label, "Αυτός ο μήνας")
    }

    func testTheWindowIsTheFetchStart() throws {
        let fixture = try HomeFixture.load()
        try BudgeerCore.shared.setLanguage("en")
        let window = try HomeFigures.window(profile: fixture.input.profile, now: fixture.now, core: .shared)
        XCTAssertEqual(window.fetchFrom, "2026-08-25")
        XCTAssertEqual(window.period, try XCTUnwrap(fixture.expected["en"]).period)
        // Without a salary shift the fetch starts with the month.
        let plain = try HomeFigures.window(profile: .object(["base_currency": .string("EUR")]), now: fixture.now, core: .shared)
        XCTAssertEqual(plain.fetchFrom, "2026-09-01")
    }
}
