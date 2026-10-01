// Pictures of every screen (light, dark, Greek) with the fixtures' fake
// data, in the app's frame (the floating tab bar with the screen's tab
// picked, Add beside it) at an iPhone 17's size: "<name>-<variant>.png",
// plus "<name>-<variant>-long.png" for the pages worth seeing whole. Sheets
// are shown over the page they come up on; what plays once (the sign-in's
// intro, the confetti) is caught at fixed moments. Each PNG is attached to the test
// and, when SNAPSHOT_DIR is set (CI passes it as TEST_RUNNER_SNAPSHOT_DIR),
// written there for the workflow's artifact. Nothing is compared: these are
// for looking at.
import SwiftUI
import XCTest
import BudgeerCore
@testable import Budgeer

@MainActor
final class SnapshotTests: XCTestCase {
    private static let size = CGSize(width: 402, height: 874)
    private static let variants = [("en", false), ("en", true), ("el", false)]
    private static let config = AppConfig(environment: .dev, supabaseURL: URL(string: "https://example.supabase.co")!,
                                          supabaseAnonKey: "test")
    private static let user = AuthUser.sample.id.uuidString.lowercased()
    private static let chrome = PageChrome(initials: "SM", badge: "1", onBell: {}, onProfile: {})

    override func tearDown() {
        try? BudgeerCore.shared.setLanguage("en")
        super.tearDown()
    }

    // MARK: Signed out

    func testSignInSnapshots() async throws {
        for (lang, dark) in SnapshotTests.variants {
            let session = SessionStore(auth: FakeAuthService())
            let signIn = SignInView(model: SignInViewModel(), session: session, site: "https://dev.budgeer.com")
            try await shots(signIn.environment(\.nativeFrozenMotion, 1), name: "signin", lang: lang, dark: dark)
            // The wordmark's intro (the website's loading ring, once), at three moments.
            for (index, moment) in [0.18, 0.42, 0.7].enumerated() {
                try await shots(signIn.environment(\.nativeFrozenMotion, moment), name: "signin-intro\(index + 1)",
                                lang: lang, dark: dark, settle: 0.4)
            }
            try await shots(LegalGateView(status: .outdated, session: session), name: "legal", lang: lang, dark: dark)
        }
    }

    func testLockSnapshots() async throws {
        for (lang, dark) in SnapshotTests.variants {
            let defaults = UserDefaults(suiteName: "SnapshotTests.lock")!
            defaults.set(true, forKey: AppLock.key)
            let owner = FakeOwner()
            owner.answer = false
            let lock = AppLock(defaults: defaults, owner: owner)
            try await shots(LockView(lock: lock), name: "lock", lang: lang, dark: dark)
        }
    }

    // MARK: Home

    func testHomeSnapshots() async throws {
        let fixture = try HomeFixture.load()
        for (lang, dark) in SnapshotTests.variants {
            let model = try await homeModel(fixture, lang: lang)
            try await shots(framed(.home) { NavigationStack { HomeView(model: model, chrome: SnapshotTests.chrome) } },
                      name: "home", lang: lang, dark: dark, long: 2200)
            // The categories' See all.
            try await shots(framed(.home) { NavigationStack { HomeCategoriesPage(model: model) } },
                      name: "home-categories", lang: lang, dark: dark)
            // A past month that kept every budget.
            await model.setPeriod("m:2020-8")
            try await shots(framed(.home) { NavigationStack { HomeView(model: model, chrome: SnapshotTests.chrome) } },
                      name: "home-held", lang: lang, dark: dark)
        }
    }

    // MARK: The Add sheet

