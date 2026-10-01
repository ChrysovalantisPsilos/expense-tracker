// The proof Home's figures are the web's: the fixture's inputs through
// HomeFigures (every step a core call) must give the figures the web's
// Dashboard functions wrote into Fixtures/home.json, in English and in
// Greek, for this month (the projection with the recurring rules, the
// upcoming Recurring card) and a past month (its charges).
// test/iosHome.test.js keeps that file equal to the web's answer.
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
            for view in fixture.input.views {
                let figures = try HomeFigures.compute(fixture.homeInput(periodValue: view.periodValue), core: .shared)
                let expected = try XCTUnwrap(fixture.expected[lang]?[view.name])
                let label = "\(lang) \(view.name)"
                XCTAssertEqual(figures.period, expected.period, label)
                XCTAssertEqual(figures.fetchFrom, expected.fetchFrom, label)
                XCTAssertEqual(figures.spent, expected.spent, label)
                XCTAssertEqual(figures.income, expected.income, label)
                XCTAssertEqual(figures.net, expected.net, label)
                XCTAssertEqual(figures.netTone, expected.netTone, label)
                XCTAssertEqual(figures.saved, expected.saved, label)
                XCTAssertEqual(figures.bars, expected.bars, label)
                XCTAssertEqual(figures.recurring, expected.recurring, label)
                XCTAssertEqual(figures, expected, label)
            }
        }
    }

    func testTheFixtureFoldsInTheWebsRules() throws {
        let fixture = try HomeFixture.load()
        let en = try XCTUnwrap(fixture.thisMonth())
        // A shifted salary (25th) is fetched from late August and counts in September.
        XCTAssertEqual(en.fetchFrom, "2020-08-25")
        XCTAssertEqual(en.earnedTotal, 255_000)
        // Logged spending plus the rules still to come this month.
        XCTAssertEqual(en.spentTotal, 31_930 + 1_299 + 899)
        XCTAssertEqual(en.bars.map(\.share).reduce(0, +), 100)
        XCTAssertEqual(en.bars.first { $0.name == "Subscriptions" }?.value, 800)
        XCTAssertEqual(en.recurring.groups.first?.toggle, nil)
        XCTAssertEqual(try XCTUnwrap(fixture.thisMonth("el")).period.label, "Αυτός ο μήνας")
        XCTAssertEqual(fixture.expected["en"]?["august"]?.recurring.upcoming, false)
    }

    func testTheWindowIsTheFetchStart() throws {
        let fixture = try HomeFixture.load()
        try BudgeerCore.shared.setLanguage("en")
        let window = try HomeFigures.window(profile: fixture.input.profile, now: fixture.now, core: .shared)
        XCTAssertEqual(window.fetchFrom, "2020-08-25")
        XCTAssertEqual(window.period, try XCTUnwrap(fixture.thisMonth()).period)
        // A past month from the picker, and without a salary shift the fetch starts with the month.
        let august = try HomeFigures.window(profile: fixture.input.profile, periodValue: "m:2020-8", now: fixture.now, core: .shared)
        XCTAssertEqual(august.fetchFrom, "2020-07-25")
        let plain = try HomeFigures.window(profile: .object(["base_currency": .string("EUR")]), now: fixture.now, core: .shared)
        XCTAssertEqual(plain.fetchFrom, "2020-09-01")
        // All time reads from the start.
        let all = try HomeFigures.window(profile: fixture.input.profile, periodValue: "all", now: fixture.now, core: .shared)
        XCTAssertNil(all.fetchFrom)
    }
}
