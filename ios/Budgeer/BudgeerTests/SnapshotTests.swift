// Pictures of every screen (light, dark, Greek) with the fixture's fake
// data, at an iPhone 15's size. Each PNG is attached to the test and, when
// SNAPSHOT_DIR is set (CI passes it as TEST_RUNNER_SNAPSHOT_DIR), written
// there for the workflow's artifact. Nothing is compared: these are for
// looking at.
import SwiftUI
import XCTest
import BudgeerCore
@testable import Budgeer

@MainActor
final class SnapshotTests: XCTestCase {
    private static let size = CGSize(width: 393, height: 852)

    override func tearDown() {
        try? BudgeerCore.shared.setLanguage("en")
        super.tearDown()
    }

    func testSignInSnapshots() throws {
        for (lang, dark) in [("en", false), ("en", true), ("el", false)] {
            let language = language(lang)
            let session = SessionStore(auth: FakeAuthService())
            let view = SignInView(model: SignInViewModel(), session: session).environment(language)
            try snapshot(view, name: "signin-\(lang)\(dark ? "-dark" : "")", dark: dark)
        }
    }

    func testHomeSnapshots() async throws {
        let fixture = try HomeFixture.load()
        for (lang, dark) in [("en", false), ("en", true), ("el", false)] {
            let language = language(lang)
            let now = fixture.now
            let store = FakeStore(home: fixture)
            store.oldest = .success("2020-03-15")
            let model = HomeViewModel(data: store.data, core: .shared, now: { now })
            await model.load()
            XCTAssertEqual(model.state, .loaded(try XCTUnwrap(fixture.thisMonth(lang))))
            let view = HomeView(model: model).environment(language)
            try snapshot(view, name: "home-\(lang)\(dark ? "-dark" : "")", dark: dark, height: 1700)
        }
    }

    func testEntryFormSnapshots() async throws {
        let now = TestData.now
        for (lang, dark) in [("en", false), ("en", true), ("el", false)] {
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
            try snapshot(EntryFormView(model: add) { _ in }.environment(language),
                         name: "add-\(lang)\(dark ? "-dark" : "")", dark: dark, height: 1500)
            // Edit: a saved expense.
            let row: JSONValue = ["id": "t1", "kind": "expense", "amount_minor": 4250, "currency": "EUR",
                                  "exchange_rate": 1, "category_id": "c-food", "description": "Market", "notes": "Weekly shop",
                                  "spent_at": "2026-09-14", "recurring_rule_id": .null, "account_id": .null,
                                  "savings_from_income": false, "paid_from_savings": false, "paid_with_vouchers": false]
            let edit = EntryFormModel(mode: .edit, transaction: row, data: store.data, core: .shared, now: { now })
            await edit.load()
            try snapshot(EntryFormView(model: edit) { _ in }.environment(language),
                         name: "edit-\(lang)\(dark ? "-dark" : "")", dark: dark, height: 1100)
        }
    }

    func testTransactionsSnapshots() async throws {
        let fixture = try LedgerFixture.load()
        let now = fixture.now
        for (lang, dark) in [("en", false), ("en", true), ("el", false)] {
            let language = language(lang)
            let store = FakeStore()
            store.profileResult = .success(fixture.input.profile)
            store.savingsResult = .success(fixture.input.categories)
            store.oldest = .success(fixture.input.oldest)
            store.rowsFor = { query in fixture.rows(kind: query.kind) }
            let model = LedgerModel(data: store.data, core: .shared, now: { now })
            await model.load()
            await model.setType("all")
            try snapshot(TransactionsView(model: model).environment(language),
                         name: "transactions-\(lang)\(dark ? "-dark" : "")", dark: dark, height: 1300)
        }
    }

    func testBudgetsSnapshots() async throws {
        let fixture = try BudgetsFixture.load()
        let now = fixture.now
        for (lang, dark) in [("en", false), ("en", true), ("el", false)] {
            let language = language(lang)
            let model = BudgetsModel(data: fixture.store("own").data, core: .shared, now: { now })
            await model.load()
            try snapshot(BudgetsView(model: model).environment(language),
                         name: "budgets-\(lang)\(dark ? "-dark" : "")", dark: dark)
        }
    }

