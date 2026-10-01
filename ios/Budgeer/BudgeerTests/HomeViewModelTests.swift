// HomeViewModel over the fake store: the reads in the web's order (the
// profile first, then the period's rows from the shifted start), the rules
// and today's rates for the projection and the Recurring card, the figures
// from the core, the period picker, a first load that fails, and a refresh
// that fails while figures are on screen.
import XCTest
import BudgeerCore
@testable import Budgeer

@MainActor
final class HomeViewModelTests: XCTestCase {
    override func setUpWithError() throws {
        try super.setUpWithError()
        try BudgeerCore.shared.setLanguage("en")
    }

    private func model(_ repository: FakeStore, _ fixture: HomeFixture) -> HomeViewModel {
        let now = fixture.now
        return HomeViewModel(data: repository.data, core: .shared, now: { now })
    }

    func testLoadReadsTheMonthFromTheShiftedStartAndComputesTheFigures() async throws {
        let fixture = try HomeFixture.load()
        let repository = FakeStore(home: fixture)
        repository.oldest = .success("2020-03-15")
        let model = model(repository, fixture)
        XCTAssertEqual(model.state, .loading)
        await model.load()
        XCTAssertEqual(repository.queries.first, TxnQuery(from: "2020-08-25", to: "2020-09-30", spread: true))
        XCTAssertEqual(model.state, .loaded(try XCTUnwrap(fixture.thisMonth())))
        XCTAssertNil(model.refreshError)
        XCTAssertFalse(model.refreshing)
        // The picker: this month first (no salary counted in October yet), back to March, the years, all time.
        XCTAssertEqual(model.periods.first?.value, "m:2020-9")
        XCTAssertEqual(model.periods.last?.value, "all")
        XCTAssertEqual(model.currentValue, "m:2020-9")
    }

    func testAPastMonthShowsItsCharges() async throws {
        let fixture = try HomeFixture.load()
        let repository = FakeStore(home: fixture)
        repository.oldest = .success("2020-03-15")
        let model = model(repository, fixture)
        await model.load()
        await model.setPeriod("m:2020-8")
        XCTAssertEqual(repository.queries.filter { $0.kind == nil }.last, TxnQuery(from: "2020-07-25", to: "2020-08-31", spread: true))
        XCTAssertEqual(model.state, .loaded(try XCTUnwrap(fixture.expected["en"]?["august"])))
        XCTAssertEqual(model.currentValue, "m:2020-8")
    }

    func testNextMonthIsOfferedOnceItsSalaryIsIn() async throws {
        let fixture = try HomeFixture.load()
        let repository = FakeStore(home: fixture)
        repository.oldest = .success("2020-03-15")
        repository.newestIncomeRows = [["kind": "income", "category_id": "11111111-1111-4111-8111-111111111111",
                                        "spent_at": "2020-09-28"]]
        let model = model(repository, fixture)
        await model.load()
        XCTAssertEqual(model.periods.first?.value, "m:2020-10")
        XCTAssertEqual(model.currentValue, "m:2020-9") // this month stays the default
    }

    func testTheCardsWithReadsOfTheirOwn() async throws {
        let fixture = try HomeFixture.load()
        let repository = FakeStore(home: fixture)
        repository.oldest = .success("2020-03-15")
        repository.vouchersResult = .success(HomeViewModelTests.vouchers)
        repository.budgetsByPeriod = ["2020-09-01": [HomeViewModelTests.groceriesCap]]
        let model = model(repository, fixture)
        await model.load()
        // Meal vouchers: the balance and the next top-up, from the expenses paid with them.
        XCTAssertTrue(repository.queries.contains(TxnQuery(kind: "expense", paidWithVouchers: true)))
        let vouchers = try XCTUnwrap(model.vouchers)
        XCTAssertTrue(vouchers.nextAmount.hasPrefix("+€176.00 on 5 Oct"))
        XCTAssertEqual(vouchers.nextWhy, "September · 22 working days × €8.00")
        // Budgets: this month's caps and spend.
        XCTAssertTrue(repository.queries.contains(TxnQuery(kind: "expense", from: "2020-09-01", to: "2020-09-30", spread: true)))
        guard case .loaded(let card) = model.budgets else { return XCTFail("\(model.budgets)") }
        XCTAssertEqual(card.subtitle, "This month")
        XCTAssertEqual(card.items.map(\.name), ["Groceries"])
        // The month in plain words stays out while its switch is off.
        XCTAssertNil(model.words)
        // The Expenses card, ten rows a page.
        guard case .loaded(let figures) = model.state else { return XCTFail("\(model.state)") }
        let page = model.page(figures.expenseList, 1)
        XCTAssertEqual(page.pages, 1)
        XCTAssertEqual(page.rows, figures.expenseList.rows)
        XCTAssertEqual(page.position, "Page 1 of 1")
        XCTAssertEqual(model.row(id: "a1")?["amount_minor"], 4250)
    }

