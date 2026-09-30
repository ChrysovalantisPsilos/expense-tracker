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
        XCTAssertEqual(repository.queries, [TxnQuery(from: "2020-08-25", to: "2020-09-30", spread: true)])
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
        XCTAssertEqual(repository.queries.last, TxnQuery(from: "2020-07-25", to: "2020-08-31", spread: true))
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
