// The signed-in app inside the web's phone frame (AppShell): the top bar,
// the page of the lit tab, the bottom bar (Home, Transactions, Groups,
// Budgets, More) and, on Home and Budgets, the floating Add. Each tab keeps
// its own stack of pages; the entry form (Add, Edit, a recurring rule) and
// More's pages (Insights, Recurring) are pages pushed onto it, as the web
// navigates to them, never sheets. The bell opens its list in place.
import SwiftUI

/// A page a tab pushes (besides the Groups tab's own).
enum ShellRoute: Hashable {
    case entry(EntrySheet)
    case insights
    case recurring
    case settings
    case language
    case appearance
}

/// Which page each tab shows; tapping a lit tab goes back to its first page.
@MainActor
@Observable
final class ShellRouter {
    var tab: AppTab = .home
    var home = NavigationPath()
    var transactions = NavigationPath()
    var budgets = NavigationPath()
    var more = NavigationPath()
    var groups: [GroupsRoute] = []

    func select(_ next: AppTab) {
        if next == tab { popToRoot(next) }
        tab = next
    }

    func popToRoot(_ which: AppTab) {
        switch which {
        case .home: home = NavigationPath()
        case .transactions: transactions = NavigationPath()
        case .budgets: budgets = NavigationPath()
        case .more: more = NavigationPath()
        case .groups: groups = []
        }
    }

    /// Push onto the lit tab's stack.
    func push(_ route: ShellRoute) {
        switch tab {
        case .home: home.append(route)
        case .transactions: transactions.append(route)
        case .budgets: budgets.append(route)
        case .more: more.append(route)
        case .groups: break
        }
    }

    /// Back from the top page of the lit tab.
    func pop() {
        switch tab {
        case .home: if !home.isEmpty { home.removeLast() }
        case .transactions: if !transactions.isEmpty { transactions.removeLast() }
        case .budgets: if !budgets.isEmpty { budgets.removeLast() }
        case .more: if !more.isEmpty { more.removeLast() }
        case .groups: if !groups.isEmpty { groups.removeLast() }
        }
    }

    /// Whether the lit tab shows its first page.
    var atRoot: Bool {
        switch tab {
        case .home: return home.isEmpty
        case .transactions: return transactions.isEmpty
        case .budgets: return budgets.isEmpty
        case .more: return more.isEmpty
        case .groups: return groups.isEmpty
        }
    }

    /// The picture in the top bar: Settings, under More (as the web's /settings).
    func openSettings() {
        tab = .more
        more = NavigationPath()
        more.append(ShellRoute.settings)
    }

    /// A web path (a notification's, bellMath.notificationPath) as a tab and page.
    func open(path: String) {
        if path == "/" { tab = .home; home = NavigationPath() }
        else if path == "/budgets" { tab = .budgets; budgets = NavigationPath() }
        else if path == "/recurring" { tab = .more; more = NavigationPath(); more.append(ShellRoute.recurring) }
        else if path == "/groups" { tab = .groups; groups = [] }
        else if path.hasPrefix("/groups/") { tab = .groups; groups = [.group(String(path.dropFirst("/groups/".count)))] }
    }
}

@MainActor
struct MainTabView: View {
    let container: AppContainer
    let user: AuthUser
    @Environment(AppLanguage.self) private var language
    @Environment(\.scenePhase) private var scenePhase
    @State private var router = ShellRouter()
    @State private var shell: ShellModel?
    @State private var bellOpen = false
    @State private var home: HomeViewModel?
    @State private var ledger: LedgerModel?
    @State private var budgets: BudgetsModel?
    @State private var recurring: RecurringModel?
    @State private var insights: InsightsModel?
    @State private var groups: GroupsModel?
    /// The groups Add's "Who's it for?" offers.
    @State private var myGroups: MyGroupsModel?

    /// The signed-in user's id as the server writes it.
    private var userId: String { user.id.uuidString.lowercased() }

