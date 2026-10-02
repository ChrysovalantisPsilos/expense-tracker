// The iPad's pictures, beside the sidebar (SidebarFrame, design A), on an
// iPad Pro 13-inch: Home in two columns, Activity's list beside the entry
// picked, Groups' list beside a group's page, the Add sheet over Home and
// Budgets, in landscape (1376 × 1032) light, dark and Greek, and Home in
// portrait with the sidebar tucked away ("ipad-<name>-<variant>.png"); the
// large and extra-large widgets ("ipad-widgets"); and the App Store's iPad
// screens in portrait (1032 × 1376, 2064 × 2752 pixels), as
// "store-ipad-<screen>-<en|el>.png" for `npm run store:shots`. Taken only on
// an iPad (ios-app.yml's iPad run); an iPhone run skips them.
import SwiftUI
import XCTest
import BudgeerCore
@testable import Budgeer

extension SnapshotTests {
    /// An iPad Pro 13-inch's screen in points.
    static let iPadLandscape = CGSize(width: 1376, height: 1032)
    static let iPadPortrait = CGSize(width: 1032, height: 1376)
    static let profile = SidebarProfile(name: "Sam Morgan", email: "sam@example.com", initials: "SM")
    /// The bar's bell and Add, beside the sidebar.
    static var wideChrome: PageChrome { chrome.wide {} }

    /// What the entry box reads: the rows' categories (as every category) and a
    /// €250.00 budget for the entry's category in `month`.
    static func entryBox(_ store: FakeStore, rows: JSONValue, entry: JSONValue?, month: String) {
        var seen = Set<String>()
        var categories: [JSONValue] = []
        for row in rows.arrayValue ?? [] {
            if let category = row["categories"], let id = category["id"]?.stringValue, seen.insert(id).inserted {
                categories.append(category)
            }
        }
        store.allCategoriesResult = .success(.array(categories))
        if let id = entry?["category_id"]?.stringValue {
            store.budgetsByPeriod[month] = [["category_id": .string(id), "amount_minor": 25000, "currency": "EUR",
                                             "period_start": .string(month)]]
        }
    }

    private func onIPad() throws {
        try XCTSkipUnless(UIDevice.current.userInterfaceIdiom == .pad, "The iPad's pictures are taken on an iPad.")
    }

    /// A page beside the sidebar, its section picked (and a list beside it for Activity and Groups).
    func sidebar<L: View, D: View>(_ section: SidebarSection, columns: NavigationSplitViewVisibility = .all,
                                   profile: SidebarProfile = SnapshotTests.profile,
                                   @ViewBuilder list: @escaping () -> L,
                                   @ViewBuilder detail: @escaping () -> D) -> some View {
        SidebarFrame(section: .constant(section), items: SidebarSection.items(vouchers: true), groups: 3, profile: profile,
                     columns: columns, list: list, detail: detail)
    }

