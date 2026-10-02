// The frame by the window's width (AppLayout): a regular-width window gets
// the sidebar, a compact one the tab bar; the sidebar's items in the
// website's words and their order (Meal vouchers once set up, Settings at
// the foot), the keyboard's numbers; and a window changing width keeps the
// place you were at, both ways (AppRouter.adapt, AppLayoutRules), with the
// group picked and the pages pushed over it. The keyboard's commands
// (⌘N, ⌘F, ⌘1…⌘9, ⌘,) act through the router in either frame.
import XCTest
@testable import Budgeer

@MainActor
final class AppLayoutTests: XCTestCase {
    func testTheWindowsWidthPicksTheFrame() {
        XCTAssertEqual(AppLayout.of(regular: true), .sidebar)
        XCTAssertEqual(AppLayout.of(regular: false), .tabs)
        let router = AppRouter()
        XCTAssertEqual(router.layout, .tabs)
        router.adapt(to: .sidebar)
        XCTAssertEqual(router.layout, .sidebar)
        // Its own Add slot beside the sidebar; the tab's in the tab bar.
        XCTAssertTrue(router.slot === router.wideSlot)
        router.adapt(to: .tabs)
        XCTAssertEqual(router.layout, .tabs)
        XCTAssertTrue(router.slot === router.slots[.home])
    }

    func testTheSidebarsItemsInTheWebsitesOrder() {
        XCTAssertEqual(SidebarSection.items(vouchers: false),
                       [.home, .activity, .groups, .budgets, .insights, .savings, .recurring, .plan])
        XCTAssertEqual(SidebarSection.items(vouchers: true),
                       [.home, .activity, .groups, .budgets, .insights, .savings, .recurring, .plan, .vouchers])
        // Two blocks, as the website's sidebar draws them (PRIMARY, SECONDARY); Settings is the foot's.
        XCTAssertEqual(SidebarSection.blocks(SidebarSection.items(vouchers: true)),
                       [[.home, .activity, .groups, .budgets], [.insights, .savings, .recurring, .plan, .vouchers]])
        XCTAssertEqual(SidebarSection.blocks(SidebarSection.items(vouchers: false)).last, [.insights, .savings, .recurring, .plan])
        // The web's words (the shell's nav), Activity as the app's tab calls it.
        XCTAssertEqual(SidebarSection.home.titleKey, "shell:nav.home")
        XCTAssertEqual(SidebarSection.activity.titleKey, "ios:native.tabs.activity")
        XCTAssertEqual(SidebarSection.vouchers.titleKey, "shell:nav.vouchers")
        XCTAssertEqual(SidebarSection.settings.titleKey, "shell:nav.settings")
        for section in SidebarSection.allCases {
            XCTAssertNotEqual(L10n.string(section.titleKey, lang: "en"), section.titleKey, section.rawValue)
            XCTAssertNotEqual(L10n.string(section.titleKey, lang: "el"), L10n.string(section.titleKey, lang: "en"),
                              section.rawValue)
        }
        // Only Activity and Groups put a list beside their page.
        XCTAssertEqual(SidebarSection.allCases.filter(\.hasList), [.activity, .groups])
        // The pages each place opens.
        XCTAssertEqual(SidebarSection.of(.budgets), .budgets)
        XCTAssertEqual(SidebarSection.of(.settings), .settings)
        XCTAssertNil(SidebarSection.of(.categoryList))
        XCTAssertNil(SidebarSection.home.route)
    }

    func testTheKeyboardsNumbersFollowTheSidebar() {
        let items = SidebarSection.items(vouchers: true)
        XCTAssertEqual(items.map { SidebarSection.shortcut($0, in: items) },
                       ["1", "2", "3", "4", "5", "6", "7", "8", "9"])
        XCTAssertEqual(SidebarSection.shortcut(.settings, in: items), ",")
        let without = SidebarSection.items(vouchers: false)
        XCTAssertNil(SidebarSection.shortcut(.vouchers, in: without))
        XCTAssertEqual(SidebarSection.shortcut(.plan, in: without), "8")
        XCTAssertEqual(SidebarSection.shortcut(.insights, in: without), "5")
    }

