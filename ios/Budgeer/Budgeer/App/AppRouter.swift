// Where the signed-in app is: in the tabs' frame, the tab and each tab's
// pushed pages; beside the sidebar (a regular-width window), the section,
// what's picked in Activity's and Groups' lists and the pages pushed over
// it. A window that changes width keeps its place (`adapt(to:)`, through
// AppLayoutRules). Also the open Add sheet, where a link or a notification
// leads (AppPaths), and the keyboard's ⌘N and ⌘F (AppCommands).
import SwiftUI

@MainActor
@Observable
final class AppRouter {
    private(set) var layout: AppLayout = .tabs
    var tab: NativeTab = .home
    var home: [AppRoute] = []
    var activity: [AppRoute] = []
    var groups: [AppRoute] = []
    var more: [AppRoute] = []
    /// The sidebar's section and the pages pushed over its page.
    private(set) var section: SidebarSection = .home
    var detail: [AppRoute] = []
    /// What's picked in the sidebar's Groups and Activity lists.
    private(set) var pickedGroup: String?
    private(set) var pickedEntry: String?
    /// Meal vouchers are set up: their place joins the sidebar (and ⌘'s numbers).
    var vouchersOn = false
    var add: AddRequest?
    /// The kind of entry a link asked Add for ('expense', 'income'), until the frame opens it.
    var addKind: String?
    /// ⌘N and ⌘F, counted so the frame and Activity act on each press.
    private(set) var addPresses = 0
    private(set) var searchPresses = 0
    /// Each tab's Add slot: what Add does while a page there lends it (AddSlot).
    let slots: [NativeTab: AddSlot] = [.home: AddSlot(), .activity: AddSlot(), .groups: AddSlot(), .more: AddSlot()]
    /// The sidebar's one Add slot (its pages lend the toolbar's Add theirs).
    let wideSlot = AddSlot()

    /// The Add slot of what's on screen.
    var slot: AddSlot? { layout == .sidebar ? wideSlot : slots[tab == .add ? .home : tab] }

    /// The sidebar's items (Settings aside), in order.
    var sections: [SidebarSection] { SidebarSection.items(vouchers: vouchersOn) }

    /// Where you are, as the sidebar's section (in the tabs' frame: the tab's page).
    var currentSection: SidebarSection {
        layout == .sidebar ? section : AppLayoutRules.wide(tab: tab, routes: routes(of: tab)).section
    }

    /// A tab's pushed pages.
    func routes(of tab: NativeTab) -> [AppRoute] {
        switch tab {
        case .home, .add: return home
        case .activity: return activity
        case .groups: return groups
        case .more: return more
        }
    }

    private func setRoutes(_ routes: [AppRoute], of tab: NativeTab) {
        switch tab {
        case .home, .add: home = routes
        case .activity: activity = routes
        case .groups: groups = routes
        case .more: more = routes
        }
    }

    /// A place in the tabs' frame: its tab, at its pages.
    private func go(to place: AppPaths.Place) {
        tab = place.tab
        setRoutes(place.routes, of: place.tab)
    }

    /// A place beside the sidebar: its section, the group picked, its pages.
    private func go(to place: WidePlace) {
        if place.section != section { pickedEntry = nil }
        section = place.section
        if place.section == .groups { pickedGroup = place.group }
        detail = place.routes
    }

    /// The window changed width: the same place in the other frame.
    func adapt(to layout: AppLayout) {
        guard layout != self.layout else { return }
        switch layout {
        case .sidebar:
            go(to: AppLayoutRules.wide(tab: tab, routes: routes(of: tab)))
        case .tabs:
            go(to: AppLayoutRules.narrow(WidePlace(section: section, group: pickedGroup, routes: detail)))
        }
        self.layout = layout
    }

    /// A section from the sidebar or ⌘1…⌘9 at its first page (in the tabs'
    /// frame: the tab it lives under, at that page). Groups keeps the group
    /// picked in its list.
    func go(_ section: SidebarSection) {
        switch layout {
        case .sidebar:
            go(to: WidePlace(section: section, group: section == .groups ? pickedGroup : nil))
        case .tabs:
            go(to: AppLayoutRules.narrow(WidePlace(section: section)))
        }
    }

    /// A group picked in the sidebar's Groups list (nil: none).
    func pick(group id: String?) {
        pickedGroup = id
        detail = []
    }

    /// An entry picked in the sidebar's Activity list (nil: none).
    func pick(entry id: String?) {
        pickedEntry = id
        detail = []
    }

