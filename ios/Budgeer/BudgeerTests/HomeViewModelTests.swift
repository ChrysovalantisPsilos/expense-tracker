// HomeViewModel over a fake repository: the reads in the web's order (the
// profile first, then the month's rows from the shifted start), the figures
// from the core, a first load that fails, and a refresh that fails while
// figures are on screen.
import XCTest
import BudgeerCore
@testable import Budgeer

@MainActor
final class HomeViewModelTests: XCTestCase {
    private var fixture: HomeFixture!

    override func setUpWithError() throws {
        try super.setUpWithError()
        fixture = try HomeFixture.load()
        try BudgeerCore.shared.setLanguage("en")
    }

    private func model(_ repository: FakeHomeRepository) -> HomeViewModel {
        let now = fixture.now
        return HomeViewModel(repository: repository, core: .shared, now: { now })
    }

    func testLoadReadsTheMonthFromTheShiftedStartAndComputesTheFigures() async throws {
        let repository = FakeHomeRepository(fixture: fixture)
        let model = model(repository)
        XCTAssertEqual(model.state, .loading)
        await model.load()
        XCTAssertEqual(repository.windows.count, 1)
        XCTAssertEqual(repository.windows[0].from, "2026-08-25")
        XCTAssertEqual(repository.windows[0].to, fixture.expected["en"]?.period.to)
        XCTAssertEqual(model.state, .loaded(try XCTUnwrap(fixture.expected["en"])))
        XCTAssertNil(model.refreshError)
        XCTAssertFalse(model.refreshing)
    }

    func testAFirstLoadThatFailsShowsTheError() async {
        let repository = FakeHomeRepository(fixture: fixture)
        repository.profileResult = .failure(FakeError(description: "offline"))
        let model = model(repository)
        await model.load()
        XCTAssertEqual(model.state, .failed("offline"))
        XCTAssertTrue(repository.windows.isEmpty)
    }

    func testARefreshThatFailsKeepsTheFigures() async throws {
        let repository = FakeHomeRepository(fixture: fixture)
        let model = model(repository)
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
