// Meal vouchers: the page's figures equal the web's (Fixtures/vouchers.json,
// written by mobile-core/screenFigures.mjs) in both languages; the model
// reads the setup and the expenses paid with vouchers, fixes a month's days
// in place (voucherMath.withDays) and says when there is no setup; the setup
// form opens from setupDraft, wants an amount per day, saves newSettings and
// turns vouchers off.
import XCTest
import BudgeerCore
@testable import Budgeer

/// Fixtures/vouchers.json.
struct VouchersFixture: Decodable {
    struct Input: Decodable {
        let now: String
        let profile: JSONValue
        let settings: JSONValue
        let spends: JSONValue
    }
    let input: Input
    let expected: [String: VoucherFigures]

    static func load() throws -> VouchersFixture {
        try JSONDecoder().decode(VouchersFixture.self, from: fixtureData("vouchers"))
    }

    var now: Date { ISO8601DateFormatter.fractional.date(from: input.now)! }

    func store() -> FakeStore {
        let store = FakeStore()
        store.profileResult = .success(input.profile)
        store.vouchersResult = .success(input.settings)
        store.rowsResult = .success(input.spends)
        return store
    }
}

final class VouchersParityTests: XCTestCase {
    override func tearDown() {
        try? BudgeerCore.shared.setLanguage("en")
        super.tearDown()
    }

    func testFiguresEqualTheWebsInBothLanguages() throws {
        let fixture = try VouchersFixture.load()
        for lang in ["en", "el"] {
            try BudgeerCore.shared.setLanguage(lang)
            let figures = try VoucherFigures.compute(settings: fixture.input.settings, spends: fixture.input.spends,
                                                     profile: fixture.input.profile, now: fixture.now, core: .shared)
            let expected = try XCTUnwrap(fixture.expected[lang])
            XCTAssertEqual(figures.card, expected.card, lang)
            XCTAssertEqual(figures.next, expected.next, lang)
            XCTAssertEqual(figures.fix, expected.fix, lang)
            XCTAssertEqual(figures.history, expected.history, lang)
            XCTAssertEqual(figures, expected, lang)
        }
    }
}

@MainActor
final class VouchersModelTests: XCTestCase {
    override func setUpWithError() throws {
        try super.setUpWithError()
        try BudgeerCore.shared.setLanguage("en")
    }

    func testTheCardFromTheSetupAndTheVoucherSpends() async throws {
        let fixture = try VouchersFixture.load()
        let store = fixture.store()
        let now = fixture.now
        let model = VouchersModel(data: store.data, core: .shared, now: { now })
        await model.load()
        XCTAssertEqual(store.queries, [TxnQuery(kind: "expense", paidWithVouchers: true)])
        XCTAssertEqual(model.state, .loaded(try XCTUnwrap(fixture.expected["en"])))
    }

    func testFixDaysInPlace() async throws {
        let fixture = try VouchersFixture.load()
        let store = fixture.store()
        let now = fixture.now
        let model = VouchersModel(data: store.data, core: .shared, now: { now })
        await model.load()
        model.startFix()
        XCTAssertEqual(model.fixDays, 20)
        model.step(1)
        XCTAssertEqual(model.fixDays, 21)
        XCTAssertEqual(model.fixing?.total.amount, "€168.00")
        XCTAssertEqual(model.fixTotal, ["× €8.00 = ", ["tag": "b", "children": ["€168.00"]]])
        await model.saveFix()
        XCTAssertNil(model.fixing)
        let saved = try XCTUnwrap(store.savingsWrites.last)
        XCTAssertEqual(saved.name, "saveMealVouchers")
        XCTAssertEqual(saved.args["days"]?["2020-09"]?.intValue, 21)
    }

    func testTheCalendarsOwnCountRemovesTheFix() async throws {
        let fixture = try VouchersFixture.load()
        let store = fixture.store()
        let now = fixture.now
        let model = VouchersModel(data: store.data, core: .shared, now: { now })
        await model.load()
        model.startFix()
        model.step(1)
        model.step(1)
        await model.saveFix()
        XCTAssertNil(store.savingsWrites.last?.args["days"]?["2020-09"])
    }

    func testNoSetup() async {
        let store = FakeStore()
        let model = VouchersModel(data: store.data)
        await model.load()
        XCTAssertEqual(model.state, .none)
    }

    func testTheSetupWantsAnAmountThenStartsFromToday() async throws {
        let store = FakeStore()
        store.profileResult = .success(["base_currency": "EUR"])
        let now = TestData.now
        let setup = VoucherSetupModel(data: store.data, core: .shared, now: { now })
        await setup.load()
        XCTAssertFalse(setup.on)
        XCTAssertEqual(setup.topUpOn, "2026-10-01")
        XCTAssertEqual(setup.countries.map(\.value), ["BE", "GR"])
        setup.on = true
        let missing = await setup.save()
        XCTAssertNil(missing)
        XCTAssertTrue(setup.missing)
        setup.setPerDay("8")
        setup.country = "GR"
        setup.setOnCard("25.50")
        let saved = await setup.save()
        XCTAssertEqual(saved?.title, "Meal vouchers saved")
        XCTAssertEqual(store.savingsWrites.last?.args, [
            "v": 1, "country": "GR", "per_day_minor": 800, "currency": "EUR", "topup_day": 1,
            "start_on": "2026-09-15", "start_balance_minor": 2550, "days": [:],
        ])
    }

    func testTurningVouchersOff() async throws {
        let fixture = try VouchersFixture.load()
        let store = fixture.store()
        let now = fixture.now
        let setup = VoucherSetupModel(data: store.data, core: .shared, now: { now })
        await setup.load()
        XCTAssertTrue(setup.on)
        XCTAssertEqual(setup.perDay, "8.00")
        XCTAssertEqual(setup.topUpOn, "2020-10-05")
        setup.on = false
        let off = await setup.save()
        XCTAssertEqual(off?.title, "Meal vouchers turned off")
        XCTAssertEqual(off?.note, "Your expenses paid with vouchers stay as they are.")
        XCTAssertEqual(store.savingsWrites.last?.args, JSONValue.null)
    }
}