    func testAddSheetSnapshots() async throws {
        let fixture = try HomeFixture.load()
        let now = TestData.now
        for (lang, dark) in SnapshotTests.variants {
            let home = try await homeModel(fixture, lang: lang)
            let store = try formStore()
            let groups = MyGroupsModel(data: store.data, userId: SnapshotTests.user, defaults: defaults())
            // Add, as it first comes up: the amount and the keypad.
            let add = EntryFormModel(mode: .add, data: store.data, core: .shared, now: { now })
            await add.load()
            add.setAmount("12.99")
            add.pickCategory("c-fun")
            add.setDescription("Streaming")
            try await shots(overHome(home) {
                AddSheet(request: AddRequest(model: add), data: store.data, userId: SnapshotTests.user, groups: groups)
            }, name: "add", lang: lang, dark: dark, settle: 1.6)
            // Edit: a saved expense, the whole sheet.
            let edit = EntryFormModel(mode: .edit, transaction: SnapshotTests.saved, data: store.data, core: .shared,
                                      now: { now })
            await edit.load()
            try await shots(overHome(home) {
                AddSheet(request: AddRequest(model: edit), data: store.data, userId: SnapshotTests.user, groups: groups)
            }, name: "edit", lang: lang, dark: dark, settle: 1.6)
            // Split with a group: "Who's it for?" on the group's quick form.
            let split = EntryFormModel(mode: .add, transaction: SnapshotTests.saved, data: store.data, core: .shared,
                                       now: { now })
            try await shots(overHome(home) {
                AddSheet(request: AddRequest(model: split, splitting: SnapshotTests.saved), data: store.data,
                         userId: SnapshotTests.user, groups: groups)
            }, name: "add-group", lang: lang, dark: dark, settle: 2.5)
        }
    }

    // MARK: Activity

