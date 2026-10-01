// The signed-in app: four tabs in the floating bar (Home, Activity, Groups,
// More) with Add beside them, each tab its own stack of pages under a large
// title, the bell and your initials in every first page's top-right corner,
// Add (and Edit, and a recurring rule) as a sheet, and the notifications as
// a page pushed on the tab you're on. Live: each page refreshes when its tables change, and coming
// back to the foreground catches up on what realtime missed.
import SwiftUI

/// A page a tab pushes.
enum AppRoute: Hashable {
    case budgets
    case recurring
    case insights
    /// Home's "By category" in full.
    case categories
    case settings
    case language
    case group(String)
    case newGroup
    case notifications
    // Settings' pages.
    case account
    case spending
    case messages
    case appearance
    case aiHelpers
    case security
    case privacy
    case privacyRequest
    case whatsNew
    /// Settings › Categories, a category's page, a new one of a kind.
    case categoryList
    case category(String)
    case newCategory(String)
}

/// What the Add sheet opens on.
struct AddRequest: Identifiable {
    let id = UUID()
    let model: EntryFormModel
    /// A personal expense being split with a group: it moves into the group once saved there.
    var splitting: JSONValue? = nil
}

/// Which page each tab shows, the open sheet, and where a notification leads.
@MainActor
@Observable
final class AppRouter {
    var tab: NativeTab = .home
    var home = NavigationPath()
    var activity = NavigationPath()
    var groups = NavigationPath()
    var more = NavigationPath()
    var add: AddRequest?

    /// Your initials: Settings, under More.
    func openSettings() {
        tab = .more
        more = NavigationPath()
        more.append(AppRoute.settings)
    }

    /// The bell: the notifications, pushed on the tab you're on.
    func openBell() {
        switch tab {
        case .home, .add: home.append(AppRoute.notifications)
        case .activity: activity.append(AppRoute.notifications)
        case .groups: groups.append(AppRoute.notifications)
        case .more: more.append(AppRoute.notifications)
        }
    }

    /// A web path (a notification's, bellMath.notificationPath) as a tab and page.
    func open(path: String) {
        if path == "/" {
            tab = .home
            home = NavigationPath()
        } else if path == "/budgets" {
            tab = .home
            home = NavigationPath()
            home.append(AppRoute.budgets)
        } else if path == "/recurring" {
            tab = .more
            more = NavigationPath()
            more.append(AppRoute.recurring)
        } else if path == "/groups" {
            tab = .groups
            groups = NavigationPath()
        } else if path.hasPrefix("/groups/") {
            tab = .groups
            groups = NavigationPath()
            groups.append(AppRoute.group(String(path.dropFirst("/groups/".count))))
        }
    }
}

/// What every tab's first page shows in its top-right corner.
struct PageChrome {
    let initials: String
    /// The bell's badge words (bellMath.badgeText), nil with nothing unread.
    let badge: String?
    let onBell: () -> Void
    let onProfile: () -> Void
}

extension View {
    func pageChrome(_ chrome: PageChrome) -> some View {
        toolbar {
            NativeAccountItems(initials: chrome.initials, badge: chrome.badge, onBell: chrome.onBell,
                               onProfile: chrome.onProfile)
        }
    }
}

/// The screens' models, made once per signed-in session.
@MainActor
final class AppModels {
    let shell: ShellModel
    let home: HomeViewModel
    let ledger: LedgerModel
    let budgets: BudgetsModel
    let recurring: RecurringModel
    let insights: InsightsModel
    let groups: GroupsModel
    let myGroups: MyGroupsModel
    // Settings and its pages.
    let account: AccountModel
    let preferences: PreferencesModel
    let security: SecurityModel
    let privacy: PrivacyModel
    let categories: CategoriesModel

