// The signed-in app: five tabs after the web's bottom navigation (Home,
// Transactions, Groups, Budgets, More). Groups says "coming soon" until its
// phase; More holds Recurring, Insights, the account, the language and the
// build. The entry form opens over any tab (Add from "+", Edit from a row).
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
    /// The entry form, when open.
    @State private var entry: EntrySheet?

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
            ComingSoonView(title: language.t("shell:nav.groups"))
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
            EntryFormView(model: sheet.model) { _ in entry = nil }
                .environment(language)
        }
        .onAppear {
            if home == nil { home = HomeViewModel(data: container.data) }
            if ledger == nil { ledger = LedgerModel(data: container.data) }
            if budgets == nil { budgets = BudgetsModel(data: container.data) }
            if recurring == nil { recurring = RecurringModel(data: container.data) }
            if insights == nil { insights = InsightsModel(data: container.data) }
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

/// A tab whose feature is not in the app yet: the web has it.
struct ComingSoonView: View {
    let title: String
    @Environment(AppLanguage.self) private var language

    var body: some View {
        NavigationStack {
            VStack(spacing: Theme.Space.s4) {
                Spacer()
                IconTile(systemName: "hammer", size: 56, tone: Theme.Colors.textMuted)
                Text(language.t("ios:soon.title"))
                    .font(Theme.Fonts.heading(20, weight: .bold, lang: language.current))
                    .foregroundStyle(Theme.Colors.textPrimary)
                Text(language.t("ios:soon.body"))
                    .font(Theme.Fonts.body(15, lang: language.current))
                    .foregroundStyle(Theme.Colors.textMuted)
                    .multilineTextAlignment(.center)
                Spacer()
            }
            .padding(Theme.Space.s6)
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .background(Theme.Colors.canvas.ignoresSafeArea())
            .navigationTitle(title)
            .navigationBarTitleDisplayMode(.inline)
        }
    }
}