    var body: some View {
        ShellChrome(tab: router.tab, badge: shell?.badge, unreadCount: shell?.unreadCount ?? 0,
                    initials: shell?.initials ?? "",
                    fab: router.atRoot && (shell?.showsAdd(router.tab.path) ?? false),
                    onBell: { bellOpen = true; Task { await shell?.opened() } },
                    onAvatar: { router.openSettings() },
                    onTab: { router.select($0) },
                    onAdd: { router.push(.entry(EntrySheet.add(data: container.data))) }) {
            ZStack {
                ForEach(AppTab.allCases, id: \.self) { tab in
                    page(tab)
                        .opacity(router.tab == tab ? 1 : 0)
                        .allowsHitTesting(router.tab == tab)
                        .accessibilityHidden(router.tab != tab)
                }
            }
        }
        // The bell's list, in place under the bar (NotificationBell's popover).
        .popover(isPresented: $bellOpen, attachmentAnchor: .point(UnitPoint(x: 0.72, y: 0.04)), arrowEdge: .top) {
            BellList(model: shell) { item in
                bellOpen = false
                if let path = item.path { router.open(path: path) }
            }
            .environment(language)
            .presentationCompactAdaptation(.popover)
        }
        .onAppear {
            if shell == nil { shell = ShellModel(data: container.data) }
            if home == nil { home = HomeViewModel(data: container.data) }
            if ledger == nil { ledger = LedgerModel(data: container.data) }
            if budgets == nil { budgets = BudgetsModel(data: container.data) }
            if recurring == nil { recurring = RecurringModel(data: container.data) }
            if insights == nil { insights = InsightsModel(data: container.data) }
            if groups == nil { groups = GroupsModel(data: container.data, userId: userId) }
            if myGroups == nil { myGroups = MyGroupsModel(data: container.data, userId: userId) }
        }
        .task(id: user.id) { await shell?.load() }
        .liveRefresh(container.live, tables: ["notifications", "profiles"]) { await shell?.load() }
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

    // MARK: The tabs

    @ViewBuilder private func page(_ tab: AppTab) -> some View {
        @Bindable var nav = router
        switch tab {
        case .home:
            NavigationStack(path: $nav.home) {
                Group {
                    if let home {
                        HomeView(model: home,
                                 onOpen: { row in router.push(.entry(EntrySheet.edit(row, data: container.data))) },
                                 onAdd: { router.push(.entry(EntrySheet.add(data: container.data))) },
                                 onManageBudgets: { router.select(.budgets) },
                                 onManageRecurring: { router.open(path: "/recurring") })
                            .liveRefresh(container.live, tables: ["transactions", "categories", "profiles", "budgets"]) {
                                await home.refresh()
                            }
                    } else {
                        LoadingView()
                    }
                }
                .navigationDestination(for: ShellRoute.self) { destination($0) }
            }
        case .transactions:
            NavigationStack(path: $nav.transactions) {
                Group {
                    if let ledger {
                        TransactionsView(model: ledger,
                                         onAdd: { kind in router.push(.entry(EntrySheet.add(kind: kind, data: container.data))) },
                                         onOpen: { row in router.push(.entry(EntrySheet.edit(row, data: container.data))) })
                            .liveRefresh(container.live, tables: ["transactions", "categories", "profiles"]) {
                                await ledger.reloadRows()
                            }
                    } else {
                        LoadingView()
                    }
                }
                .navigationDestination(for: ShellRoute.self) { destination($0) }
            }
        case .groups:
            if let groups {
                GroupsView(model: groups, data: container.data, live: container.live, site: container.config.siteURL,
                           path: $nav.groups)
                    .liveRefresh(container.live, tables: LiveHub.shared.union(["profiles"])) {
                        await groups.load()
                    }
            } else {
                LoadingView()
            }
        case .budgets:
            NavigationStack(path: $nav.budgets) {
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
                .navigationDestination(for: ShellRoute.self) { destination($0) }
            }
        case .more:
            NavigationStack(path: $nav.more) {
                MoreView(config: container.config, session: container.session, user: user,
                         profiles: container.data.profile) { route in router.push(route) }
                    .navigationDestination(for: ShellRoute.self) { destination($0) }
            }
        }
    }

    @ViewBuilder private func destination(_ route: ShellRoute) -> some View {
        switch route {
        case .entry(let sheet):
            AddEntryHost(sheet: sheet, data: container.data, userId: userId, groups: myGroups) { router.pop() }
        case .insights:
            if let insights {
                InsightsView(model: insights, back: { router.pop() })
                    .liveRefresh(container.live, tables: ["transactions", "categories", "profiles"]) {
                        await insights.load()
                    }
            }
        case .settings:
            SettingsView(config: container.config, session: container.session, user: user,
                         name: shell?.name ?? "", initials: shell?.initials ?? "",
                         back: { router.pop() }) { router.push($0) }
        case .language:
            LanguageSettingsView(profiles: container.data.profile) { router.pop() }
        case .appearance:
            AppearanceSettingsView { router.pop() }
        case .recurring:
            if let recurring {
                RecurringView(model: recurring, back: { router.pop() },
                              onOpen: { rule in router.push(.entry(EntrySheet.rule(rule, data: container.data))) },
                              onAdd: { kind in router.push(.entry(EntrySheet.add(kind: kind, repeats: true, data: container.data))) })
                    .liveRefresh(container.live, tables: ["recurring_rules", "categories", "profiles"]) {
                        await recurring.load()
                    }
            }
        }
    }
}

/// The bell's list (NotificationBell's popover): "Notifications", then each
/// one with its icon, its title (bold while unread) and body; or the empty
/// line. A tap goes where it leads.
@MainActor
struct BellList: View {
    let model: ShellModel?
    let open: (BellItem) -> Void
    @Environment(AppLanguage.self) private var language

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text(language.t("notifications:bell.title"))
                .kitHeading(16)
                .padding(.horizontal, Theme.Space.s4)
                .padding(.vertical, Theme.Space.s3)
            Rectangle().fill(Theme.Colors.border).frame(height: 1)
            if let model, let failed = model.failed, model.items.isEmpty {
                LoadErrorBlock(message: failed) { await model.loadFeed() }.padding(Theme.Space.s4)
            } else if (model?.items ?? []).isEmpty {
                Text(language.t("notifications:bell.empty"))
                    .kitText(14, color: Theme.Colors.textMuted)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, Theme.Space.s6)
            } else {
                ScrollView {
                    VStack(spacing: 0) {
                        ForEach(model?.items ?? []) { item in
                            Button { open(item) } label: {
                                HStack(alignment: .top, spacing: Theme.Space.s3) {
                                    IconTile(icon: BellList.icon(item.type), size: 32)
                                    VStack(alignment: .leading, spacing: 0) {
                                        Text(item.title).kitText(14, item.read ? .regular : .bold)
                                        if let body = item.body { Text(body).kitText(12, color: Theme.Colors.textMuted) }
                                    }
                                    .frame(maxWidth: .infinity, alignment: .leading)
                                }
                                .padding(.horizontal, Theme.Space.s4)
                                .padding(.vertical, Theme.Space.s3)
                                .contentShape(Rectangle())
                            }
                            .buttonStyle(.plain)
                            if item.id != model?.items.last?.id { Rectangle().fill(Theme.Colors.border).frame(height: 1) }
                        }
                    }
                }
                .frame(maxHeight: 380)
            }
        }
        .frame(width: 320)
        .background(Theme.Colors.surface)
    }

    /// The web's icon per notification type (NotificationBell ICON).
    static func icon(_ type: String) -> Lucide {
        switch type {
        case "invite": return .userPlus
        case "expense": return .receiptText
        case "settlement": return .handCoins
        case "comment": return .messageSquare
        case "reminder": return .calendarClock
        case "member_joined": return .userCheck
        case "member_left": return .userMinus
        case "budget": return .piggyBank
        case "digest": return .barChart3
        case "nudge": return .bellRing
        default: return .bell
        }
    }
}
