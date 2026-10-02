// The App Store pictures' screens: Home, Activity, Add's "Who's it for?",
// a group, Budgets and Savings, in English and Greek, light, as
// "store-<screen>-<en|el>.png" on the iPhone and, beside the sidebar on an
// iPad Pro 13-inch in portrait, "store-ipad-<screen>-<en|el>.png"
// (SnapshotTests+iPad.swift). The same fixtures as the other snapshots,
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

/// The store pictures' models, in one language.
@MainActor
struct StoreScreens {
    let chrome: PageChrome
    let home: HomeViewModel
    let activity: LedgerModel
    /// The first entry the month lists (an iPad shows it beside the list).
    let firstEntry: String?
    let form: FakeStore
    let myGroups: MyGroupsModel
    let saved: JSONValue
    let groups: GroupsModel
    let groupId: String
    let group: GroupModel
    let budgets: BudgetsModel
    let savings: SavingsModel

    /// Add, split with a group (a new model each time: a sheet takes it over).
    func split() -> EntryFormModel {
        EntryFormModel(mode: .add, transaction: saved, data: form.data, core: .shared, now: { TestData.now })
    }
}

extension SnapshotTests {
    func testStoreSnapshots() async throws {
        for lang in ["en", "el"] {
            let screens = try await storeScreens(lang)
            let chrome = screens.chrome
            try await storeShot("home", lang, framed(.home) {
                NavigationStack { HomeView(model: screens.home, chrome: chrome) }
            })
            try await storeShot("activity", lang, framed(.activity) {
                NavigationStack {
                    ActivityView(model: screens.activity, chrome: chrome, open: { _ in }, duplicate: { _ in }, split: { _ in })
                }
            })
            let split = screens.split()
            try await storeShot("add-group", lang, overHome(screens.home) {
                AddSheet(request: AddRequest(model: split, splitting: screens.saved), data: screens.form.data,
                         userId: SnapshotTests.user, groups: screens.myGroups)
            }, settle: 2.5)
            try await storeShot("group", lang, framed(.groups) { NavigationStack { GroupPageView(model: screens.group) } })
            try await storeShot("budgets", lang, framed(.home) { NavigationStack { BudgetsView(model: screens.budgets) } })
            try await storeShot("savings", lang, framed(.more) {
                NavigationStack {
                    SavingsView(model: screens.savings, add: { _, _ in }, open: { _ in }, openRule: { _ in })
                }
            })
        }
    }

    /// The store pictures' models in `lang`, from the store sample.
    func storeScreens(_ lang: String) async throws -> StoreScreens {
        let sample = try StoreSample.load(lang)
        let chrome = PageChrome(initials: lang == "el" ? "ΑΜ" : "AM", badge: "1", onBell: {}, onProfile: {})

        // Home, this month.
        let home = try await homeModel(sample.fixture(HomeFixture.self, "home"), lang: lang, sample: sample)

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

        // Add, split with a group: "Who's it for?".
        let form = try formStore(sample)
        let myGroups = MyGroupsModel(data: form.data, userId: SnapshotTests.user, defaults: defaults())

        // The groups, and one group's page, seen by its owner.
        let fixture = try sample.fixture(GroupsFixture.self, "groups")
        let groupStore = fixture.store()
        let groups = GroupsModel(data: groupStore.data, userId: SnapshotTests.user)
        await groups.load()
        let group = GroupModel(groupId: fixture.groupId, userId: SnapshotTests.user, site: "https://budgeer.com",
                               data: groupStore.data, now: { fixture.now })
        await group.load()

        // Budgets, this month (the fixture's store keys its months by the fixture's year).
        let budgetsFixture = try sample.fixture(BudgetsFixture.self, "budgets")
        let budgetsStore = budgetsFixture.store("own")
        let own = try XCTUnwrap(budgetsFixture.input.views.first { $0.name == "own" })
        budgetsStore.budgetsByPeriod = [sample.day("2020-09-01"): own.budgets, sample.day("2020-08-01"): own.previous]
        budgetsStore.categoriesResult = .success(sample(TestData.categories))
        let budgets = BudgetsModel(data: budgetsStore.data, core: .shared, now: { budgetsFixture.now })
        await budgets.load()

        // Savings: the pot, its line and the goals.
        let savingsFixture = try sample.fixture(SavingsFixture.self, "savings")
        let savings = SavingsModel(data: savingsFixture.store().data, core: .shared, now: { savingsFixture.now })
        await savings.load()

        return StoreScreens(chrome: chrome, home: home, activity: activity, firstEntry: SnapshotTests.firstEntry(activity),
                            form: form, myGroups: myGroups, saved: sample(SnapshotTests.saved), groups: groups,
                            groupId: fixture.groupId, group: group, budgets: budgets, savings: savings)
    }

    /// The first of a month's entries that can be shown beside the list (not a group's share).
    static func firstEntry(_ ledger: LedgerModel) -> String? {
        guard case .loaded(let figures) = ledger.state else { return nil }
        return figures.days.lazy.flatMap(\.rows).first { !$0.shared }?.id
    }

    /// One store screen, the phone's region set from the language.
    func storeShot<V: View>(_ name: String, _ lang: String, _ view: V, settle: TimeInterval = 0.8,
                            screen: CGSize = SnapshotTests.size) async throws {
        let region = Locale(identifier: lang == "el" ? "el_GR" : "en_GB")
        try await shots(view.environment(\.locale, region), name: "store-\(name)", lang: lang, dark: false, settle: settle,
                        screen: screen)
    }
}
