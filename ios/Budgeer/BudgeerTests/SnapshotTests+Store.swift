// The App Store pictures' screens: Home, Activity, Add's "Who's it for?",
// a group, Budgets and Savings, in English and Greek, light, as
// "store-<screen>-<en|el>.png". The same fixtures as the other snapshots,
// but as StoreSample has them (Fixtures/store-sample.json): in 2026 rather
// than the fixtures' 2020, the default categories in the app's language and
// the entries, groups and people in the picture's language. The phone's
// region follows the language (dates in the system's pickers). Taken with the
// other snapshots (the "snapshots" box of ios-app.yml); `npm run store:shots`
// frames them for the store (scripts/store-shots).
import SwiftUI
import XCTest
import BudgeerCore
@testable import Budgeer

extension SnapshotTests {
    func testStoreSnapshots() async throws {
        for lang in ["en", "el"] {
            let sample = try StoreSample.load(lang)
            let chrome = PageChrome(initials: lang == "el" ? "ΑΜ" : "AM", badge: "1", onBell: {}, onProfile: {})

            // Home, this month.
            let home = try await homeModel(sample.fixture(HomeFixture.self, "home"), lang: lang, sample: sample)
            try await storeShot("home", lang, framed(.home) { NavigationStack { HomeView(model: home, chrome: chrome) } })

            // Activity, the month by day.
            let ledger = try sample.fixture(LedgerFixture.self, "ledger")
            let now = ledger.now
            let ledgerStore = FakeStore()
            ledgerStore.profileResult = .success(ledger.input.profile)
            ledgerStore.savingsResult = .success(ledger.input.categories)
            ledgerStore.categoriesResult = .success(sample(TestData.categories))
            ledgerStore.oldest = .success(ledger.input.oldest)
            ledgerStore.rowsFor = { query in ledger.rows(kind: query.kind) }
            let activity = LedgerModel(data: ledgerStore.data, core: .shared, now: { now })
            await activity.load()
            try await storeShot("activity", lang, framed(.activity) {
                NavigationStack {
                    ActivityView(model: activity, chrome: chrome, open: { _ in }, duplicate: { _ in }, split: { _ in })
                }
            })

            // Add, split with a group: "Who's it for?".
            let store = try formStore(sample)
            let groups = MyGroupsModel(data: store.data, userId: SnapshotTests.user, defaults: defaults())
            let saved = sample(SnapshotTests.saved)
            let split = EntryFormModel(mode: .add, transaction: saved, data: store.data, core: .shared,
                                       now: { TestData.now })
            try await storeShot("add-group", lang, overHome(home) {
                AddSheet(request: AddRequest(model: split, splitting: saved), data: store.data,
                         userId: SnapshotTests.user, groups: groups)
            }, settle: 2.5)

            // A group's page, seen by its owner.
            let fixture = try sample.fixture(GroupsFixture.self, "groups")
            let group = GroupModel(groupId: fixture.groupId, userId: SnapshotTests.user, site: "https://budgeer.com",
                                   data: fixture.store().data, now: { fixture.now })
            await group.load()
            try await storeShot("group", lang, framed(.groups) { NavigationStack { GroupPageView(model: group) } })

            // Budgets, this month (the fixture's store keys its months by the fixture's year).
            let budgetsFixture = try sample.fixture(BudgetsFixture.self, "budgets")
            let budgetsStore = budgetsFixture.store("own")
            let own = try XCTUnwrap(budgetsFixture.input.views.first { $0.name == "own" })
            budgetsStore.budgetsByPeriod = [sample.day("2020-09-01"): own.budgets, sample.day("2020-08-01"): own.previous]
            budgetsStore.categoriesResult = .success(sample(TestData.categories))
            let budgets = BudgetsModel(data: budgetsStore.data, core: .shared, now: { budgetsFixture.now })
            await budgets.load()
            try await storeShot("budgets", lang, framed(.home) { NavigationStack { BudgetsView(model: budgets) } })

            // Savings: the pot, its line and the goals.
            let savingsFixture = try sample.fixture(SavingsFixture.self, "savings")
            let savings = SavingsModel(data: savingsFixture.store().data, core: .shared, now: { savingsFixture.now })
            await savings.load()
            try await storeShot("savings", lang, framed(.more) {
                NavigationStack { SavingsView(model: savings, add: { _, _ in }, open: { _ in }, openRule: { _ in }) }
            })
        }
    }

    /// One store screen, the phone's region set from the language.
    private func storeShot<V: View>(_ name: String, _ lang: String, _ view: V, settle: TimeInterval = 0.8) async throws {
        let region = Locale(identifier: lang == "el" ? "el_GR" : "en_GB")
        try await shots(view.environment(\.locale, region), name: "store-\(name)", lang: lang, dark: false, settle: settle)
    }
}
