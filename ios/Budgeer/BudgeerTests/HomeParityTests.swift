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
                let figures = try HomeFigures.compute(fixture.homeInput(periodValue: view.periodValue, profile: view.profile),
                                                      core: .shared)
                let expected = try XCTUnwrap(fixture.expected[lang]?[view.name])
                let label = "\(lang) \(view.name)"
                XCTAssertEqual(figures.period, expected.period, label)
                XCTAssertEqual(figures.projectionEnd, expected.projectionEnd, label)
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
        // A pay month: September from the 28 Aug payday, its salary in it.
        XCTAssertEqual(en.period.from, "2020-08-28")
        XCTAssertEqual(en.period.range, "from 28 Aug")
        XCTAssertEqual(en.earnedTotal, 255_000)
        // Logged spending (with the 30 Aug expense) plus the rules still to
        // come before the next payday (expected on the 28th).
        XCTAssertEqual(en.projectionEnd, "2020-09-27")
        XCTAssertEqual(en.spentTotal, 31_930 + 1_500 + 1_299 + 899)
        XCTAssertEqual(en.bars.map(\.share).reduce(0, +), 100)
        XCTAssertEqual(en.bars.first { $0.name == "Subscriptions" }?.value, 800)
        XCTAssertEqual(en.recurring.groups.first?.toggle, nil)
        XCTAssertEqual(try XCTUnwrap(fixture.thisMonth("el")).period.label, "Αυτός ο μήνας")
        XCTAssertEqual(fixture.expected["en"]?["august"]?.recurring.upcoming, false)
    }

    func testTheWindowIsThePayMonth() throws {
        let fixture = try HomeFixture.load()
        try BudgeerCore.shared.setLanguage("en")
        let cal = fixture.homeInput().cal
        let window = try HomeFigures.window(now: fixture.now, cal: cal, core: .shared)
        XCTAssertEqual(window.from, "2020-08-28")
        XCTAssertEqual(window, try XCTUnwrap(fixture.thisMonth()).period)
        // A past month from the picker: its own pay window; without the setting, the calendar month.
        let august = try HomeFigures.window(periodValue: "m:2020-8", now: fixture.now, cal: cal, core: .shared)
        XCTAssertEqual([august.from, august.to], ["2020-07-28", "2020-08-27"])
        let plain = try HomeFigures.window(now: fixture.now, core: .shared)
        XCTAssertEqual(plain.from, "2020-09-01")
        // All time reads from the start.
        let all = try HomeFigures.window(periodValue: "all", now: fixture.now, cal: cal, core: .shared)
        XCTAssertNil(all.from)
    }
}