    func testInWordsWhenTheHelperIsOn() async throws {
        let fixture = try HomeFixture.load()
        let repository = FakeStore(home: fixture)
        repository.oldest = .success("2020-03-15")
        repository.profileResult = .success(fixture.input.profile.with("ai_month_summary", true))
        repository.summaryResult = .success(["summary": ["lines": ["You spent less on groceries."], "lang": "en"],
                                             "stale": false, "empty": false])
        let model = model(repository, fixture)
        await model.load()
        let words = try XCTUnwrap(model.words)
        XCTAssertTrue(words.offered)
        XCTAssertEqual(words.state, "ready")
        XCTAssertEqual(words.title, "September in short")
        XCTAssertEqual(words.lines, ["You spent less on groceries."])
        XCTAssertEqual(model.monthTitle, "September")
        model.pickTab("numbers")
        XCTAssertFalse(model.showsWords)
        model.pickTab("words")
        XCTAssertTrue(model.showsWords)
        XCTAssertTrue(repository.summariesWritten.isEmpty)
    }

    func testAMonthWithoutASummaryIsWrittenOnce() async throws {
        let fixture = try HomeFixture.load()
        let repository = FakeStore(home: fixture)
        repository.oldest = .success("2020-03-15")
        repository.profileResult = .success(fixture.input.profile.with("ai_month_summary", true))
        repository.summaryResult = .success(["summary": .null, "stale": false, "empty": false])
        let model = model(repository, fixture)
        await model.load()
        XCTAssertEqual(repository.summariesWritten, ["2020-09-01"])
        await model.refresh()
        XCTAssertEqual(repository.summariesWritten, ["2020-09-01"])
    }

    static let vouchers: JSONValue = ["v": 1, "country": "BE", "per_day_minor": 800, "currency": "EUR", "topup_day": 5,
                                      "start_on": "2020-08-20", "start_balance_minor": 3450, "days": [:]]
    static let groceriesCap: JSONValue = [
        "category_id": "33333333-3333-4333-8333-333333333333", "amount_minor": 40000, "currency": "EUR",
        "period_start": "2020-09-01",
        "categories": ["id": "33333333-3333-4333-8333-333333333333", "name": "Groceries", "kind": "expense",
                       "icon": .null, "color": .null],
    ]

    func testAFirstLoadThatFailsShowsTheError() async throws {
        let fixture = try HomeFixture.load()
        let repository = FakeStore(home: fixture)
        repository.profileResult = .failure(FakeError(description: "offline"))
        let model = model(repository, fixture)
        await model.load()
        XCTAssertEqual(model.state, .failed("offline"))
        XCTAssertTrue(repository.queries.isEmpty)
    }

    func testARefreshThatFailsKeepsTheFigures() async throws {
        let fixture = try HomeFixture.load()
        let repository = FakeStore(home: fixture)
        repository.oldest = .success("2020-03-15")
        let model = model(repository, fixture)
        await model.load()
        repository.rowsResult = .failure(FakeError(description: "timed out"))
        await model.refresh()
        XCTAssertEqual(model.state, .loaded(try XCTUnwrap(fixture.thisMonth())))
        XCTAssertEqual(model.refreshError, "timed out")
        repository.rowsResult = .success(fixture.input.rows)
        await model.refresh()
        XCTAssertNil(model.refreshError)
    }
}