    func testTabsBecomeTheSidebarsPlaces() {
        XCTAssertEqual(AppLayoutRules.wide(tab: .home, routes: []), WidePlace(section: .home))
        XCTAssertEqual(AppLayoutRules.wide(tab: .home, routes: [.budgets, .categoryPage("c1", nil)]),
                       WidePlace(section: .budgets, routes: [.categoryPage("c1", nil)]))
        XCTAssertEqual(AppLayoutRules.wide(tab: .home, routes: [.categoryPage("c1", nil)]),
                       WidePlace(section: .home, routes: [.categoryPage("c1", nil)]))
        XCTAssertEqual(AppLayoutRules.wide(tab: .activity, routes: [.importStatement]),
                       WidePlace(section: .activity, routes: [.importStatement]))
        XCTAssertEqual(AppLayoutRules.wide(tab: .groups, routes: [.group("g1"), .notifications]),
                       WidePlace(section: .groups, group: "g1", routes: [.notifications]))
        XCTAssertEqual(AppLayoutRules.wide(tab: .groups, routes: [.newGroup]), WidePlace(section: .groups, routes: [.newGroup]))
        XCTAssertEqual(AppLayoutRules.wide(tab: .more, routes: [.settings, .security]),
                       WidePlace(section: .settings, routes: [.security]))
        XCTAssertEqual(AppLayoutRules.wide(tab: .more, routes: [.plan]), WidePlace(section: .plan))
        // More's own list has no page beside a sidebar: Home.
        XCTAssertEqual(AppLayoutRules.wide(tab: .more, routes: []), WidePlace(section: .home))
    }

    func testTheSidebarsPlacesBecomeTabsWhereAppPathsKeepsThem() {
        for section in SidebarSection.allCases {
            let place = AppLayoutRules.narrow(WidePlace(section: section))
            // The same tab and page a link to it opens (AppPaths).
            let web = ["home": "/", "activity": "/transactions", "groups": "/groups", "budgets": "/budgets",
                       "recurring": "/recurring", "plan": "/plan", "insights": "/insights", "savings": "/savings",
                       "vouchers": "/vouchers", "settings": "/settings"][section.rawValue]
            XCTAssertEqual(place, AppPaths.place(web ?? ""), section.rawValue)
        }
        XCTAssertEqual(AppLayoutRules.narrow(WidePlace(section: .groups, group: "g1", routes: [.notifications])),
                       AppPaths.Place(tab: .groups, routes: [.group("g1"), .notifications]))
        // Round trips keep the place.
        let places: [(NativeTab, [AppRoute])] = [
            (.home, []), (.home, [.budgets]), (.activity, [.importStatement]), (.groups, [.group("g1")]),
            (.more, [.settings, .account]), (.more, [.savings, .goal("x")]), (.home, [.categoryPage("c", "m:2026-9")]),
        ]
        for (tab, routes) in places {
            XCTAssertEqual(AppLayoutRules.narrow(AppLayoutRules.wide(tab: tab, routes: routes)),
                           AppPaths.Place(tab: tab, routes: routes), "\(tab) \(routes)")
        }
    }

    func testChangingWidthKeepsYourPlace() {
        let router = AppRouter()
        // A group's balances on the phone's frame...
        router.tab = .groups
        router.groups = [.group("g1"), .notifications]
        router.adapt(to: .sidebar)
        // ...is the group picked beside the list, the page still pushed.
        XCTAssertEqual(router.section, .groups)
        XCTAssertEqual(router.pickedGroup, "g1")
        XCTAssertEqual(router.detail, [.notifications])
        XCTAssertEqual(router.currentSection, .groups)
        // Going on beside the sidebar: Plan, then a page over it.
        router.go(.plan)
        router.push(.recurring)
        router.adapt(to: .tabs)
        XCTAssertEqual(router.tab, .more)
        XCTAssertEqual(router.more, [.plan, .recurring])
        XCTAssertEqual(router.currentSection, .plan)
        // Wide again: Plan with Recurring over it.
        router.adapt(to: .sidebar)
        XCTAssertEqual(router.section, .plan)
        XCTAssertEqual(router.detail, [.recurring])
        // The same width twice changes nothing.
        router.adapt(to: .sidebar)
        XCTAssertEqual(router.detail, [.recurring])
    }

