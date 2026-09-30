// HomeViewModel over the fake store: the reads in the web's order (the
// profile first, then the month's rows from the shifted start), the figures
// from the core, a first load that fails, and a refresh that fails while
// figures are on screen.
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
        let model = model(repository, fixture)
        XCTAssertEqual(model.state, .loading)
        await model.load()
        XCTAssertEqual(repository.queries.count, 1)
        XCTAssertEqual(repository.queries[0].from, "2026-08-25")
        XCTAssertEqual(repository.queries[0].to, fixture.expected["en"]?.period.to)
        XCTAssertTrue(repository.queries[0].spread)
        XCTAssertEqual(model.state, .loaded(try XCTUnwrap(fixture.expected["en"])))
        XCTAssertNil(model.refreshError)
        XCTAssertFalse(model.refreshing)
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
        let model = model(repository, fixture)
        await model.load()
        repository.rowsResult = .failure(FakeError(description: "timed out"))
        await model.refresh()
        XCTAssertEqual(model.state, .loaded(try XCTUnwrap(fixture.expected["en"])))
        XCTAssertEqual(model.refreshError, "timed out")
        repository.rowsResult = .success(fixture.input.rows)
        await model.refresh()
        XCTAssertNil(model.refreshError)
    }
}
