// Pictures of every screen (light, dark, Greek) with the fixtures' fake
// data, in the app's frame (the top bar, the bottom bar with the screen's
// tab lit, the floating Add where the web has it) at an iPhone 15's width:
// "<name>.png" the whole page, "<name>-top.png" what the phone shows first.
// Each PNG is attached to the test and, when SNAPSHOT_DIR is set (CI passes
// it as TEST_RUNNER_SNAPSHOT_DIR), written there for the workflow's
// artifact. Nothing is compared: these are for looking at.
import SwiftUI
import XCTest
import BudgeerCore
@testable import Budgeer

@MainActor
final class SnapshotTests: XCTestCase {
    private static let size = CGSize(width: 393, height: 852)
    private static let variants = [("en", false), ("en", true), ("el", false)]
    private static let config = AppConfig(environment: .dev, supabaseURL: URL(string: "https://example.supabase.co")!,
                                          supabaseAnonKey: "test")

    override func tearDown() {
        try? BudgeerCore.shared.setLanguage("en")
        super.tearDown()
    }

    func testSignInSnapshots() throws {
        for (lang, dark) in SnapshotTests.variants {
            let language = language(lang)
            let session = SessionStore(auth: FakeAuthService())
            let view = SignInView(model: SignInViewModel(), session: session, site: "https://dev.budgeer.com")
            try shots(view, language, name: "signin", lang: lang, dark: dark, height: 1000)
        }
    }

    func testHomeSnapshots() async throws {
        let fixture = try HomeFixture.load()
        for (lang, dark) in SnapshotTests.variants {
            let language = language(lang)
            let now = fixture.now
            let store = FakeStore(home: fixture)
            store.oldest = .success("2020-03-15")
            store.vouchersResult = .success(HomeViewModelTests.vouchers)
            store.budgetsByPeriod = ["2020-09-01": [HomeViewModelTests.groceriesCap]]
            store.profileResult = .success(fixture.input.profile.with("ai_month_summary", true))
            store.summaryResult = .success(["summary": ["lines": [
                "You spent €319.30 so far, most of it on groceries.", "Eating out is close to its budget.",
            ], "lang": .string(lang)], "stale": false, "empty": false])
            let model = HomeViewModel(data: store.data, core: .shared, now: { now }, defaults: defaults())
            await model.load()
            let view = ShellChrome(tab: .home, badge: "1", unreadCount: 1, initials: "SM", fab: true) {
                NavigationStack { HomeView(model: model) }
            }
            try shots(view, language, name: "home", lang: lang, dark: dark, height: 3400)
            // The overview in words.
            model.pickTab("words")
            let words = ShellChrome(tab: .home, initials: "SM", fab: true) { NavigationStack { HomeView(model: model) } }
            try snapshot(words.environment(language).environment(appearance()), name: "home-words-\(suffix(lang, dark))",
                         dark: dark, height: SnapshotTests.size.height)
        }
    }

    func testEntryFormSnapshots() async throws {
        let now = TestData.now
        for (lang, dark) in SnapshotTests.variants {
            let language = language(lang)
            let store = FakeStore()
            store.categoriesResult = .success(TestData.categories)
            store.savingsResult = .success([["id": "c-sav", "kind": "income", "is_savings": true]])
            // Add: an expense with Repeat on.
            let add = EntryFormModel(mode: .add, repeats: true, data: store.data, core: .shared, now: { now })
            await add.load()
            add.setAmount("12.99")
            add.pickCategory("c-fun")
            add.setDescription("Streaming")
            try shots(ShellChrome(tab: .transactions, initials: "SM") {
                NavigationStack { EntryFormView(model: add) { _ in } }
            }, language, name: "add", lang: lang, dark: dark, height: 1700)
            // Edit: a saved expense.
            let row: JSONValue = ["id": "t1", "kind": "expense", "amount_minor": 4250, "currency": "EUR",
                                  "exchange_rate": 1, "category_id": "c-food", "description": "Market", "notes": "Weekly shop",
                                  "spent_at": "2026-09-14", "recurring_rule_id": .null, "account_id": .null,
                                  "savings_from_income": false, "paid_from_savings": false, "paid_with_vouchers": false]
            let edit = EntryFormModel(mode: .edit, transaction: row, data: store.data, core: .shared, now: { now })
            await edit.load()
            try shots(ShellChrome(tab: .transactions, initials: "SM") {
                NavigationStack { EntryFormView(model: edit) { _ in } }
            }, language, name: "edit", lang: lang, dark: dark, height: 1400)
        }
    }

