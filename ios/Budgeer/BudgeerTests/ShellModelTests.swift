// The frame's model: the bell's feed with when each came, the badge, and
// opening the notifications page (everything read, the new ones still
// marked there).
import XCTest
import BudgeerCore
@testable import Budgeer

@MainActor
final class ShellModelTests: XCTestCase {
    override func setUpWithError() throws {
        try super.setUpWithError()
        try BudgeerCore.shared.setLanguage("en")
    }

    func testTheFeedSaysWhenAndOpeningReadsIt() async throws {
        let store = FakeStore()
        store.notificationsResult = .success([
            ["id": "n1", "type": "expense", "title": "Alex added Taxi", "body": "Lisbon trip · €84.60", "read_at": .null,
             "created_at": "2026-09-20T08:05:00Z", "group_id": "g-lisbon"],
            ["id": "n2", "type": "budget", "title": "Eating out is at 90%", "body": .null,
             "read_at": "2026-09-18T09:00:00Z", "created_at": "2026-09-18T07:00:00Z"],
        ])
        let now = ISO8601DateFormatter().date(from: "2026-09-20T12:00:00Z")!
        let model = ShellModel(data: store.data, now: { now })
        await model.load()
        XCTAssertEqual(model.badge, "1")
        let when: String = try BudgeerCore.shared.call("dates", "shortDateTime", ["2026-09-20T08:05:00Z", JSDate(now)])
        XCTAssertEqual(model.items.first?.when, when)
        XCTAssertEqual(model.items.first?.path, "/groups/g-lisbon")
        XCTAssertEqual(model.items.last?.path, "/budgets")

        await model.opened()
        XCTAssertNil(model.badge)
        XCTAssertTrue(model.items.allSatisfy(\.read))
        XCTAssertEqual(model.fresh, ["n1"])
        XCTAssertEqual(store.markedRead, 1)
    }
}
