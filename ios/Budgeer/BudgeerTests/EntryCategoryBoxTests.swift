// The box under an entry on the iPad's entry detail (LedgerModel.categoryBox
// through categoryMath.entryCategoryBox, as the website's entry page): the
// category's reads (every category, the month's entries of the category,
// the month's budgets), its title and link, the budget's bar, the other
// entries newest first without the entry itself, in both languages; none
// for an entry without a category.
import XCTest
import BudgeerCore
@testable import Budgeer

@MainActor
final class EntryCategoryBoxTests: XCTestCase {
    override func tearDown() {
        try? BudgeerCore.shared.setLanguage("en")
        super.tearDown()
    }

    private func model(_ fixture: LedgerFixture) async -> (LedgerModel, FakeStore) {
        let store = FakeStore()
        store.profileResult = .success(fixture.input.profile)
        store.savingsResult = .success(fixture.input.categories)
        store.oldest = .success(fixture.input.oldest)
        store.rowsFor = { query in fixture.rows(kind: query.kind) }
        let now = fixture.now
        let model = LedgerModel(data: store.data, core: .shared, now: { now })
        await model.load()
        return (model, store)
    }

    func testTheEntrysCategoryThisMonth() async throws {
        let fixture = try LedgerFixture.load()
        let (model, store) = await model(fixture)
        // a1: Market, Groceries, 14 Sep 2020 (the fixture's "now" is 15 Sep).
        let entry = try XCTUnwrap(model.row(id: "a1"))
        SnapshotTests.entryBox(store, rows: fixture.input.rows, entry: entry, month: "2020-09-01")
        let read = await model.categoryBox(entryId: "a1")
        let box = try XCTUnwrap(read)
        XCTAssertEqual(box.title, "Groceries · This month")
        XCTAssertEqual(AppPaths.route(box.path), .categoryPage("33333333-3333-4333-8333-333333333333", "m:2020-9"))
        XCTAssertEqual(box.seeAll, "See all")
        let budget = try XCTUnwrap(box.budget)
        XCTAssertTrue(budget.meta.hasSuffix("of €250.00"), budget.meta)
        XCTAssertEqual(budget.valueLabel, "\(budget.percent)%")
        // The other Groceries entries of September, the entry itself left out, newest first.
        XCTAssertFalse(box.others.contains { $0.id == "a1" })
        XCTAssertEqual(box.others.first?.id, "a2")
        XCTAssertLessThanOrEqual(box.others.count, 3)
        // The month's entries of the category were asked for, spread.
        XCTAssertTrue(store.queries.contains(TxnQuery(from: "2020-09-01", to: "2020-09-30",
                                                      categoryId: "33333333-3333-4333-8333-333333333333", spread: true)))
        // In Greek, the web's words.
        try BudgeerCore.shared.setLanguage("el")
        let greekRead = await model.categoryBox(entryId: "a1")
        let greek = try XCTUnwrap(greekRead)
        XCTAssertEqual(greek.seeAll, "Όλα")
        XCTAssertTrue(greek.title.hasSuffix("Αυτός ο μήνας"), greek.title)
    }

    func testNoBoxWithoutACategory() async throws {
        let fixture = try LedgerFixture.load()
        let (model, _) = await model(fixture)
        let none = (fixture.input.rows.arrayValue ?? []).first { $0["category_id"]?.isNull ?? true }
        if let id = none?["id"]?.stringValue {
            let box = await model.categoryBox(entryId: id)
            XCTAssertNil(box)
        }
        let unknown = await model.categoryBox(entryId: "not-an-entry")
        XCTAssertNil(unknown)
    }
}