    init(data: DataLayer, userId: String, security accountSecurity: AccountSecurity,
         signOut: @escaping @MainActor () async -> Void) {
        shell = ShellModel(data: data)
        home = HomeViewModel(data: data)
        ledger = LedgerModel(data: data)
        budgets = BudgetsModel(data: data)
        recurring = RecurringModel(data: data)
        insights = InsightsModel(data: data)
        groups = GroupsModel(data: data, userId: userId)
        myGroups = MyGroupsModel(data: data, userId: userId)
        account = AccountModel(data: data)
        preferences = PreferencesModel(data: data)
        security = SecurityModel(data: data, security: accountSecurity, signOut: signOut)
        privacy = PrivacyModel(data: data)
        categories = CategoriesModel(data: data)
    }
}

@MainActor
struct AppFrame: View {
    let container: AppContainer
    let user: AuthUser
    let lock: AppLock
    @Environment(AppLanguage.self) private var language
    @Environment(\.scenePhase) private var scenePhase
    @State private var router = AppRouter()
    @State private var models: AppModels?

    /// The signed-in user's id as the server writes it.
    private var userId: String { user.id.uuidString.lowercased() }

    var body: some View {
        Group {
            if let models {
                NativeTabs(tab: $router.tab, onAdd: { add(models) }) { tab in
                    page(tab, models)
                }
                .sheet(item: $router.add) { request in
                    AddSheet(request: request, data: container.data, userId: userId, groups: models.myGroups)
                        .environment(language)
                }
                .task(id: user.id) { await models.shell.load() }
                .liveRefresh(container.live, tables: ["notifications", "profiles"]) { await models.shell.load() }
            } else {
                NativeLoading()
            }
        }
        .tint(NativeStyle.tint)
        .onAppear {
            if models == nil {
                let session = container.session
                models = AppModels(data: container.data, userId: userId, security: container.security,
                                   signOut: { await session.signOut() })
            }
        }
        // The account's language: the profile's wins (ProfileLanguage), on
        // sign-in and whenever the profile changes (another device).
        .task(id: user.id) { await ProfileLanguage.sync(language, profiles: container.data.profile) }
        .liveRefresh(container.live, tables: ["profiles"]) {
            await ProfileLanguage.sync(language, profiles: container.data.profile)
        }
        .onChange(of: language.current) { _, lang in NativeStyle.installAppearance(lang: lang) }
        // Live updates for this account while the app is open; back in the
        // foreground, everything catches up on what realtime missed.
        .task(id: user.id) { await container.feed.start(userId: user.id) }
        .onChange(of: scenePhase) { _, phase in
            switch phase {
            case .active:
                container.live.catchUp()
                lock.cameBack()
            case .background:
                lock.wentAway()
            default:
                break
            }
        }
    }

    private func add(_ models: AppModels) {
        router.add = AddRequest(model: EntryFormModel(mode: .add, data: container.data))
    }

    private func chrome(_ models: AppModels) -> PageChrome {
        PageChrome(initials: models.shell.initials, badge: models.shell.badge,
                   onBell: {
                       router.openBell()
                       Task { await models.shell.opened() }
                   },
                   onProfile: { router.openSettings() })
    }

    // MARK: The tabs

    @ViewBuilder private func page(_ tab: NativeTab, _ models: AppModels) -> some View {
        switch tab {
        case .home, .add:
            NavigationStack(path: $router.home) {
                HomeView(model: models.home, chrome: chrome(models))
                    .liveRefresh(container.live, tables: ["transactions", "categories", "profiles", "budgets", "recurring_rules"]) {
                        await models.home.refresh()
                    }
                    .navigationDestination(for: AppRoute.self) { destination($0, models) }
            }
        case .activity:
            NavigationStack(path: $router.activity) {
                ActivityView(model: models.ledger, chrome: chrome(models),
                             open: { row in router.add = AddRequest(model: EntryFormModel(mode: .edit, transaction: row,
                                                                                         data: container.data)) },
                             duplicate: { row in router.add = AddRequest(model: EntryFormModel(mode: .add, transaction: row,
                                                                                              data: container.data)) },
                             split: { row in router.add = AddRequest(model: EntryFormModel(mode: .add, transaction: row,
                                                                                          data: container.data),
                                                                    splitting: row) })
                    .liveRefresh(container.live, tables: ["transactions", "categories", "profiles"]) {
                        await models.ledger.reloadRows()
                    }
                    .navigationDestination(for: AppRoute.self) { destination($0, models) }
            }
        case .groups:
            NavigationStack(path: $router.groups) {
                GroupsView(model: models.groups, chrome: chrome(models))
                    .liveRefresh(container.live, tables: LiveHub.shared.union(["profiles"])) { await models.groups.load() }
                    .navigationDestination(for: AppRoute.self) { destination($0, models) }
            }
        case .more:
            NavigationStack(path: $router.more) {
                MoreView(name: models.shell.name, email: user.email ?? "", initials: models.shell.initials,
                         chrome: chrome(models))
                    .navigationDestination(for: AppRoute.self) { destination($0, models) }
            }
        }
    }