    func testRecurringSnapshots() async throws {
        let fixture = try RecurringFixture.load()
        for (lang, dark) in [("en", false), ("en", true), ("el", false)] {
            let language = language(lang)
            let model = RecurringModel(data: fixture.store().data, core: .shared)
            await model.load()
            model.group = "monthly"
            try snapshot(NavigationStack { RecurringView(model: model) }.environment(language),
                         name: "recurring-\(lang)\(dark ? "-dark" : "")", dark: dark, height: 1100)
        }
    }

    func testInsightsSnapshots() async throws {
        let fixture = try InsightsFixture.load()
        let now = fixture.now
        for (lang, dark) in [("en", false), ("en", true), ("el", false)] {
            let language = language(lang)
            let model = InsightsModel(data: fixture.store().data, core: .shared, now: { now })
            await model.load()
            try snapshot(NavigationStack { InsightsView(model: model) }.environment(language),
                         name: "insights-\(lang)\(dark ? "-dark" : "")", dark: dark, height: 1100)
        }
    }

    func testGroupsSnapshots() async throws {
        let fixture = try GroupsFixture.load()
        let now = fixture.now
        let user = AuthUser.sample.id.uuidString.lowercased()
        for (lang, dark) in [("en", false), ("en", true), ("el", false)] {
            let language = language(lang)
            let suffix = "\(lang)\(dark ? "-dark" : "")"
            let store = fixture.store()
            let live = LiveHub()
            // The Groups tab: an invite and two groups.
            let list = GroupsModel(data: store.data, userId: user)
            await list.load()
            try snapshot(GroupsView(model: list, data: store.data, live: live, site: "https://dev.budgeer.com")
                .environment(language), name: "groups-\(suffix)", dark: dark)
            // A group's page, seen by its owner.
            let group = GroupModel(groupId: fixture.groupId, userId: user, site: "https://dev.budgeer.com",
                                   data: store.data, now: { now })
            await group.load()
            try snapshot(NavigationStack { GroupPageView(model: group, live: live) }.environment(language),
                         name: "group-\(suffix)", dark: dark, height: 1500)
            group.tab = "activity"
            try snapshot(NavigationStack { GroupPageView(model: group, live: live) }.environment(language),
                         name: "group-activity-\(suffix)", dark: dark, height: 1500)
            // Add an expense, split by amounts.
            let form = group.expenseForm(expenseId: nil)
            form.setDescription("Taxi")
            form.setAmount("84.60")
            form.pickMode("exact")
            form.setShare("m1", "40")
            form.setShare("m2", "20")
            try snapshot(NavigationStack { GroupExpenseView(model: form) { _ in } }.environment(language),
                         name: "group-expense-\(suffix)", dark: dark, height: 1300)
            // Settle up, on the biggest payment you're part of.
            let settle = try XCTUnwrap(group.settleUp())
            try snapshot(NavigationStack { SettleUpView(model: settle) {} }.environment(language),
                         name: "group-settle-\(suffix)", dark: dark, height: 1100)
            // Members, with a share link made.
            try snapshot(NavigationStack { MembersView(model: group) }.environment(language),
                         name: "group-members-\(suffix)", dark: dark, height: 1100)
            // Add, with "Who's it for?" on a group: its quick form.
            let mine = MyGroupsModel(data: store.data, userId: user)
            await mine.load()
            let lisbon = try XCTUnwrap(mine.group("g-lisbon"))
            let quick = GroupExpenseModel(group: lisbon, members: lisbon["members"] ?? [], myMemberId: "m1", userId: user,
                                          expense: nil, initial: ["amount": "12.50", "currency": "EUR",
                                                                  "currencyPicked": false, "description": "Snacks",
                                                                  "spentAt": "2026-09-19"],
                                          quick: true, data: store.data, now: { now })
            try snapshot(NavigationStack {
                GroupExpenseView(model: quick) { _ in } lead: {
                    WhoForChips(groups: mine.groups, value: "g-lisbon") { _ in }
                }
            }.environment(language), name: "add-group-\(suffix)", dark: dark, height: 1100)
        }
    }

    private func language(_ lang: String) -> AppLanguage {
        let defaults = UserDefaults(suiteName: "SnapshotTests")!
        return AppLanguage(preference: lang, defaults: defaults, deviceLanguages: ["en"])
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
        // Let SwiftUI settle its first layout and the tab bar's rendering.
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