    func testActivitySnapshots() async throws {
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
            try await shots(framed(.activity) {
                NavigationStack {
                    ActivityView(model: model, chrome: SnapshotTests.chrome, open: { _ in }, duplicate: { _ in },
                                 split: { _ in })
                }
            }, name: "activity", lang: lang, dark: dark, long: 2000)
        }
    }

    // MARK: Groups

    func testGroupsSnapshots() async throws {
        let fixture = try GroupsFixture.load()
        let now = fixture.now
        for (lang, dark) in SnapshotTests.variants {
            _ = language(lang)
            let store = SnapshotTests.galleryStore(fixture)
            // The Groups tab: an invite and four groups.
            let list = GroupsModel(data: store.data, userId: SnapshotTests.user)
            await list.load()
            try await shots(framed(.groups) { NavigationStack { GroupsView(model: list, chrome: SnapshotTests.chrome) } },
                      name: "groups", lang: lang, dark: dark, long: 1500)
            // New group: empty, filled in (an emoji cover, two invites, a link), and made.
            let empty = NewGroupModel(data: store.data, site: "https://dev.budgeer.com")
            await empty.load()
            try await shots(framed(.groups) { NavigationStack { NewGroupView(model: empty) { _ in } } },
                      name: "group-new", lang: lang, dark: dark, long: 1500)
            let filled = NewGroupModel(data: store.data, site: "https://dev.budgeer.com")
            await filled.load()
            filled.name = "Lisbon 2027"
            for address in ["sofia@example.com", "marco@example.com"] {
                filled.emailText = address
                filled.addEmail()
            }
            filled.shareLink = true
            try await shots(framed(.groups) {
                NavigationStack { NewGroupView(model: filled, onCreated: { _ in }, emoji: "✈️", colour: "blue") }
            }, name: "group-new-filled", lang: lang, dark: dark, long: 1500)
            _ = await filled.create(cover: nil)
            try await shots(framed(.groups) {
                NavigationStack { NewGroupView(model: filled, onCreated: { _ in }, emoji: "✈️", colour: "blue") }
            }, name: "group-new-done", lang: lang, dark: dark)
            // A group's page, seen by its owner.
            let group = GroupModel(groupId: fixture.groupId, userId: SnapshotTests.user, site: "https://dev.budgeer.com",
                                   data: store.data, now: { now })
            await group.load()
            try await shots(framed(.groups) { NavigationStack { GroupPageView(model: group) } },
                      name: "group", lang: lang, dark: dark)
            // Settled: the confetti behind the cards, caught mid-fall.
            try await shots(framed(.groups) {
                NavigationStack { GroupPageView(model: group, celebrating: true) }
                    .environment(\.nativeFrozenMotion, 0.6)
            }, name: "group-settled", lang: lang, dark: dark)
            // Balances, its own page.
            try await shots(framed(.groups) { NavigationStack { BalancesView(model: group) {} } },
                      name: "group-balances", lang: lang, dark: dark, long: 1200)
            // Add an expense, split by amounts.
            let form = group.expenseForm(expenseId: nil)
            form.setDescription("Taxi")
            form.setAmount("84.60")
            form.pickMode("exact")
            form.setShare("m1", "40")
            form.setShare("m2", "20")
            try await shots(framed(.groups) {
                NavigationStack { GroupPageView(model: group) }
                    .sheet(isPresented: .constant(true)) { GroupExpenseSheet(model: form) { _ in } }
            }, name: "group-expense", lang: lang, dark: dark, settle: 1.6)
            // Settle up, on the biggest payment you're part of.
            let settle = try XCTUnwrap(group.settleUp())
            try await shots(framed(.groups) {
                NavigationStack { GroupPageView(model: group) }
                    .sheet(isPresented: .constant(true)) { SettleUpView(model: settle) {} }
            }, name: "group-settle", lang: lang, dark: dark, settle: 1.6)
            // Members, with a share link made.
            await group.makeInviteLink()
            try await shots(framed(.groups) { NavigationStack { MembersView(model: group) } },
                      name: "group-members", lang: lang, dark: dark, long: 1300)
        }
    }

    // MARK: More and its pages

    func testMoreSnapshots() async throws {
        for (lang, dark) in SnapshotTests.variants {
            _ = language(lang)
            let session = SessionStore(auth: FakeAuthService(user: .sample))
            let owner = FakeOwner()
            let lock = AppLock(defaults: UserDefaults(suiteName: "SnapshotTests.settings")!, owner: owner)
            try await shots(framed(.more) {
                NavigationStack {
                    MoreView(name: "Sam Morgan", email: "sam@example.com", initials: "SM", chrome: SnapshotTests.chrome)
                }
            }, name: "more", lang: lang, dark: dark)
            let account = AccountModel(data: SnapshotTests.settingsStore().data)
            await account.load()
            try await shots(framed(.more) {
                NavigationStack {
                    SettingsView(config: SnapshotTests.config, session: session, lock: lock, account: account,
                                 email: "sam@example.com")
                }
            }, name: "settings", lang: lang, dark: dark, long: 1700)
            // The bell's page, pushed on More (the new one still marked).
            let store = FakeStore()
            store.notificationsResult = .success(SnapshotTests.notifications)
            let shell = ShellModel(data: store.data, now: { SnapshotTests.bellNow })
            await shell.load()
            await shell.opened()
            try await shots(framed(.more) { NavigationStack { NotificationsView(model: shell) { _ in } } },
                      name: "notifications", lang: lang, dark: dark)
        }
    }

    // MARK: Settings' pages

    func testSettingsPagesSnapshots() async throws {
        for (lang, dark) in SnapshotTests.variants {
            _ = language(lang)
            let store = SnapshotTests.settingsStore()
            let account = AccountModel(data: store.data)
            await account.load()
            try await shots(framed(.more) { NavigationStack { AccountView(model: account, email: "sam@example.com") } },
                      name: "settings-account", lang: lang, dark: dark, long: 1300)
            let preferences = PreferencesModel(data: store.data)
            await preferences.load()
            await preferences.setSalaryShift(true)
            try await shots(framed(.more) { NavigationStack { SpendingView(model: preferences) } },
                      name: "settings-spending", lang: lang, dark: dark)
            try await shots(framed(.more) { NavigationStack { MessagesView(model: preferences) } },
                      name: "settings-notifications", lang: lang, dark: dark)
            try await shots(framed(.more) { NavigationStack { AppearanceView() } },
                      name: "settings-appearance", lang: lang, dark: dark)
            try await shots(framed(.more) { NavigationStack { AiHelpersView(model: preferences) } },
                      name: "settings-ai", lang: lang, dark: dark, long: 1500)
            try await shots(framed(.more) { NavigationStack { WhatsNewView() } },
                      name: "settings-whatsnew", lang: lang, dark: dark, long: 2000)
        }
    }

    func testSecurityAndPrivacySnapshots() async throws {
        for (lang, dark) in SnapshotTests.variants {
            _ = language(lang)
            let store = SnapshotTests.settingsStore()
            let now = TestData.now
            let fake = FakeSecurity()
            let security = SecurityModel(data: store.data, security: fake, signOut: {}, core: .shared, now: { now })
            await security.load()
            try await shots(framed(.more) { NavigationStack { SecurityView(model: security) } },
                      name: "settings-security", lang: lang, dark: dark, long: 1300)
            // Delete account, asking for the password.
            try await shots(framed(.more) {
                NavigationStack { SecurityView(model: security) }
                    .sheet(isPresented: .constant(true)) { DeleteAccountSheet(model: security) }
            }, name: "settings-delete-account", lang: lang, dark: dark, settle: 1.6)
            // A Google-only account whose sign-in is an hour old: Log in again, Set a password.
            let google = FakeSecurity()
            google.user = ["email": "sam@example.com", "app_metadata": ["providers": ["google"]], "user_metadata": [:]]
            google.identityRows = [["provider": "google", "identity_id": "i-g", "identity_data": ["email": "sam@gmail.com"]]]
            google.claims = ["iat": .int(Int(now.timeIntervalSince1970) - 3600)]
            let googleOnly = SecurityModel(data: store.data, security: google, signOut: {}, core: .shared, now: { now })
            await googleOnly.load()
            googleOnly.settingFirst = true
            try await shots(framed(.more) { NavigationStack { SecurityView(model: googleOnly) } },
                      name: "settings-security-google", lang: lang, dark: dark, long: 1300)

            let preferences = PreferencesModel(data: store.data)
            await preferences.load()
            let privacy = PrivacyModel(data: store.data, core: .shared, now: { now })
            await privacy.load()
            try await shots(framed(.more) {
                NavigationStack { PrivacyView(model: privacy, preferences: preferences) {} }
            }, name: "settings-privacy", lang: lang, dark: dark, long: 3000)
            privacy.requestText = "Please stop using my data for the weekly summary."
            try await shots(framed(.more) { NavigationStack { PrivacyRequestView(model: privacy) } },
                      name: "settings-privacy-request", lang: lang, dark: dark, long: 1300)
        }
    }

    func testCategoriesSnapshots() async throws {
        for (lang, dark) in SnapshotTests.variants {
            _ = language(lang)
            let store = CategoriesModelTests.store()
            store.categoryUse = 3
            let list = CategoriesModelTests.model(store)
            await list.load()
            try await shots(framed(.more) { NavigationStack { CategoriesView(model: list) } },
                      name: "categories", lang: lang, dark: dark)
            list.kind = "income"
            try await shots(framed(.more) { NavigationStack { CategoriesView(model: list) } },
                      name: "categories-income", lang: lang, dark: dark)
            list.kind = "expense"
            // A category's page, and a new one with a name taken.
            let edit = list.editor(id: "c-fun", kind: "expense")
            try await shots(framed(.more) { NavigationStack { CategoryEditView(model: edit, categories: list) } },
                      name: "category-edit", lang: lang, dark: dark, long: 2000)
            let fresh = list.editor(id: nil, kind: "income")
            fresh.name = "Salary"
            fresh.touched = true
            try await shots(framed(.more) { NavigationStack { CategoryEditView(model: fresh, categories: list) } },
                      name: "category-new", lang: lang, dark: dark)
            // Delete, choosing where its entries go.
            let fun = try XCTUnwrap(list.items.first { $0.id == "c-fun" })
            await list.startDelete(fun)
            try await shots(framed(.more) {
                NavigationStack { CategoriesView(model: list) }
                    .sheet(isPresented: .constant(true)) { DeleteCategorySheet(model: list) }
            }, name: "category-delete", lang: lang, dark: dark, settle: 1.6)
            list.deleting = nil
        }
    }

    func testBudgetsSnapshots() async throws {
        let fixture = try BudgetsFixture.load()
        let now = fixture.now
        for (lang, dark) in SnapshotTests.variants {
            _ = language(lang)
            let model = BudgetsModel(data: fixture.store("own").data, core: .shared, now: { now })
            await model.load()
            try await shots(framed(.home) { NavigationStack { BudgetsView(model: model) } },
                      name: "budgets", lang: lang, dark: dark, long: 1300)
        }
    }

    func testRecurringSnapshots() async throws {
        let fixture = try RecurringFixture.load()
        for (lang, dark) in SnapshotTests.variants {
            _ = language(lang)
            let model = RecurringModel(data: fixture.store().data, core: .shared)
            await model.load()
            try await shots(framed(.more) { NavigationStack { RecurringView(model: model, open: { _ in }, add: { _ in }) } },
                      name: "recurring", lang: lang, dark: dark, long: 1400)
        }
    }

    func testInsightsSnapshots() async throws {
        let fixture = try InsightsFixture.load()
        let now = fixture.now
        for (lang, dark) in SnapshotTests.variants {
            _ = language(lang)
            let model = InsightsModel(data: fixture.store().data, core: .shared, now: { now })
            await model.load()
            try await shots(framed(.more) { NavigationStack { InsightsView(model: model) } },
                      name: "insights", lang: lang, dark: dark, long: 1600)
        }
    }

    // MARK: Sample data

    private static let saved: JSONValue = [
        "id": "t1", "kind": "expense", "amount_minor": 4250, "currency": "EUR", "exchange_rate": 1,
        "category_id": "c-food", "description": "Market", "notes": "Weekly shop", "spent_at": "2026-09-14",
        "recurring_rule_id": .null, "account_id": .null, "savings_from_income": false, "paid_from_savings": false,
        "paid_with_vouchers": false,
    ]

    private static let bellNow = ISO8601DateFormatter().date(from: "2026-09-20T12:00:00Z")!

    private static let notifications: JSONValue = [
        ["id": "n1", "type": "expense", "title": "Alex added Taxi", "body": "Lisbon trip · €84.60", "read_at": .null,
         "created_at": "2026-09-20T08:05:00Z", "group_id": "g-lisbon"],
        ["id": "n4", "type": "settlement", "title": "Marco Rossi paid you €20.00", "body": "Lisbon trip",
         "read_at": .null, "created_at": "2026-09-19T18:40:00Z", "group_id": "g-lisbon"],
        ["id": "n2", "type": "budget", "title": "Eating out is at 90%", "body": "€9 left this month",
         "read_at": "2026-09-18T09:00:00Z", "created_at": "2026-09-18T07:00:00Z"],
        ["id": "n3", "type": "invite", "title": "Marco Rossi invited you to Ski week", "body": .null,
         "read_at": "2026-09-16T09:00:00Z", "created_at": "2026-09-16T08:30:00Z"],
        ["id": "n5", "type": "digest", "title": "Your week: €182.40 spent", "body": "Groceries led the way.",
         "read_at": "2026-09-15T09:00:00Z", "created_at": "2026-09-15T06:00:00Z"],
    ]

    /// Settings' fake account: a profile, its payment details, its categories and a consent history.
    private static func settingsStore() -> FakeStore {
        let store = FakeStore()
        store.profileResult = .success([
            "id": "u1", "display_name": "Sam Morgan", "base_currency": "EUR", "avatar_url": .null, "is_demo": false,
            "yearly_separate": false, "salary_shift_from_day": .null, "salary_category_id": .null,
            "notify_email": true, "notify_digest": false, "ai_quick_entry": true, "ai_import_categories": false,
            "ai_month_summary": true, "ai_plan_whatif": false,
        ])
        store.categoriesResult = .success(TestData.categories)
        store.currencyLocked = true
        store.myPayment = ["payment_iban": "BE68539007547034", "payment_revolut": "sammorgan", "payment_paypal": .null]
        store.consentRows = [
            ["id": "k3", "purpose": "ai_month_summary", "version": .null, "granted": true, "source": "settings",
             "created_at": "2026-09-14T08:05:00Z"],
            ["id": "k2", "purpose": "weekly_digest", "version": .null, "granted": false, "source": "settings",
             "created_at": "2026-09-02T18:40:00Z"],
            ["id": "k1", "purpose": "privacy_notice", "version": "2026-08-01", "granted": true, "source": "signup",
             "created_at": "2026-08-03T09:12:00Z"],
        ]
        return store
    }

    /// The groups' fixture with two more groups (one settled, one just made),
    /// so the gallery has a full page.
    private static func galleryStore(_ fixture: GroupsFixture) -> FakeStore {
        let store = fixture.store()
        let alex = JSONValue.string(SnapshotTests.user)
        let extra: [JSONValue] = [
            ["id": "g-home", "name": "Home & bills", "currency": "EUR", "owner_id": alex, "image_url": .null,
             "created_at": "2026-06-01T10:00:00Z", "group_members": [["count": 2]]],
            ["id": "g-book", "name": "Book club", "currency": "EUR", "owner_id": "u-anna", "image_url": .null,
             "created_at": "2026-05-01T10:00:00Z", "group_members": [["count": 5]]],
        ]
        store.groupsResult = .success(.array((fixture.input.groups.arrayValue ?? []) + extra))
        let person = { (id: String, group: String, user: JSONValue, name: String, role: String) -> JSONValue in
            ["id": .string(id), "group_id": .string(group), "user_id": user, "display_name": .string(name),
             "role": .string(role), "created_at": "2026-05-01T10:00:00Z"]
        }
        store.summaries["g-home"] = [
            "members": [person("h1", "g-home", alex, "Alex Morgan", "owner"), person("h2", "g-home", .null, "Jamie", "member")],
            "avatars": [], "balances": [],
        ]
        store.summaries["g-book"] = [
            "members": .array([person("b1", "g-book", "u-anna", "Anna", "owner"), person("b2", "g-book", alex, "Alex Morgan", "member")]
                + ["Nikos", "Eleni", "Tom"].enumerated().map { person("b\($0.offset + 3)", "g-book", .null, $0.element, "member") }),
            "avatars": [], "balances": [],
        ]
        return store
    }

    /// Home's model over the fixture, this month, with a budget, the vouchers and the month in words.
    private func homeModel(_ fixture: HomeFixture, lang: String) async throws -> HomeViewModel {
        _ = language(lang)
        let now = fixture.now
        let store = FakeStore(home: fixture)
        store.oldest = .success("2020-03-15")
        store.vouchersResult = .success(HomeViewModelTests.vouchers)
        store.budgetsByPeriod = [
            "2020-09-01": [HomeViewModelTests.groceriesCap],
            "2020-08-01": [HomeViewModelTests.groceriesCap.with("period_start", "2020-08-01")],
        ]
        store.profileResult = .success(fixture.input.profile.with("ai_month_summary", true))
        store.summaryResult = .success(["summary": ["lines": [
            "You spent €319.30 so far, most of it on groceries.", "Eating out is close to its budget.",
        ], "lang": .string(lang)], "stale": false, "empty": false])
        let model = HomeViewModel(data: store.data, core: .shared, now: { now })
        await model.load()
        return model
    }

    /// The categories an entry picks from, a savings category, and the groups' fixture (Who's it for?).
    private func formStore() throws -> FakeStore {
        let store = try GroupsFixture.load().store()
        store.categoriesResult = .success(TestData.categories)
        store.savingsResult = .success([["id": "c-sav", "kind": "income", "is_savings": true]])
        return store
    }

    // MARK: Helpers

    private func language(_ lang: String) -> AppLanguage {
        let language = AppLanguage(preference: lang, defaults: defaults(), deviceLanguages: ["en"])
        NativeStyle.installAppearance(lang: language.current)
        return language
    }

    private func defaults() -> UserDefaults { UserDefaults(suiteName: "SnapshotTests")! }

    /// A page in the frame, with its tab picked.
    private func framed<V: View>(_ tab: NativeTab, @ViewBuilder _ page: @escaping () -> V) -> some View {
        NativeTabs(tab: .constant(tab), onAdd: {}) { shown in
            if shown == tab { page() } else { Color.clear }
        }
    }

    /// A sheet up over Home.
    private func overHome<V: View>(_ home: HomeViewModel, @ViewBuilder _ sheet: @escaping () -> V) -> some View {
        framed(.home) {
            NavigationStack { HomeView(model: home, chrome: SnapshotTests.chrome) }
                .sheet(isPresented: .constant(true)) { sheet() }
        }
    }

    /// The phone's screen, and the whole page when `long` is given.
    private func shots<V: View>(_ view: V, name: String, lang: String, dark: Bool, long: CGFloat? = nil,
                                settle: TimeInterval = 0.8) async throws {
        let dressed = view.environment(language(lang)).tint(NativeStyle.tint)
        let variant = "\(lang)\(dark ? "-dark" : "")"
        try await snapshot(dressed, name: "\(name)-\(variant)", dark: dark, height: SnapshotTests.size.height, settle: settle)
        if let long {
            try await snapshot(dressed, name: "\(name)-\(variant)-long", dark: dark, height: long, settle: settle)
        }
    }

    private func snapshot<V: View>(_ view: V, name: String, dark: Bool, height: CGFloat,
                                   settle: TimeInterval) async throws {
        let host = UIHostingController(rootView: view)
        host.overrideUserInterfaceStyle = dark ? .dark : .light
        // A window in the host app's scene, so it is really on screen and
        // drawHierarchy has something to draw.
        let scene = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }.first
        let window = scene.map { UIWindow(windowScene: $0) } ?? UIWindow(frame: .zero)
        window.frame = CGRect(origin: .zero, size: CGSize(width: SnapshotTests.size.width, height: height))
        window.overrideUserInterfaceStyle = dark ? .dark : .light
        window.rootViewController = host
        window.makeKeyAndVisible()
        host.view.layoutIfNeeded()
        // Let SwiftUI lay out, and a sheet finish coming up: the test steps
        // aside (rather than spinning the run loop inside itself), so the
        // pages' own tasks run on the main actor in turn.
        try await Task.sleep(nanoseconds: UInt64(settle * 1_000_000_000))
        let image = UIGraphicsImageRenderer(bounds: window.bounds).image { context in
            if !window.drawHierarchy(in: window.bounds, afterScreenUpdates: true) {
                window.layer.render(in: context.cgContext)
            }
        }
        let data = try XCTUnwrap(image.pngData())
        let attachment = XCTAttachment(image: image)
        attachment.name = name
        attachment.lifetime = .keepAlways
        add(attachment)
        if let dir = ProcessInfo.processInfo.environment["SNAPSHOT_DIR"], !dir.isEmpty {
            let folder = URL(fileURLWithPath: dir, isDirectory: true)
            try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
            try data.write(to: folder.appendingPathComponent("\(name).png"))
        }
        // Take a presented sheet down with the window, so the next picture starts clean.
        host.dismiss(animated: false)
        window.isHidden = true
    }
}
