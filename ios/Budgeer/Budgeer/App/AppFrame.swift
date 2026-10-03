// The signed-in app: four tabs in the floating bar (Home, Activity, Groups,
// More) with Add beside them (the one add button: a page lends it its own
// add, AddSlot), each tab its own stack of pages under a large
// title, the bell and your initials in every first page's top-right corner,
// Add (and Edit, and a recurring rule) as a sheet, and the notifications as
// a page pushed on the tab you're on. In a regular-width window (an iPad,
// a wide Split View or Stage Manager window) the same pages sit beside a
// sidebar instead (SidebarFrame: the website's desktop sidebar), Activity
// and Groups as a list beside the picked entry or group, with the bell and
// Add in the bar; changing the window's width keeps your place (AppRouter).
// Live: each page refreshes when its tables change, and coming back to the
// foreground catches up on what realtime missed.
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
    /// Join a group from an invite link: its token (a budgeer://join link), or nil to paste one.
    case join(String?)
    case notifications
    // Settings' pages.
    case account
    case spending
    case messages
    case appearance
    case aiHelpers
    /// Settings › Face ID lock: the switch and the app PIN.
    case faceLock
    case security
    case privacy
    case privacyRequest
    case whatsNew
    /// Settings › Categories, a category's page, a new one of a kind.
    case categoryList
    case category(String)
    case newCategory(String)
    /// Savings, a goal's page, a new goal.
    case savings
    case goal(String)
    case newGoal
    /// Meal vouchers, and Settings › Meal vouchers.
    case vouchers
    case voucherSetup
    /// Plan mode, Your salary, a net-worth account's page and a new one.
    case plan
    case salary
    case netWorthAccount(String)
    case newNetWorthAccount
    /// Import a bank statement; Settings › Import rules and a rule's page.
    case importStatement
    case importRules
    case importRule(String)
    /// Settings › Your data, its Export backup and Restore from backup.
    case yourData
    case exportBackup
    case restoreBackup
    /// A category's page (an id, or "none" for the uncategorised), for a period value (nil: this month).
    case categoryPage(String, String?)
    /// Help & FAQ, opened at a question when one is named (the web's #anchor).
    case help(String?)
}

/// What the Add sheet opens on.
struct AddRequest: Identifiable {
    let id = UUID()
    let model: EntryFormModel
    /// A personal expense being split with a group: it moves into the group once saved there.
    var splitting: JSONValue? = nil
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
    let savings: SavingsModel
    let vouchers: VouchersModel
    let plan: PlanModel
    let salary: SalaryModel
    let importRules: ImportRulesModel
    /// The account's language, lined up with this device's (Settings › Language saves through it).
    let profileLanguage: ProfileLanguage
    /// The wizard, What's new and the tour.
    let welcome: WelcomeModel
    let tour: TourModel
    /// The widgets' snapshot of this month.
    let widget: WidgetSync

    /// The system's passkey sheet (Settings › Security, the wizard, the ask after signing in).
    let passkeySheet: PasskeyAuthorizer

    init(data: DataLayer, userId: String, language: AppLanguage, security accountSecurity: AccountSecurity,
         signOut: @escaping @MainActor () async -> Void) {
        passkeySheet = PasskeyAuthorizer()
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
        security = SecurityModel(data: data, security: accountSecurity, signOut: signOut, sheet: passkeySheet)
        privacy = PrivacyModel(data: data)
        categories = CategoriesModel(data: data)
        savings = SavingsModel(data: data)
        vouchers = VouchersModel(data: data)
        plan = PlanModel(data: data)
        salary = SalaryModel(data: data)
        importRules = ImportRulesModel(data: data)
        profileLanguage = ProfileLanguage(language: language, profiles: data.profile)
        welcome = WelcomeModel(data: data)
        tour = TourModel(data: data)
        let widget = WidgetSync(data: data)
        self.widget = widget
        home.onThisMonth = { widget.write($0) }
    }
}

@MainActor
struct AppFrame: View {
    let container: AppContainer
    let user: AuthUser
    let lock: AppLock
    @Environment(AppLanguage.self) private var language
    @Environment(\.scenePhase) private var scenePhase
    @Environment(\.horizontalSizeClass) private var sizeClass
    @State private var router = AppRouter()
    @State private var models: AppModels?

    /// The signed-in user's id as the server writes it.
    private var userId: String { user.id.uuidString.lowercased() }

