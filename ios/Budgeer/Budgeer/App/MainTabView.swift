// The signed-in app: five tabs after the web's bottom navigation (Home,
// Transactions, Groups, Budgets, More). More holds Recurring, Insights, the
// account, the language and the build. The entry form opens over any tab
// (Add from "+", with "Who's it for?" for someone in a group; Edit from a row).
import SwiftUI

@MainActor
struct MainTabView: View {
    let container: AppContainer
    let user: AuthUser
    @Environment(AppLanguage.self) private var language
    @Environment(\.scenePhase) private var scenePhase
    @State private var home: HomeViewModel?
    @State private var ledger: LedgerModel?
    @State private var budgets: BudgetsModel?
    @State private var recurring: RecurringModel?
    @State private var insights: InsightsModel?
    @State private var groups: GroupsModel?
    /// The groups Add's "Who's it for?" offers.
    @State private var myGroups: MyGroupsModel?
    /// The entry form, when open.
    @State private var entry: EntrySheet?

    /// The signed-in user's id as the server writes it.
    private var userId: String { user.id.uuidString.lowercased() }

    /// More's Money pages (the web's order: Insights, then Recurring).
    private var morePages: [MorePage] {
        var pages: [MorePage] = []
        if let insights {
            pages.append(MorePage(id: "insights", icon: "chart.bar.xaxis", view: AnyView(
                InsightsView(model: insights)
                    .liveRefresh(container.live, tables: ["transactions", "categories", "profiles"]) {
                        await insights.load()
                    })))
        }
        if let recurring {
            pages.append(MorePage(id: "recurring", icon: "repeat", view: AnyView(
                RecurringView(model: recurring,
                              onOpen: { rule in entry = EntrySheet.rule(rule, data: container.data) },
                              onAdd: { kind in entry = EntrySheet.add(kind: kind, repeats: true, data: container.data) })
                    .liveRefresh(container.live, tables: ["recurring_rules", "categories", "profiles"]) {
                        await recurring.load()
                    })))
        }
        return pages
    }

    var body: some View {
        TabView {
            Group {
                if let home {
                    HomeView(model: home, onAdd: { entry = EntrySheet.add(data: container.data) })
                        .liveRefresh(container.live, tables: ["transactions", "categories", "profiles"]) {
                            await home.refresh()
                        }
                } else {
                    LoadingView()
                }
            }
            .tabItem { Label(language.t("shell:nav.home"), systemImage: "house") }
            Group {
                if let ledger {
                    TransactionsView(model: ledger,
                                     onAdd: { kind in entry = EntrySheet.add(kind: kind, data: container.data) },
                                     onOpen: { row in entry = EntrySheet.edit(row, data: container.data) })
                        .liveRefresh(container.live, tables: ["transactions", "categories", "profiles"]) {
                            await ledger.reloadRows()
                        }
                } else {
                    LoadingView()
                }
            }
                .tabItem { Label(language.t("shell:nav.transactions"), systemImage: "list.bullet.rectangle") }
            Group {
                if let groups {
                    GroupsView(model: groups, data: container.data, live: container.live, site: container.config.siteURL)
                        .liveRefresh(container.live, tables: LiveHub.shared.union(["profiles"])) {
                            await groups.load()
                        }
                } else {
                    LoadingView()
                }
            }
                .tabItem { Label(language.t("shell:nav.groups"), systemImage: "person.2") }
            Group {
                if let budgets {
                    BudgetsView(model: budgets)
                        .liveRefresh(container.live, tables: ["budgets", "transactions", "categories", "profiles"]) {
                            await budgets.load()
                        }
                } else {
                    LoadingView()
                }
            }
                .tabItem { Label(language.t("shell:nav.budgets"), systemImage: "chart.pie") }
            MoreView(config: container.config, session: container.session, user: user,
                     profiles: container.data.profile, pages: morePages)
                .tabItem { Label(language.t("shell:nav.more"), systemImage: "ellipsis.circle") }
        }
        .sheet(item: $entry) { sheet in
            AddEntryHost(sheet: sheet, data: container.data, userId: userId, groups: myGroups) { entry = nil }
                .environment(language)
        }
        .onAppear {
            if home == nil { home = HomeViewModel(data: container.data) }
            if ledger == nil { ledger = LedgerModel(data: container.data) }
            if budgets == nil { budgets = BudgetsModel(data: container.data) }
            if recurring == nil { recurring = RecurringModel(data: container.data) }
            if insights == nil { insights = InsightsModel(data: container.data) }
            if groups == nil { groups = GroupsModel(data: container.data, userId: userId) }
            if myGroups == nil { myGroups = MyGroupsModel(data: container.data, userId: userId) }
        }
        // The account's language: the profile's wins (ProfileLanguage), on
        // sign-in and whenever the profile changes (another device).
        .task(id: user.id) { await ProfileLanguage.sync(language, profiles: container.data.profile) }
        .liveRefresh(container.live, tables: ["profiles"]) {
            await ProfileLanguage.sync(language, profiles: container.data.profile)
        }
        // Live updates for this account while the app is open; back in the
        // foreground, everything catches up on what realtime missed.
        .task(id: user.id) { await container.feed.start(userId: user.id) }
        .onChange(of: scenePhase) { _, phase in
            if phase == .active { container.live.catchUp() }
        }
    }
}