    /// ⌘N: Add (the frame opens what the page on top lends it).
    func pressAdd() { addPresses += 1 }

    /// ⌘F: Activity's search, opening Activity first.
    func pressSearch() {
        if currentSection != .activity || (layout == .tabs && !activity.isEmpty) { go(.activity) }
        searchPresses += 1
    }

    /// Push a page where you are.
    func push(_ route: AppRoute) {
        if layout == .sidebar {
            detail.append(route)
        } else {
            setRoutes(routes(of: tab) + [route], of: tab)
        }
    }

    /// Your initials (or the sidebar's profile): Settings.
    func openSettings() {
        go(.settings)
    }

    /// The bell: the notifications, pushed where you are.
    func openBell() {
        push(.notifications)
    }

    /// An invite link opened from outside: the join page on Groups.
    func openJoin(_ token: String) {
        if layout == .sidebar {
            go(to: WidePlace(section: .groups, routes: [.join(token)]))
        } else {
            go(to: AppPaths.Place(tab: .groups, routes: [.join(token)]))
        }
    }

    /// A group just made or joined: its page.
    func showGroup(_ id: String) {
        if layout == .sidebar {
            go(to: WidePlace(section: .groups, group: id))
        } else {
            go(to: AppPaths.Place(tab: .groups, routes: [.group(id)]))
        }
    }

    /// The group is gone for you (left or deleted): back to the list.
    func closeGroup() {
        if layout == .sidebar {
            pick(group: nil)
        } else {
            groups = []
        }
    }

    /// Home with every tab back at its first page and nothing picked (after
    /// Start fresh: the pages showed what's gone).
    func startOver() {
        home = []
        activity = []
        groups = []
        more = []
        detail = []
        pickedGroup = nil
        pickedEntry = nil
        tab = .home
        section = .home
    }

    /// Activity at its first page (an import's "View transactions", Privacy's link).
    func showActivity() {
        go(.activity)
        pickedEntry = nil
    }

    /// A web path (a notification's, bellMath.notificationPath; What's new's
    /// actions; the tour's stops; a widget's) as a tab and its pages
    /// (AppPaths), or as the sidebar's place; or Add (/transactions/new).
    func open(path: String) {
        if let kind = AppPaths.addKind(path) {
            addKind = kind
            return
        }
        guard let place = AppPaths.place(path) else { return }
        if layout == .sidebar {
            go(to: AppLayoutRules.wide(tab: place.tab, routes: place.routes))
        } else {
            go(to: place)
        }
    }
}

/// The router of the window in front, for the keyboard's commands (AppCommands).
struct AppRouterKey: FocusedValueKey {
    typealias Value = AppRouter
}

extension FocusedValues {
    var appRouter: AppRouter? {
        get { self[AppRouterKey.self] }
        set { self[AppRouterKey.self] = newValue }
    }
}

/// What a first page shows in its bar's trailing corner: on a phone (and a
/// narrow window) the bell and your initials; beside the sidebar the bell
/// and Add (your profile is the sidebar's foot); nothing on a list beside
/// its page (Activity's, whose page carries them).
struct PageChrome {
    enum Style {
        case phone
        case wide
        case none
    }

    let initials: String
    /// Your picture (the photo, or the initials in the accent).
    var avatar: Avatar? = nil
    /// The bell's badge words (bellMath.badgeText), nil with nothing unread.
    let badge: String?
    let onBell: () -> Void
    let onProfile: () -> Void
    var style: Style = .phone
    /// Beside the sidebar: the bar's Add.
    var onAdd: () -> Void = {}

    /// A list's column beside its page: no corner items.
    static let hidden = PageChrome(initials: "", badge: nil, onBell: {}, onProfile: {}, style: .none)

    /// The same corner beside the sidebar: the bell and Add.
    func wide(onAdd: @escaping () -> Void) -> PageChrome {
        var chrome = self
        chrome.style = .wide
        chrome.onAdd = onAdd
        return chrome
    }
}

extension View {
    @ViewBuilder func pageChrome(_ chrome: PageChrome) -> some View {
        switch chrome.style {
        case .phone:
            toolbar {
                NativeAccountItems(initials: chrome.initials, avatar: chrome.avatar, badge: chrome.badge, onBell: chrome.onBell,
                                   onProfile: chrome.onProfile)
            }
        case .wide:
            toolbar { NativeWideItems(badge: chrome.badge, onBell: chrome.onBell, onAdd: chrome.onAdd) }
        case .none:
            self
        }
    }
}
