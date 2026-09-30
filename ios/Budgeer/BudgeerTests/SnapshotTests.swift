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