    func testIPadSnapshots() async throws {
        try onIPad()
        let fixture = try HomeFixture.load()
        let ledger = try LedgerFixture.load()
        let groupsFixture = try GroupsFixture.load()
        let budgetsFixture = try BudgetsFixture.load()
        let wide = SnapshotTests.wideChrome
        let screen = SnapshotTests.iPadLandscape
        for (lang, dark) in SnapshotTests.variants {
            // Home: the overview across the top, the cards in two columns.
            let home = try await homeModel(fixture, lang: lang)
            let homePage = sidebar(.home) { EmptyView() } detail: {
                NavigationStack { HomeView(model: home, chrome: wide) }
            }
            try await shots(homePage, name: "ipad-home", lang: lang, dark: dark, screen: screen)
            try await shots(sidebar(.home, columns: .detailOnly) { EmptyView() } detail: {
                NavigationStack { HomeView(model: home, chrome: wide) }
            }, name: "ipad-home-portrait", lang: lang, dark: dark, screen: SnapshotTests.iPadPortrait)

            // Activity: the month's list beside the entry picked in it.
            let store = FakeStore()
            store.profileResult = .success(ledger.input.profile)
            store.savingsResult = .success(ledger.input.categories)
            store.categoriesResult = .success(TestData.categories)
            store.oldest = .success(ledger.input.oldest)
            store.rowsFor = { query in ledger.rows(kind: query.kind) }
            let now = ledger.now
            let activity = LedgerModel(data: store.data, core: .shared, now: { now })
            await activity.load()
            let picked = SnapshotTests.firstEntry(activity)
            // The picked entry's category this month: its budget and its other entries.
            SnapshotTests.entryBox(store, rows: ledger.input.rows, entry: picked.flatMap { activity.row(id: $0) },
                                   month: "2020-09-01")
            try await shots(sidebar(.activity) {
                ActivityView(model: activity, chrome: .hidden, picked: picked, open: { _ in }, duplicate: { _ in },
                             split: { _ in })
            } detail: {
                NavigationStack {
                    EntryPane(model: activity, id: picked, edit: { _ in }, duplicate: { _ in }, split: { _ in }) {}
                        .pageChrome(wide)
                }
            }, name: "ipad-activity", lang: lang, dark: dark, settle: 1.2, screen: screen)

            // Groups: the list beside a group's page.
            let galleryStore = SnapshotTests.galleryStore(groupsFixture)
            let groups = GroupsModel(data: galleryStore.data, userId: SnapshotTests.user)
            await groups.load()
            let groupNow = groupsFixture.now
            let group = GroupModel(groupId: groupsFixture.groupId, userId: SnapshotTests.user, site: "https://dev.budgeer.com",
                                   data: galleryStore.data, now: { groupNow })
            await group.load()
            try await shots(sidebar(.groups) {
                GroupListColumn(model: groups, picked: groupsFixture.groupId, pick: { _ in }, open: { _ in })
            } detail: {
                NavigationStack { GroupPageView(model: group).pageChrome(wide) }
            }, name: "ipad-group", lang: lang, dark: dark, settle: 1.2, screen: screen)

            // Add over Home: the whole form at once (no pulling up on an iPad's form sheet).
            let form = try formStore()
            let myGroups = MyGroupsModel(data: form.data, userId: SnapshotTests.user, defaults: defaults())
            let add = EntryFormModel(mode: .add, data: form.data, core: .shared, now: { TestData.now })
            await add.load()
            add.setAmount("12.99")
            add.pickCategory("c-fun")
            add.setDescription("Cinema")
            try await shots(homePage.sheet(isPresented: .constant(true)) {
                AddSheet(request: AddRequest(model: add), data: form.data, userId: SnapshotTests.user, groups: myGroups,
                         wide: true)
            }, name: "ipad-add", lang: lang, dark: dark, settle: 1.8, screen: screen)

            // Budgets, centred at a readable width.
            let budgets = BudgetsModel(data: budgetsFixture.store("own").data, core: .shared, now: { budgetsFixture.now })
            await budgets.load()
            try await shots(sidebar(.budgets) { EmptyView() } detail: {
                NavigationStack { BudgetsView(model: budgets).wideColumn().pageChrome(wide) }
            }, name: "ipad-budgets", lang: lang, dark: dark, screen: screen)

            // The large and extra-large widgets (an iPad Pro 13-inch's: 379 × 379 and 795 × 379).
            let words = WidgetWords(language: lang)
            try await shots(HomeScreenWidgets(figures: try await widgetSnapshot(fixture, lang: lang), words: words,
                                              sizes: [(.large, CGSize(width: 379, height: 379)),
                                                      (.extraLarge, CGSize(width: 795, height: 379))]),
                            name: "ipad-widgets", lang: lang, dark: dark, screen: screen)
        }
    }

    /// The App Store's iPad screens: portrait, light, the sidebar beside each.
    func testIPadStoreSnapshots() async throws {
        try onIPad()
        let screen = SnapshotTests.iPadPortrait
        for lang in ["en", "el"] {
            let screens = try await storeScreens(lang)
            let wide = screens.chrome.wide {}
            let profile = SidebarProfile(name: lang == "el" ? "Άννα Μάρκου" : "Anna Morgan", email: "anna@example.com",
                                         initials: lang == "el" ? "ΑΜ" : "AM")
            let homePage = sidebar(.home, profile: profile) { EmptyView() } detail: {
                NavigationStack { HomeView(model: screens.home, chrome: wide) }
            }
            try await storeShot("ipad-home", lang, homePage, screen: screen)
            try await storeShot("ipad-activity", lang, sidebar(.activity, columns: .doubleColumn, profile: profile) {
                ActivityView(model: screens.activity, chrome: .hidden, picked: screens.firstEntry, open: { _ in },
                             duplicate: { _ in }, split: { _ in })
            } detail: {
                NavigationStack {
                    EntryPane(model: screens.activity, id: screens.firstEntry, edit: { _ in }, duplicate: { _ in },
                              split: { _ in }) {}
                        .pageChrome(wide)
                }
            }, settle: 1.2, screen: screen)
            let split = screens.split()
            try await storeShot("ipad-add-group", lang, homePage.sheet(isPresented: .constant(true)) {
                AddSheet(request: AddRequest(model: split, splitting: screens.saved), data: screens.form.data,
                         userId: SnapshotTests.user, groups: screens.myGroups, wide: true)
            }, settle: 2.5, screen: screen)
            try await storeShot("ipad-group", lang, sidebar(.groups, columns: .doubleColumn, profile: profile) {
                GroupListColumn(model: screens.groups, picked: screens.groupId, pick: { _ in }, open: { _ in })
            } detail: {
                NavigationStack { GroupPageView(model: screens.group).pageChrome(wide) }
            }, settle: 1.2, screen: screen)
            try await storeShot("ipad-budgets", lang, sidebar(.budgets, profile: profile) { EmptyView() } detail: {
                NavigationStack { BudgetsView(model: screens.budgets).wideColumn().pageChrome(wide) }
            }, screen: screen)
            try await storeShot("ipad-savings", lang, sidebar(.savings, profile: profile) { EmptyView() } detail: {
                NavigationStack {
                    SavingsView(model: screens.savings, add: { _, _ in }, open: { _ in }, openRule: { _ in })
                        .wideColumn()
                        .pageChrome(wide)
                }
            }, screen: screen)
        }
    }
}