    func testPickingInTheListsAndGoingBack() {
        let router = AppRouter()
        router.adapt(to: .sidebar)
        router.go(.groups)
        router.pick(group: "g2")
        router.push(.notifications)
        XCTAssertEqual(router.detail, [.notifications])
        // Another group: its page, nothing over it.
        router.pick(group: "g3")
        XCTAssertEqual(router.detail, [])
        // Groups again from the sidebar keeps the group picked.
        router.go(.home)
        router.go(.groups)
        XCTAssertEqual(router.pickedGroup, "g3")
        router.closeGroup()
        XCTAssertNil(router.pickedGroup)
        // An entry picked in Activity goes when Activity does.
        router.go(.activity)
        router.pick(entry: "t1")
        XCTAssertEqual(router.pickedEntry, "t1")
        router.go(.budgets)
        XCTAssertNil(router.pickedEntry)
        // A new group opens beside the list.
        router.showGroup("g9")
        XCTAssertEqual(router.section, .groups)
        XCTAssertEqual(router.pickedGroup, "g9")
    }

    func testLinksSettingsAndTheBellInEitherFrame() {
        let narrow = AppRouter()
        narrow.open(path: "/settings/security")
        XCTAssertEqual(narrow.tab, .more)
        XCTAssertEqual(narrow.more, [.settings, .security])
        narrow.openSettings()
        XCTAssertEqual(narrow.more, [.settings])
        narrow.openBell()
        XCTAssertEqual(narrow.more, [.settings, .notifications])
        narrow.openJoin("tok")
        XCTAssertEqual(narrow.tab, .groups)
        XCTAssertEqual(narrow.groups, [.join("tok")])

        let wide = AppRouter()
        wide.adapt(to: .sidebar)
        wide.open(path: "/settings/security")
        XCTAssertEqual(wide.section, .settings)
        XCTAssertEqual(wide.detail, [.security])
        wide.open(path: "/groups/g5")
        XCTAssertEqual(wide.section, .groups)
        XCTAssertEqual(wide.pickedGroup, "g5")
        XCTAssertEqual(wide.detail, [])
        wide.openBell()
        XCTAssertEqual(wide.detail, [.notifications])
        wide.openSettings()
        XCTAssertEqual(wide.section, .settings)
        XCTAssertEqual(wide.detail, [])
        wide.openJoin("tok")
        XCTAssertEqual(wide.section, .groups)
        XCTAssertEqual(wide.detail, [.join("tok")])
        // Add's link still asks the frame for Add.
        wide.open(path: "/transactions/new?kind=income")
        XCTAssertEqual(wide.addKind, "income")
    }

    func testTheKeyboardsCommands() {
        let router = AppRouter()
        router.vouchersOn = true
        XCTAssertEqual(router.sections.last, .vouchers)
        // ⌘3 on the phone's frame: the Groups tab at its list; ⌘5: Recurring under More.
        router.go(.groups)
        XCTAssertEqual(router.tab, .groups)
        router.go(.recurring)
        XCTAssertEqual(router.tab, .more)
        XCTAssertEqual(router.more, [.recurring])
        // ⌘F: Activity at its list, and a press for its search field.
        router.activity = [.importStatement]
        router.pressSearch()
        XCTAssertEqual(router.tab, .activity)
        XCTAssertEqual(router.activity, [])
        XCTAssertEqual(router.searchPresses, 1)
        // ⌘N: a press for the frame's Add.
        router.pressAdd()
        router.pressAdd()
        XCTAssertEqual(router.addPresses, 2)
        // Beside the sidebar: ⌘F from Budgets opens Activity; again there, only the field.
        router.adapt(to: .sidebar)
        router.go(.budgets)
        router.pressSearch()
        XCTAssertEqual(router.section, .activity)
        router.pick(entry: "t1")
        router.pressSearch()
        XCTAssertEqual(router.pickedEntry, "t1")
        XCTAssertEqual(router.searchPresses, 3)
        // ⌘, : Settings.
        router.go(.settings)
        XCTAssertEqual(router.section, .settings)
    }
}