    func testTransactionsSnapshots() async throws {
        let fixture = try LedgerFixture.load()
        let now = fixture.now
        for (lang, dark) in SnapshotTests.variants {
            let language = language(lang)
            let store = FakeStore()
            store.profileResult = .success(fixture.input.profile)
            store.savingsResult = .success(fixture.input.categories)
            store.oldest = .success(fixture.input.oldest)
            store.rowsFor = { query in fixture.rows(kind: query.kind) }
            let model = LedgerModel(data: store.data, core: .shared, now: { now })
            await model.load()
            await model.setType("all")
            try shots(ShellChrome(tab: .transactions, initials: "SM") {
                NavigationStack { TransactionsView(model: model) }
            }, language, name: "transactions", lang: lang, dark: dark, height: 1500)
        }
    }

    func testBudgetsSnapshots() async throws {
        let fixture = try BudgetsFixture.load()
        let now = fixture.now
        for (lang, dark) in SnapshotTests.variants {
            let language = language(lang)
            let model = BudgetsModel(data: fixture.store("own").data, core: .shared, now: { now })
            await model.load()
            try shots(ShellChrome(tab: .budgets, initials: "SM", fab: true) {
                NavigationStack { BudgetsView(model: model) }
            }, language, name: "budgets", lang: lang, dark: dark, height: 1100)
        }
    }

    func testRecurringSnapshots() async throws {
        let fixture = try RecurringFixture.load()
        for (lang, dark) in SnapshotTests.variants {
            let language = language(lang)
            let model = RecurringModel(data: fixture.store().data, core: .shared)
            await model.load()
            model.group = "monthly"
            try shots(ShellChrome(tab: .more, initials: "SM") {
                NavigationStack { RecurringView(model: model, back: {}) }
            }, language, name: "recurring", lang: lang, dark: dark, height: 1100)
        }
    }

    func testInsightsSnapshots() async throws {
        let fixture = try InsightsFixture.load()
        let now = fixture.now
        for (lang, dark) in SnapshotTests.variants {
            let language = language(lang)
            let model = InsightsModel(data: fixture.store().data, core: .shared, now: { now })
            await model.load()
            try shots(ShellChrome(tab: .more, initials: "SM") {
                NavigationStack { InsightsView(model: model, back: {}) }
            }, language, name: "insights", lang: lang, dark: dark, height: 1300)
        }
    }

    func testMoreSnapshots() throws {
        for (lang, dark) in SnapshotTests.variants {
            let language = language(lang)
            let session = SessionStore(auth: FakeAuthService(user: .sample))
            let store = FakeStore()
            try shots(ShellChrome(tab: .more, initials: "SM") {
                NavigationStack {
                    MoreView(config: SnapshotTests.config, session: session, user: .sample, profiles: store.data.profile) { _ in }
                }
            }, language, name: "more", lang: lang, dark: dark, height: SnapshotTests.size.height)
            try shots(ShellChrome(tab: .more, initials: "SM") {
                NavigationStack {
                    SettingsView(config: SnapshotTests.config, session: session, user: .sample, name: "Sam Morgan",
                                 initials: "SM", back: {}) { _ in }
                }
            }, language, name: "settings", lang: lang, dark: dark, height: SnapshotTests.size.height)
        }
    }

