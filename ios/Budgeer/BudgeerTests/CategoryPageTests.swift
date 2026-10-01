// A category's page: the figures equal the web's (Fixtures/category.json,
// written by mobile-core/categoryFigures.mjs) in both languages, and the
// model reads the web's queries and changes this month's cap through the
// same RPCs (set it, clear it to remove it, nothing changed). Where the
// links lead (AppPaths) is checked here too.
import XCTest
import BudgeerCore
@testable import Budgeer

/// Fixtures/category.json.
struct CategoryFixture: Decodable {
    struct View: Decodable {
        let name: String
        let categoryId: String
        let periodValue: String?
        let rows: JSONValue
        let budgets: JSONValue
    }
    struct Input: Decodable {
        let now: String
        let profile: JSONValue
        let categories: JSONValue
        let views: [View]
    }
    let input: Input
    let expected: [String: [String: CategoryPageFigures]]

    static func load() throws -> CategoryFixture {
        try JSONDecoder().decode(CategoryFixture.self, from: fixtureData("category"))
    }

    var now: Date { ISO8601DateFormatter.fractional.date(from: input.now)! }

    func view(_ name: String) -> View { input.views.first { $0.name == name }! }

    /// A store answering the page's reads for `view`.
    func store(_ name: String) -> FakeStore {
        let chosen = view(name)
        let store = FakeStore()
        store.profileResult = .success(input.profile)
        store.allCategoriesResult = .success(input.categories)
        store.rowsResult = .success(chosen.rows)
        store.budgetsByPeriod = ["2020-09-01": chosen.budgets, "2020-08-01": chosen.budgets]
        store.oldest = .success("2020-03-15")
        return store
    }
}

final class CategoryPageParityTests: XCTestCase {
    override func tearDown() {
        try? BudgeerCore.shared.setLanguage("en")
        super.tearDown()
    }

    func testFiguresEqualTheWebsInBothLanguages() throws {
        let fixture = try CategoryFixture.load()
        for lang in ["en", "el"] {
            try BudgeerCore.shared.setLanguage(lang)
            for view in fixture.input.views {
                let figures = try CategoryPageFigures.compute(
                    profile: fixture.input.profile, categories: fixture.input.categories, rows: view.rows,
                    budgets: view.budgets, categoryId: view.categoryId, periodValue: view.periodValue, now: fixture.now,
                    core: .shared)
                let expected = try XCTUnwrap(fixture.expected[lang]?[view.name])
                XCTAssertEqual(figures.rows, expected.rows, "\(lang) \(view.name)")
                XCTAssertEqual(figures, expected, "\(lang) \(view.name)")
            }
        }
    }
}

@MainActor
final class CategoryPageModelTests: XCTestCase {
    private func model(_ fixture: CategoryFixture, _ view: String, store: FakeStore) -> CategoryPageModel {
        let now = fixture.now
        let chosen = fixture.view(view)
        return CategoryPageModel(categoryId: chosen.categoryId, periodValue: chosen.periodValue, data: store.data,
                                 core: .shared, now: { now })
    }

    func testReadsTheCategorysEntriesForThePeriodAndTheMonthsBudgets() async throws {
        let fixture = try CategoryFixture.load()
        let store = fixture.store("groceries")
        let page = model(fixture, "groceries", store: store)
        await page.load()
        XCTAssertEqual(page.state, .loaded(try XCTUnwrap(fixture.expected["en"]?["groceries"])))
        let read = try XCTUnwrap(store.queries.last)
        XCTAssertEqual(read.categoryId, fixture.view("groceries").categoryId)
        XCTAssertEqual(read.from, "2020-09-01")
        XCTAssertEqual(read.to, "2020-09-30")
        XCTAssertTrue(read.spread)
        XCTAssertNil(read.kind)
        XCTAssertFalse(page.periods.isEmpty)
        XCTAssertEqual(page.budgetText, "100.00")
        XCTAssertNotNil(page.row(id: "g1"))
    }

    func testTheUncategorisedBucketReadsThePeriodsExpenses() async throws {
        let fixture = try CategoryFixture.load()
        let store = fixture.store("none")
        let page = model(fixture, "none", store: store)
        await page.load()
        let read = try XCTUnwrap(store.queries.last)
        XCTAssertNil(read.categoryId)
        XCTAssertEqual(read.kind, "expense")
        XCTAssertEqual(page.figures?.rows?.map(\.id), ["n1"])
    }

