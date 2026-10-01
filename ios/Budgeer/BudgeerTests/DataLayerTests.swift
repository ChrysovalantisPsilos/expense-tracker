// The data layer's own rules: the offline cache (network first, the last
// good answer when the network fails, nothing after a sign-out), the live
// hub (a burst of changes refreshes each watching screen once, only for its
// tables), and the exchange-rate steps (the core's rules over the fake's rates).
import XCTest
import BudgeerCore
@testable import Budgeer

final class QueryCacheTests: XCTestCase {
    private func cache() -> QueryCache {
        let folder = FileManager.default.temporaryDirectory.appendingPathComponent("QueryCacheTests-\(UUID().uuidString)")
        return QueryCache(folder: folder)
    }

    func testAGoodAnswerIsKeptAndServedWhenTheNetworkFails() async throws {
        let cache = cache()
        let fresh = try await cache.read("u|transactions|m") { ["a"] }
        XCTAssertEqual(fresh, ["a"])
        let offline = try await cache.read("u|transactions|m") { throw FakeError(description: "offline") }
        XCTAssertEqual(offline, ["a"])
        // A newer answer replaces it.
        _ = try await cache.read("u|transactions|m") { ["b"] }
        let later = try await cache.read("u|transactions|m") { throw FakeError(description: "offline") }
        XCTAssertEqual(later, ["b"])
    }

    func testNothingStoredMeansTheFailureShows() async {
        let cache = cache()
        do {
            _ = try await cache.read("u|budgets|2026-09-01") { throw FakeError(description: "offline") }
            XCTFail("expected the failure")
        } catch {
            XCTAssertEqual(String(describing: error), "offline")
        }
    }

    func testClearForgetsEverything() async throws {
        let cache = cache()
        _ = try await cache.read("u|profile|") { ["base_currency": "EUR"] }
        await cache.clear()
        let hit = await cache.load("u|profile|")
        XCTAssertNil(hit)
    }

    func testKeysAreFileNames() {
        XCTAssertEqual(QueryCache.fileName("a"), QueryCache.fileName("a"))
        XCTAssertNotEqual(QueryCache.fileName("u|transactions|{\"from\":\"2026-09-01\"}"), QueryCache.fileName("u|transactions|"))
        XCTAssertTrue(QueryCache.fileName("x/y|z").hasSuffix(".json"))
        XCTAssertFalse(QueryCache.fileName("x/y|z").contains("/"))
    }
}

@MainActor
final class LiveHubTests: XCTestCase {
    func testABurstRefreshesEachWatcherOnceForItsTables() async throws {
        let hub = LiveHub(debounceMs: 20)
        var ledger = 0
        var budgets = 0
        _ = hub.watch(["transactions"]) { ledger += 1 }
        let budgetsId = hub.watch(["budgets", "transactions"]) { budgets += 1 }
        hub.changed(["transactions"])
        hub.changed(["transactions"])
        hub.changed(["categories"])
        try await Task.sleep(nanoseconds: 150_000_000)
        XCTAssertEqual(ledger, 1)
        XCTAssertEqual(budgets, 1)

        hub.changed(["budgets"])
        try await Task.sleep(nanoseconds: 150_000_000)
        XCTAssertEqual(ledger, 1)
        XCTAssertEqual(budgets, 2)

        hub.unwatch(budgetsId)
        hub.catchUp()
        try await Task.sleep(nanoseconds: 150_000_000)
        XCTAssertEqual(ledger, 2)
        XCTAssertEqual(budgets, 2)
    }
}

final class FxRatesTests: XCTestCase {
    func testPendingRatesAreFilledFromTheSeriesAndFlagged() async throws {
        let store = FakeStore()
        store.rates = ["USD>EUR": 0.9]
        let rows: JSONValue = [
            ["id": "a", "spent_at": "2026-09-10", "currency": "USD", "amount_minor": 1000, "exchange_rate": .null],
            ["id": "b", "spent_at": "2026-09-11", "currency": "EUR", "amount_minor": 500, "exchange_rate": 1],
            ["id": "c", "spent_at": "2026-09-12", "currency": "PLN", "amount_minor": 800, "exchange_rate": .null],
        ]
        let filled = try await FxRates.fillPending(rows, base: "EUR", today: "2026-09-15", fx: store, core: .shared)
        let out = try XCTUnwrap(filled.arrayValue)
        XCTAssertEqual(out[0]["exchange_rate"], .double(0.9))
        XCTAssertEqual(out[0]["rate_estimated"], .bool(true))
        XCTAssertEqual(out[1], rows.arrayValue?[1])
        // No rate for PLN: it stays pending (null), never 1.
        XCTAssertEqual(out[2]["exchange_rate"], .null)
    }

    func testLatestRatesForForeignRulesOnly() async throws {
        let store = FakeStore()
        store.rates = ["USD>EUR": 0.9]
        let rules: JSONValue = [["currency": "USD"], ["currency": "EUR"], ["currency": "PLN"]]
        let rates = try await FxRates.latest(for: rules, base: "EUR", fx: store, core: .shared)
        XCTAssertEqual(rates, ["USD": .double(0.9)])
    }
}