    func testGroupsSnapshots() async throws {
        let fixture = try GroupsFixture.load()
        let now = fixture.now
        let user = AuthUser.sample.id.uuidString.lowercased()
        for (lang, dark) in SnapshotTests.variants {
            let language = language(lang)
            let store = fixture.store()
            let live = LiveHub()
            // The Groups tab: an invite and two groups.
            let list = GroupsModel(data: store.data, userId: user)
            await list.load()
            try shots(ShellChrome(tab: .groups, initials: "SM") {
                GroupsView(model: list, data: store.data, live: live, site: "https://dev.budgeer.com", path: .constant([]))
            }, language, name: "groups", lang: lang, dark: dark, height: SnapshotTests.size.height)
            // A group's page, seen by its owner.
            let group = GroupModel(groupId: fixture.groupId, userId: user, site: "https://dev.budgeer.com",
                                   data: store.data, now: { now })
            await group.load()
            try shots(ShellChrome(tab: .groups, initials: "SM") {
                NavigationStack { GroupPageView(model: group, live: live) }
            }, language, name: "group", lang: lang, dark: dark, height: 1700)
            group.tab = "activity"
            try shots(ShellChrome(tab: .groups, initials: "SM") {
                NavigationStack { GroupPageView(model: group, live: live) }
            }, language, name: "group-activity", lang: lang, dark: dark, height: 1700)
            // Add an expense, split by amounts.
            let form = group.expenseForm(expenseId: nil)
            form.setDescription("Taxi")
            form.setAmount("84.60")
            form.pickMode("exact")
            form.setShare("m1", "40")
            form.setShare("m2", "20")
            try shots(ShellChrome(tab: .groups, initials: "SM") {
                NavigationStack { GroupExpenseView(model: form) { _ in } }
            }, language, name: "group-expense", lang: lang, dark: dark, height: 1500)
            // Settle up, on the biggest payment you're part of.
            let settle = try XCTUnwrap(group.settleUp())
            try shots(ShellChrome(tab: .groups, initials: "SM") {
                NavigationStack { SettleUpView(model: settle, onDone: {}, groupName: group.groupName) }
            }, language, name: "group-settle", lang: lang, dark: dark, height: 1300)
            // Members, with a share link made.
            try shots(ShellChrome(tab: .groups, initials: "SM") {
                NavigationStack { MembersView(model: group) }
            }, language, name: "group-members", lang: lang, dark: dark, height: 1300)
            // Add, with "Who's it for?" on a group: its quick form.
            let mine = MyGroupsModel(data: store.data, userId: user)
            await mine.load()
            let lisbon = try XCTUnwrap(mine.group("g-lisbon"))
            let quick = GroupExpenseModel(group: lisbon, members: lisbon["members"] ?? [], myMemberId: "m1", userId: user,
                                          expense: nil, initial: ["amount": "12.50", "currency": "EUR",
                                                                  "currencyPicked": false, "description": "Snacks",
                                                                  "spentAt": "2026-09-19"],
                                          quick: true, data: store.data, now: { now })
            try shots(ShellChrome(tab: .transactions, initials: "SM") {
                NavigationStack {
                    GroupExpenseView(model: quick, onDone: { _ in }, back: {}) {
                        WhoForChips(groups: mine.groups, value: "g-lisbon") { _ in }
                    }
                }
            }, language, name: "add-group", lang: lang, dark: dark, height: 1300)
        }
    }

    // MARK: Helpers

    private func language(_ lang: String) -> AppLanguage {
        AppLanguage(preference: lang, defaults: defaults(), deviceLanguages: ["en"])
    }

    private func defaults() -> UserDefaults { UserDefaults(suiteName: "SnapshotTests")! }

    /// The frame's light/dark switch, left to the system (the window's style).
    private func appearance() -> AppAppearance {
        let appearance = AppAppearance(defaults: defaults())
        appearance.set(nil)
        return appearance
    }

    private func suffix(_ lang: String, _ dark: Bool) -> String { "\(lang)\(dark ? "-dark" : "")" }

    /// The whole page (`height` tall) and the phone's first screenful.
    private func shots<V: View>(_ view: V, _ language: AppLanguage, name: String, lang: String, dark: Bool,
                                height: CGFloat) throws {
        let dressed = view.environment(language).environment(appearance())
        try snapshot(dressed, name: "\(name)-\(suffix(lang, dark))", dark: dark, height: height)
        if height > SnapshotTests.size.height {
            try snapshot(dressed, name: "\(name)-\(suffix(lang, dark))-top", dark: dark, height: SnapshotTests.size.height)
        }
    }

    private func snapshot<V: View>(_ view: V, name: String, dark: Bool, height: CGFloat = SnapshotTests.size.height) throws {
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
        // Let SwiftUI settle its first layout.
        RunLoop.main.run(until: Date(timeIntervalSinceNow: 0.6))
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
        window.isHidden = true
    }
}
