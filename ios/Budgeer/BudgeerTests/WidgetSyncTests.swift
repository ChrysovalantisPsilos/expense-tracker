// The widgets' snapshot: Home's fixture through the core gives this month's
// overview and By category's top three and "Other" (the figures the web's
// functions wrote for Home), always for this month; written from the app's
// own reads over the fake store and from Home's this-month reads, kept
// unchanged when nothing changed; the month check; cleared on sign-out; and
// the widgets' links (Home, Add as an expense).
import XCTest
import BudgeerCore
@testable import Budgeer

@MainActor
final class WidgetSyncTests: XCTestCase {
    private var defaults: UserDefaults!
    private var shelf: WidgetShelf!
    private var reloads = 0

    override func setUpWithError() throws {
        try super.setUpWithError()
        try BudgeerCore.shared.setLanguage("en")
        defaults = UserDefaults(suiteName: "WidgetSyncTests")
        defaults.removePersistentDomain(forName: "WidgetSyncTests")
        shelf = WidgetShelf(defaults: defaults)
        reloads = 0
    }

    override func tearDown() {
        try? BudgeerCore.shared.setLanguage("en")
        defaults.removePersistentDomain(forName: "WidgetSyncTests")
        super.tearDown()
    }

    private func makeSync(_ store: FakeStore, _ fixture: HomeFixture) -> WidgetSync {
        let now = fixture.now
        return WidgetSync(data: store.data, core: .shared, shelf: shelf, reload: { [weak self] in self?.reloads += 1 },
                          now: { now })
    }

    func testTheSnapshotIsHomesThisMonthInBothLanguages() throws {
        let fixture = try HomeFixture.load()
        for lang in ["en", "el"] {
            try BudgeerCore.shared.setLanguage(lang)
            let home = try XCTUnwrap(fixture.thisMonth(lang))
            // Home's reads of another month still give this month's snapshot.
            for periodValue in [nil, "m:2020-9"] as [String?] {
                let snapshot = try WidgetSync.snapshot(fixture.homeInput(periodValue: periodValue), written: fixture.now,
                                                       core: .shared)
                XCTAssertEqual(snapshot.from, "2020-09-01", lang)
                XCTAssertEqual(snapshot.to, "2020-09-30", lang)
                XCTAssertEqual(snapshot.language, lang)
                XCTAssertEqual(snapshot.spent, home.spent, lang)
                XCTAssertEqual(snapshot.income, home.income, lang)
                XCTAssertEqual(snapshot.net, home.net, lang)
                XCTAssertEqual(snapshot.netTone, home.netTone, lang)
                // The top three as Home's legend has them, then the rest as "Other".
                XCTAssertEqual(snapshot.bars.count, 4, lang)
                XCTAssertEqual(snapshot.bars.prefix(3).map(\.label), home.legend.prefix(3).map(\.label), lang)
                XCTAssertEqual(snapshot.bars.prefix(3).map(\.amount), home.legend.prefix(3).map(\.amount), lang)
                XCTAssertEqual(snapshot.bars.last?.label, home.legend.last?.label, lang)
                XCTAssertEqual(snapshot.bars.map(\.share).reduce(0, +), 100, lang)
                XCTAssertEqual(snapshot.bars.map(\.swatch), ["brand.500", "amber.400", "brand.300", "text.muted"], lang)
            }
        }
        try BudgeerCore.shared.setLanguage("en")
        let en = try WidgetSync.snapshot(fixture.homeInput(), written: fixture.now, core: .shared)
        XCTAssertEqual(en.spent, "€341.28")
        XCTAssertEqual(en.net, "+€2,028.72")
        XCTAssertEqual(en.netTone, "positive")
        XCTAssertEqual(en.bars.last?.amount, "€79.00") // Transport and the rest
    }

    func testTheMonthCheck() throws {
        let fixture = try HomeFixture.load()
        let snapshot = try WidgetSync.snapshot(fixture.homeInput(), written: fixture.now, core: .shared)
        XCTAssertTrue(snapshot.covers("2020-09-01"))
        XCTAssertTrue(snapshot.covers("2020-09-30"))
        XCTAssertFalse(snapshot.covers("2020-08-31"))
        XCTAssertFalse(snapshot.covers("2020-10-01"))
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = try XCTUnwrap(TimeZone(identifier: "Europe/Brussels"))
        // 30 Sep 23:30 UTC is already 1 Oct in Brussels: a new month, so "open the app".
        let late = try XCTUnwrap(ISO8601DateFormatter().date(from: "2020-09-30T23:30:00Z"))
        XCTAssertEqual(WidgetSnapshot.isoDay(late, calendar: calendar), "2020-10-01")
        XCTAssertFalse(snapshot.covers(WidgetSnapshot.isoDay(late, calendar: calendar)))
    }