    var body: some View {
        Group {
            if let models {
                layout(models)
                    .sheet(item: $router.add) { request in
                        AddSheet(request: request, data: container.data, userId: userId, groups: models.myGroups,
                                 wide: router.layout == .sidebar) {
                            // The first entry saved is the moment to ask about notifications (once).
                            Task { await container.push.askAfterFirstAction() }
                        }
                        .environment(language)
                    }
                    .welcomeLayer(welcome: models.welcome, tour: models.tour, router: router)
                    .task(id: user.id) { await models.shell.load() }
                    .liveRefresh(container.live, tables: ["notifications", "profiles", "meal_vouchers"]) {
                        await models.shell.load()
                    }
                    .onChange(of: models.shell.vouchersOn, initial: true) { _, on in router.vouchersOn = on }
                    // ⌘N (AppCommands): what the toolbar's or the tab bar's Add does.
                    .onChange(of: router.addPresses) { _, _ in if router.add == nil { add(models) } }
            } else {
                NativeLoading()
            }
        }
        .tint(NativeStyle.tint)
        // The frame follows the window's width (an iPad's Split View, Stage
        // Manager), keeping the place you were at.
        .onChange(of: sizeClass, initial: true) { _, size in router.adapt(to: .of(regular: size == .regular)) }
        .focusedSceneValue(\.appRouter, router)
        .onAppear {
            if models == nil {
                let session = container.session
                let push = container.push
                let built = AppModels(data: container.data, userId: userId, language: language, security: container.security,
                                      signOut: { await session.signOut() })
                // The wizard's "Enable notifications" is Settings' push switch turned on.
                built.welcome.pushOptIn = { await push.optIn() }
                // Its "Add a passkey", and the ask after signing in, are Settings › Security's Add.
                built.welcome.passkeyKit = PasskeyKit(security: container.security, sheet: built.passkeySheet)
                models = built
            }
        }
        // The account's language: the profile's wins (ProfileLanguage), on
        // sign-in and whenever the profile changes (another device).
        // (Keyed on the models: a task may start before onAppear makes them.)
        .task(id: models != nil) { await models?.profileLanguage.sync() }
        .liveRefresh(container.live, tables: ["profiles"]) { await models?.profileLanguage.sync() }
        // The widgets' snapshot: on sign-in, whenever what it shows changes
        // (this app's saves and deletes too), and in a new language.
        .task(id: models != nil) { await models?.widget.refresh() }
        .liveRefresh(container.live, tables: WidgetSync.tables) { await models?.widget.refresh() }
        .onChange(of: language.current) { _, lang in
            NativeStyle.installAppearance(lang: lang, refresh: true)
            Task { await models?.widget.refresh() }
        }
        // A widget's + (Add as an expense), once the lock is off.
        .onChange(of: router.addKind, initial: true) { _, _ in addFromLink() }
        .onChange(of: lock.covers) { _, _ in addFromLink() }
        // Live updates for this account while the app is open; back in the
        // foreground, everything catches up on what realtime missed.
        .task(id: user.id) { await container.feed.start(userId: user.id) }
        // Push: re-register when iOS already allows it (never asks here).
        .task(id: user.id) { await container.push.refresh() }
        // A tapped notification opens its page, as the bell's rows do.
        .onChange(of: PushInbox.shared.path, initial: true) { _, path in
            guard let path else { return }
            PushInbox.shared.path = nil
            router.open(path: path)
        }
        // A budgeer://join link (RootView keeps it until the frame is up).
        .onChange(of: container.joinInbox.token, initial: true) { _, token in
            guard let token else { return }
            container.joinInbox.token = nil
            router.openJoin(token)
        }
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

    /// The tabs, or the sidebar beside the pages (a regular-width window).
    @ViewBuilder private func layout(_ models: AppModels) -> some View {
        if router.layout == .sidebar {
            SidebarFrame(section: Binding(get: { router.section }, set: { router.go($0) }), items: router.sections,
                         groups: models.groups.figures?.cards.count,
                         profile: SidebarProfile(name: models.shell.name, email: user.email ?? "",
                                                 initials: models.shell.initials, avatar: models.shell.avatar)) {
                wideList(models)
            } detail: {
                wideDetail(models)
            }
            .environment(\.addSlot, router.wideSlot)
            // The Groups row's count, and Groups' list.
            .task(id: user.id) { await models.groups.load() }
            .liveRefresh(container.live, tables: LiveHub.shared.union(["profiles"])) { await models.groups.load() }
        } else {
            NativeTabs(tab: $router.tab, onAdd: { add(models) }) { tab in
                page(tab, models)
            }
        }
    }

    /// An import's "View transactions": Activity over the imported entries' days
    /// (the web's /transactions?type=all&from&to).
    private func viewImported(from: String?, to: String?, _ models: AppModels) {
        router.showActivity()
        Task {
            await models.ledger.clearAll()
            await models.ledger.setType("all")
            if let from { await models.ledger.setFilter("from", from) }
            if let to { await models.ledger.setFilter("to", to) }
        }
    }

    /// Add asked for by a link (a widget's +: the web's /transactions/new),
    /// shown once the Face ID lock is off.
    private func addFromLink() {
        guard let kind = router.addKind, !lock.covers else { return }
        router.addKind = nil
        router.add = AddRequest(model: EntryFormModel(mode: .add, kind: kind, data: container.data))
    }

    /// Nothing logged yet: Add your first expense (the web's /transactions/new).
    private func addFirstEntry() {
        router.add = AddRequest(model: EntryFormModel(mode: .add, data: container.data))
    }

    /// The floating Add (or the bar's, beside the sidebar): what the page on
    /// top lends it (AddSlot), else a new entry.
    private func add(_ models: AppModels) {
        switch router.slot?.action {
        case .some(.run(let action)):
            action()
        case .some(.push(let route)):
            router.push(route())
        case .none:
            router.add = AddRequest(model: EntryFormModel(mode: .add, data: container.data))
        }
    }

    /// Edit, Duplicate and Split: a saved entry in the Add sheet.
    private func edit(_ row: JSONValue) {
        router.add = AddRequest(model: EntryFormModel(mode: .edit, transaction: row, data: container.data))
    }

    private func duplicate(_ row: JSONValue) {
        router.add = AddRequest(model: EntryFormModel(mode: .add, transaction: row, data: container.data))
    }

    private func split(_ row: JSONValue) {
        router.add = AddRequest(model: EntryFormModel(mode: .add, transaction: row, data: container.data), splitting: row)
    }

    private func chrome(_ models: AppModels) -> PageChrome {
        PageChrome(initials: models.shell.initials, avatar: models.shell.avatar, badge: models.shell.badge,
                   onBell: {
                       router.openBell()
                       Task { await models.shell.opened() }
                   },
                   onProfile: { router.openSettings() })
    }

    /// Activity's ⋯ menu (the web's): Import a file (a bank statement).
    private var activityMenu: some ToolbarContent {
        ToolbarItem(placement: .topBarLeading) {
            Menu {
                Button {
                    router.push(.importStatement)
                } label: {
                    Label(language.t("transactions:ledger.importFile"), systemImage: "tablecells")
                }
            } label: {
                Image(systemName: "ellipsis.circle")
            }
            .accessibilityLabel(language.t("transactions:ledger.moreActions"))
            .accessibilityIdentifier("activity.more")
        }
    }

    // MARK: The tabs

    @ViewBuilder private func page(_ tab: NativeTab, _ models: AppModels) -> some View {
        switch tab {
        case .home, .add:
            NavigationStack(path: $router.home) {
                HomeView(model: models.home, chrome: chrome(models)) { addFirstEntry() }
                    .liveRefresh(container.live, tables: HomeView.tables) { await models.home.refresh() }
                    .navigationDestination(for: AppRoute.self) { destination($0, models) }
            }
            .environment(\.addSlot, router.slots[.home])
        case .activity:
            NavigationStack(path: $router.activity) {
                ActivityView(model: models.ledger, chrome: chrome(models), open: edit, duplicate: duplicate, split: split,
                             addFirst: { addFirstEntry() }, searchPresses: router.searchPresses)
                    .toolbar { activityMenu }
                    .liveRefresh(container.live, tables: ["transactions", "categories", "profiles"]) {
                        await models.ledger.reloadRows()
                    }
                    .navigationDestination(for: AppRoute.self) { destination($0, models) }
            }
            .environment(\.addSlot, router.slots[.activity])
        case .groups:
            NavigationStack(path: $router.groups) {
                GroupsView(model: models.groups, chrome: chrome(models))
                    .liveRefresh(container.live, tables: LiveHub.shared.union(["profiles"])) { await models.groups.load() }
                    .navigationDestination(for: AppRoute.self) { destination($0, models) }
            }
            .environment(\.addSlot, router.slots[.groups])
        case .more:
            NavigationStack(path: $router.more) {
                MoreView(vouchers: models.shell.vouchersOn, chrome: chrome(models))
                    .navigationDestination(for: AppRoute.self) { destination($0, models) }
            }
            .environment(\.addSlot, router.slots[.more])
        }
    }

    // MARK: Beside the sidebar

    /// Activity's and Groups' list column.
    @ViewBuilder private func wideList(_ models: AppModels) -> some View {
        switch router.section {
        case .activity:
            ActivityView(model: models.ledger, chrome: .hidden, picked: router.pickedEntry,
                         open: { row in router.pick(entry: row["id"]?.stringValue) },
                         duplicate: duplicate, split: split, addFirst: { addFirstEntry() },
                         searchPresses: router.searchPresses)
                .toolbar { activityMenu }
                .liveRefresh(container.live, tables: ["transactions", "categories", "profiles"]) {
                    await models.ledger.reloadRows()
                }
        case .groups:
            GroupListColumn(model: models.groups, picked: router.pickedGroup,
                            pick: { router.pick(group: $0) }, open: { router.push($0) })
        default:
            EmptyView()
        }
    }

    /// The section's page (or the entry or group picked), with the pages pushed over it.
    private func wideDetail(_ models: AppModels) -> some View {
        NavigationStack(path: $router.detail) {
            wideRoot(models, chrome: chrome(models).wide { add(models) })
                .navigationDestination(for: AppRoute.self) { destination($0, models).wideColumn() }
        }
        .id(router.section)
    }

    @ViewBuilder private func wideRoot(_ models: AppModels, chrome: PageChrome) -> some View {
        switch router.section {
        case .home:
            HomeView(model: models.home, chrome: chrome) { addFirstEntry() }
                .liveRefresh(container.live, tables: HomeView.tables) { await models.home.refresh() }
        case .activity:
            EntryPane(model: models.ledger, id: router.pickedEntry, edit: edit, duplicate: duplicate, split: split) {
                router.pick(entry: nil)
            }
            .pageChrome(chrome)
        case .groups:
            if let id = router.pickedGroup {
                GroupPageHost(groupId: id, userId: userId, data: container.data, live: container.live,
                              site: container.config.siteURL) {
                    router.closeGroup()
                    Task { await models.groups.load() }
                }
                .id(id)
                .pageChrome(chrome)
            } else {
                WidePlaceholder(symbol: "person.2", text: language.t("ios:native.wide.pickGroup"))
                    .pageChrome(chrome)
            }
        default:
            if let route = router.section.route {
                destination(route, models)
                    .wideColumn()
                    .pageChrome(chrome)
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
                .lendsAdd(.run {
                    router.add = AddRequest(model: EntryFormModel(mode: .add, kind: models.recurring.tab, repeats: true,
                                                                  data: container.data))
                })
                .liveRefresh(container.live, tables: ["recurring_rules", "categories", "profiles"]) {
                    await models.recurring.load()
                }
        case .insights:
            InsightsView(model: models.insights)
                .liveRefresh(container.live, tables: ["transactions", "categories", "profiles", "accounts", "meal_vouchers",
                                                         "group_expenses", "settlements"]) {
                    await models.insights.load()
                }
        case .plan:
            PlanView(model: models.plan,
                     add: { kind in router.add = AddRequest(model: EntryFormModel(mode: .add, kind: kind, repeats: true,
                                                                                 data: container.data)) },
                     openRule: { rule in router.add = AddRequest(model: EntryFormModel(mode: .rule, rule: rule,
                                                                                      data: container.data)) })
                .liveRefresh(container.live, tables: ["recurring_rules", "categories", "profiles", "transactions", "budgets"]) {
                    await models.plan.load()
                }
        case .salary:
            SalaryView(model: models.salary,
                       addIncome: { category in
                           router.add = AddRequest(model: EntryFormModel(mode: .add, kind: "income", preset: category,
                                                                         data: container.data))
                       })
                .liveRefresh(container.live, tables: ["transactions", "categories", "profiles", "meal_vouchers"]) {
                    await models.salary.load()
                }
        case .netWorthAccount(let id):
            AccountEditHost(insights: models.insights, id: id, data: container.data)
        case .newNetWorthAccount:
            AccountEditHost(insights: models.insights, id: nil, data: container.data)
        case .categories:
            HomeCategoriesPage(model: models.home)
        case .settings:
            SettingsView(config: container.config, session: container.session, account: models.account,
                         email: user.email ?? "",
                         startTour: { Task { await models.tour.start(returnTo: "/settings") } })
                .liveRefresh(container.live, tables: ["profiles"]) { await models.account.refreshProfile() }
        case .language:
            LanguageView(profileLanguage: models.profileLanguage)
        case .account:
            AccountView(model: models.account, email: user.email ?? "")
        case .spending:
            SpendingView(model: models.preferences)
                .liveRefresh(container.live, tables: ["profiles", "categories"]) { await models.preferences.load() }
        case .messages:
            MessagesView(model: models.preferences, push: container.push)
                .liveRefresh(container.live, tables: ["profiles"]) { await models.preferences.load() }
        case .appearance:
            AppearanceView()
        case .aiHelpers:
            AiHelpersView(model: models.preferences)
                .liveRefresh(container.live, tables: ["profiles"]) { await models.preferences.load() }
        case .faceLock:
            LockSettingsView(lock: lock)
        case .security:
            SecurityView(model: models.security)
        case .privacy:
            PrivacyView(model: models.privacy, preferences: models.preferences) {
                router.showActivity()
            }
        case .privacyRequest:
            PrivacyRequestView(model: models.privacy)
        case .whatsNew:
            WhatsNewView()
        case .importStatement:
            ImportHost(data: container.data, userId: userId) { from, to in viewImported(from: from, to: to, models) }
        case .importRules:
            ImportRulesView(model: models.importRules)
                .liveRefresh(container.live, tables: ["category_rules", "categories"]) { await models.importRules.load() }
        case .importRule(let id):
            ImportRuleHost(rules: models.importRules, id: id)
        case .yourData:
            YourDataView()
        case .exportBackup:
            BackupHost(page: .export, data: container.data, userId: userId, email: user.email)
        case .restoreBackup:
            BackupHost(page: .restore, data: container.data, userId: userId, email: user.email)
        case .categoryList:
            CategoriesView(model: models.categories)
                .liveRefresh(container.live, tables: ["categories"]) { await models.categories.load() }
        case .category(let id):
            CategoryEditHost(categories: models.categories, id: id, kind: "expense")
        case .newCategory(let kind):
            CategoryEditHost(categories: models.categories, id: nil, kind: kind)
        case .savings:
            SavingsView(model: models.savings,
                        add: { category, repeats in
                            router.add = AddRequest(model: EntryFormModel(mode: .add, kind: "income", repeats: repeats,
                                                                          preset: category, data: container.data))
                        },
                        open: { row in router.add = AddRequest(model: EntryFormModel(mode: .edit, transaction: row,
                                                                                    data: container.data)) },
                        openRule: { rule in router.add = AddRequest(model: EntryFormModel(mode: .rule, rule: rule,
                                                                                         data: container.data)) })
                .liveRefresh(container.live, tables: ["transactions", "categories", "profiles", "accounts", "savings_goals",
                                                      "recurring_rules"]) {
                    await models.savings.load()
                }
        case .goal(let id):
            GoalEditHost(savings: models.savings, id: id, data: container.data)
        case .newGoal:
            GoalEditHost(savings: models.savings, id: nil, data: container.data)
        case .vouchers:
            VouchersView(model: models.vouchers,
                         open: { row in router.add = AddRequest(model: EntryFormModel(mode: .edit, transaction: row,
                                                                                     data: container.data)) })
                .liveRefresh(container.live, tables: ["transactions", "categories", "profiles", "meal_vouchers"]) {
                    await models.vouchers.load()
                }
        case .voucherSetup:
            VoucherSetupHost(data: container.data)
        case .group(let id):
            GroupPageHost(groupId: id, userId: userId, data: container.data, live: container.live,
                          site: container.config.siteURL) {
                router.closeGroup()
                Task { await models.groups.load() }
            }
        case .newGroup:
            NewGroupHost(data: container.data, site: container.config.siteURL) { id in
                router.showGroup(id)
                Task { await models.groups.load() }
            }
        case .join(let token):
            JoinHost(token: token, data: container.data) { id in
                router.showGroup(id)
                Task { await models.groups.load() }
            }
        case .categoryPage(let id, let period):
            CategoryPageHost(id: id, period: period, data: container.data, live: container.live,
                             open: { row in router.add = AddRequest(model: EntryFormModel(mode: .edit, transaction: row,
                                                                                         data: container.data)) })
        case .help(let anchor):
            HelpView(site: container.config.siteURL, anchor: anchor)
        case .notifications:
            NotificationsView(model: models.shell) { item in
                if let path = item.path { router.open(path: path) }
            }
        }
    }
}
