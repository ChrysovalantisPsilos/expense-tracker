// Activity's header beyond the first picture: Expenses only (the card keeps
// its size when a chip changes the kind), then the Groups chip, a filter
// that folds the card away.
import SwiftUI
import XCTest
import BudgeerCore
@testable import Budgeer

extension SnapshotTests {
    func testActivityHeaderSnapshots() async throws {
        let fixture = try LedgerFixture.load()
        let now = fixture.now
        for (lang, dark) in SnapshotTests.variants {
            _ = language(lang)
            let store = FakeStore()
            store.profileResult = .success(fixture.input.profile)
            store.savingsResult = .success(fixture.input.categories)
            store.categoriesResult = .success(TestData.categories)
            store.oldest = .success(fixture.input.oldest)
            store.rowsFor = { query in fixture.rows(kind: query.kind) }
            let model = LedgerModel(data: store.data, core: .shared, now: { now })
            await model.load()
            let page = {
                NavigationStack {
                    ActivityView(model: model, chrome: SnapshotTests.chrome, open: { _ in }, duplicate: { _ in },
                                 split: { _ in })
                }
            }
            await model.setType("expense")
            try await shots(framed(.activity, page), name: "activity-expenses", lang: lang, dark: dark)
            await model.setType("all")
            await model.setSharedOnly(true)
            try await shots(framed(.activity, page), name: "activity-filtered", lang: lang, dark: dark)
        }
    }
}