    func testRefreshWritesThisMonthOnceAndReloadsTheWidgets() async throws {
        let fixture = try HomeFixture.load()
        let store = FakeStore(home: fixture)
        let sync = makeSync(store, fixture)
        XCTAssertNil(shelf.read())
        await sync.refresh()
        // This month's rows, from the shifted salary's start, as Home reads them.
        XCTAssertEqual(store.queries.first, TxnQuery(from: "2020-08-25", to: "2020-09-30", spread: true))
        let written = try XCTUnwrap(shelf.read())
        XCTAssertTrue(written.sameAs(try WidgetSync.snapshot(fixture.homeInput(), written: fixture.now, core: .shared)))
        XCTAssertEqual(reloads, 1)
        // Nothing changed: the widgets aren't reloaded again.
        await sync.refresh()
        XCTAssertEqual(reloads, 1)
        // A new language is a change.
        try BudgeerCore.shared.setLanguage("el")
        await sync.refresh()
        XCTAssertEqual(reloads, 2)
        XCTAssertEqual(shelf.read()?.language, "el")
        XCTAssertEqual(shelf.read()?.net, try XCTUnwrap(fixture.thisMonth("el")).net)
    }

    func testHomeHandsOnlyThisMonthToTheWidgets() async throws {
        let fixture = try HomeFixture.load()
        let store = FakeStore(home: fixture)
        store.oldest = .success("2020-03-15")
        let sync = makeSync(store, fixture)
        let now = fixture.now
        let home = HomeViewModel(data: store.data, core: .shared, now: { now })
        home.onThisMonth = { sync.write($0) }
        await home.load()
        XCTAssertEqual(shelf.read()?.spent, try XCTUnwrap(fixture.thisMonth()).spent)
        XCTAssertEqual(reloads, 1)
        // August on Home: the widgets keep September.
        await home.setPeriod("m:2020-8")
        XCTAssertEqual(shelf.read()?.from, "2020-09-01")
        XCTAssertEqual(reloads, 1)
    }

    func testSigningOutClearsTheSnapshot() async throws {
        let fixture = try HomeFixture.load()
        await makeSync(FakeStore(home: fixture), fixture).refresh()
        XCTAssertNotNil(shelf.read())
        WidgetSync.signedOut(shelf: shelf, reload: { self.reloads += 1 })
        XCTAssertNil(shelf.read())
        XCTAssertEqual(reloads, 2)
        // A failed read writes nothing.
        let failing = FakeStore(home: fixture)
        failing.profileResult = .failure(URLError(.notConnectedToInternet))
        await makeSync(failing, fixture).refresh()
        XCTAssertNil(shelf.read())
    }

    func testTheWidgetsLinksAndWords() {
        XCTAssertEqual(WidgetLinks.path(WidgetLinks.home), "/")
        XCTAssertEqual(WidgetLinks.path(WidgetLinks.add), "/transactions/new")
        XCTAssertEqual(AppPaths.place(WidgetLinks.path(WidgetLinks.home) ?? ""), AppPaths.Place(tab: .home, routes: []))
        XCTAssertEqual(AppPaths.addKind("/transactions/new"), "expense")
        XCTAssertEqual(AppPaths.addKind("/transactions/new?kind=income"), "income")
        XCTAssertNil(AppPaths.addKind("/transactions"))
        XCTAssertNil(WidgetLinks.path(URL(string: "budgeer://join/abc123")!))
        XCTAssertNil(WidgetLinks.path(URL(string: "https://www.budgeer.com/transactions/new")!))
        // The + asks the frame for Add (an expense) instead of a page.
        let router = AppRouter()
        router.open(path: "/transactions/new")
        XCTAssertEqual(router.addKind, "expense")
        XCTAssertEqual(router.tab, .home)
        // The words are the web's, in the snapshot's language.
        let en = WidgetWords(language: "en")
        XCTAssertEqual(en.thisMonth, "This month")
        XCTAssertEqual(en.spent, "Spent")
        XCTAssertEqual(en.stale, "Open Budgeer to see this month")
        let el = WidgetWords(language: "el")
        XCTAssertEqual(el.thisMonth, "Αυτός ο μήνας")
        XCTAssertEqual(el.add, "Προσθήκη")
        XCTAssertNotEqual(el.stale, "ios:native.widget.stale")
    }
}
