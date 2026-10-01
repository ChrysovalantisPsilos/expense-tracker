// Design round 3's pictures: each piece in its two takes (DesignOptions),
// light, dark and Greek, named "design-<piece>-<a|b>-<variant>.png" so they
// sit side by side; and the Activity header's fix (the same card across a
// chip and its smooth fold when a filter hides it).
import SwiftUI
import XCTest
import BudgeerCore
@testable import Budgeer

extension SnapshotTests {
    private static let takes: [(String, DesignOption)] = [("a", .a), ("b", .b)]

    /// Home in each take: its order and look, with that take's By category and Meal vouchers.
    func testDesignHomeSnapshots() async throws {
        let fixture = try HomeFixture.load()
        for (lang, dark) in SnapshotTests.variants {
            let model = try await homeModel(fixture, lang: lang)
            for (name, take) in SnapshotTests.takes {
                try await shots(framed(.home) {
                    NavigationStack { HomeView(model: model, chrome: SnapshotTests.chrome) }
                        .environment(\.design, .all(take))
                }, name: "design-home-\(name)", lang: lang, dark: dark, long: 2400)
            }
        }
    }

    /// The lock in each take; B over Home, which it blurs.
    func testDesignLockSnapshots() async throws {
        let fixture = try HomeFixture.load()
        for (lang, dark) in SnapshotTests.variants {
            let home = try await homeModel(fixture, lang: lang)
            let defaults = UserDefaults(suiteName: "SnapshotTests.lock")!
            defaults.set(true, forKey: AppLock.key)
            let owner = FakeOwner()
            owner.answer = false
            let lock = AppLock(defaults: defaults, owner: owner)
            for (name, take) in SnapshotTests.takes {
                try await shots(ZStack {
                    framed(.home) { NavigationStack { HomeView(model: home, chrome: SnapshotTests.chrome) } }
                    LockScreen(lock: lock)
                }
                .environment(\.design, .all(take)), name: "design-lock-\(name)", lang: lang, dark: dark)
            }
        }
    }

    /// Your salary's outlook cards in each take, folded, then with what's behind the tap open.
    func testDesignSalarySnapshots() async throws {
        let fixture = try SalaryFixture.load()
        let now = fixture.now
        for (lang, dark) in SnapshotTests.variants {
            _ = language(lang)
            let model = SalaryModel(data: fixture.store().data, core: .shared, now: { now })
            await model.load()
            for (name, take) in SnapshotTests.takes {
                for unfolded in [false, true] {
                    var picked = DesignOptions.all(take)
                    picked.unfolded = unfolded
                    let design = picked
                    try await shots(framed(.more) {
                        NavigationStack { SalaryView(model: model) { _ in } }
                            .environment(\.design, design)
                    }, name: "design-salary-\(name)\(unfolded ? "-open" : "")", lang: lang, dark: dark, long: 3600)
                }
            }
        }
    }

    /// Activity's header: Expenses only (the card keeps its size), then the
    /// Groups chip, a filter that folds the card away.
    func testDesignActivitySnapshots() async throws {
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
            try await shots(framed(.activity, page), name: "design-activity-expenses", lang: lang, dark: dark)
            await model.setType("all")
            await model.setSharedOnly(true)
            try await shots(framed(.activity, page), name: "design-activity-filtered", lang: lang, dark: dark)
        }
    }
}