    @ViewBuilder private func destination(_ route: AppRoute, _ models: AppModels) -> some View {
        switch route {
        case .budgets:
            BudgetsView(model: models.budgets)
                .liveRefresh(container.live, tables: ["budgets", "transactions", "categories", "profiles"]) {
                    await models.budgets.load()
                }
        case .recurring:
            RecurringView(model: models.recurring,
                          open: { rule in router.add = AddRequest(model: EntryFormModel(mode: .rule, rule: rule,
                                                                                       data: container.data)) },
                          add: { kind in router.add = AddRequest(model: EntryFormModel(mode: .add, kind: kind, repeats: true,
                                                                                      data: container.data)) })
                .liveRefresh(container.live, tables: ["recurring_rules", "categories", "profiles"]) {
                    await models.recurring.load()
                }
        case .insights:
            InsightsView(model: models.insights)
                .liveRefresh(container.live, tables: ["transactions", "categories", "profiles"]) {
                    await models.insights.load()
                }
        case .categories:
            HomeCategoriesPage(model: models.home)
        case .settings:
            SettingsView(config: container.config, session: container.session, lock: lock, account: models.account,
                         email: user.email ?? "")
                .liveRefresh(container.live, tables: ["profiles"]) { await models.account.refreshProfile() }
        case .language:
            LanguageView(profiles: container.data.profile)
        case .account:
            AccountView(model: models.account, email: user.email ?? "")
        case .spending:
            SpendingView(model: models.preferences)
                .liveRefresh(container.live, tables: ["profiles", "categories"]) { await models.preferences.load() }
        case .messages:
            MessagesView(model: models.preferences)
                .liveRefresh(container.live, tables: ["profiles"]) { await models.preferences.load() }
        case .appearance:
            AppearanceView()
        case .aiHelpers:
            AiHelpersView(model: models.preferences)
                .liveRefresh(container.live, tables: ["profiles"]) { await models.preferences.load() }
        case .security:
            SecurityView(model: models.security)
        case .privacy:
            PrivacyView(model: models.privacy, preferences: models.preferences) {
                router.tab = .activity
            }
        case .privacyRequest:
            PrivacyRequestView(model: models.privacy)
        case .whatsNew:
            WhatsNewView()
        case .categoryList:
            CategoriesView(model: models.categories)
                .liveRefresh(container.live, tables: ["categories"]) { await models.categories.load() }
        case .category(let id):
            CategoryEditHost(categories: models.categories, id: id, kind: "expense")
        case .newCategory(let kind):
            CategoryEditHost(categories: models.categories, id: nil, kind: kind)
        case .group(let id):
            GroupPageHost(groupId: id, userId: userId, data: container.data, live: container.live,
                          site: container.config.siteURL) {
                router.groups = NavigationPath()
                Task { await models.groups.load() }
            }
        case .newGroup:
            NewGroupHost(data: container.data, site: container.config.siteURL) { id in
                router.groups = NavigationPath()
                router.groups.append(AppRoute.group(id))
                Task { await models.groups.load() }
            }
        case .notifications:
            NotificationsView(model: models.shell) { item in
                if let path = item.path { router.open(path: path) }
            }
        }
    }
}