    func testChangingThisMonthsCapClearingItAndNothingChanged() async throws {
        let fixture = try CategoryFixture.load()
        let store = fixture.store("groceries")
        let page = model(fixture, "groceries", store: store)
        await page.load()
        page.toggleEdit()
        page.setBudgetText("120")
        let saved1 = await page.saveBudget()
        XCTAssertTrue(saved1)
        XCTAssertEqual(store.budgetEdits.last?.amountMinor, 12000)
        XCTAssertEqual(store.budgetEdits.last?.period, "2020-09-01")
        XCTAssertEqual(page.message, "Saved")
        XCTAssertFalse(page.editing)

        page.toggleEdit()
        page.setBudgetText("")
        let saved2 = await page.saveBudget()
        XCTAssertTrue(saved2)
        XCTAssertEqual(store.budgetDeletes.last?.period, "2020-09-01")

        page.toggleEdit()
        let saved3 = await page.saveBudget()
        XCTAssertTrue(saved3)
        XCTAssertEqual(page.message, "Nothing to save")
        XCTAssertEqual(store.budgetEdits.count, 1)
        XCTAssertEqual(store.budgetDeletes.count, 1)
    }

    func testAPastMonthsCapCantChangeHere() async throws {
        let fixture = try CategoryFixture.load()
        let store = fixture.store("pastMonth")
        let page = model(fixture, "pastMonth", store: store)
        await page.load()
        XCTAssertEqual(page.figures?.canEditBudget, false)
        let saved = await page.saveBudget()
        XCTAssertFalse(saved)
        XCTAssertTrue(store.budgetEdits.isEmpty)
    }

    func testAnotherPeriodReadsAgain() async throws {
        let fixture = try CategoryFixture.load()
        let store = fixture.store("groceries")
        let page = model(fixture, "groceries", store: store)
        await page.load()
        await page.setPeriod("y:2020")
        XCTAssertEqual(page.periodValue, "y:2020")
        XCTAssertEqual(store.queries.last?.from, "2020-01-01")
        XCTAssertEqual(page.figures?.budget?.state, "monthly")
    }

    func testAnUnknownCategorySaysItCantBeFound() async throws {
        let fixture = try CategoryFixture.load()
        let page = model(fixture, "missing", store: fixture.store("missing"))
        await page.load()
        XCTAssertEqual(page.figures?.found, false)
        XCTAssertEqual(page.figures?.title, "Category not found")
    }
}

final class AppPathsTests: XCTestCase {
    func testTheWebsAddressesAsTabsAndPages() {
        XCTAssertEqual(AppPaths.place("/"), AppPaths.Place(tab: .home, routes: []))
        XCTAssertEqual(AppPaths.place("/budgets"), AppPaths.Place(tab: .home, routes: [.budgets]))
        XCTAssertEqual(AppPaths.place("/recurring"), AppPaths.Place(tab: .more, routes: [.recurring]))
        XCTAssertEqual(AppPaths.place("/insights/salary"), AppPaths.Place(tab: .more, routes: [.insights, .salary]))
        XCTAssertEqual(AppPaths.place("/groups/g1"), AppPaths.Place(tab: .groups, routes: [.group("g1")]))
        XCTAssertEqual(AppPaths.place("/settings/ai"), AppPaths.Place(tab: .more, routes: [.settings, .aiHelpers]))
        XCTAssertEqual(AppPaths.place("/settings/vouchers"), AppPaths.Place(tab: .more, routes: [.settings, .voucherSetup]))
        XCTAssertEqual(AppPaths.place("/help"), AppPaths.Place(tab: .more, routes: [.settings, .help(nil)]))
        XCTAssertEqual(AppPaths.route("/help#bank-import"), .help("bank-import"))
        XCTAssertNil(AppPaths.place("/import"))
        XCTAssertNil(AppPaths.place("/settings/nowhere"))
    }

    func testACategoryLinkCarriesItsPeriod() {
        XCTAssertEqual(AppPaths.route("/categories/c1?period=m%3A2020-9"), .categoryPage("c1", "m:2020-9"))
        XCTAssertEqual(AppPaths.route("/categories/none"), .categoryPage("none", nil))
        XCTAssertNil(AppPaths.route(nil))
    }

    func testEveryWhatsNewActionOpensAPage() throws {
        let story = try BudgeerCore.shared.json("whatsNewMath", "storyFor", [["seenId": .null,
                                                                               "onboardedAt": "2020-01-01T00:00:00Z"] as JSONValue])
        for page in story["story"]?["pages"]?.arrayValue ?? [] {
            if let to = page["action"]?["to"]?.stringValue { XCTAssertNotNil(AppPaths.place(to), to) }
        }
    }
}
