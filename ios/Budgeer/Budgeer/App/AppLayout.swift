// Which frame the app wears, by the window's width rather than the device:
// a regular-width window (an iPad full screen or in a wide Split View or
// Stage Manager window) gets the sidebar, as the website's desktop sidebar
// (AppShell.jsx); a compact one (an iPhone, a narrow iPad window) keeps the
// floating tab bar. The sidebar's places (SidebarSection), and how a place
// in one frame becomes the same place in the other when the window changes
// size, so the page you were on stays open.
import Foundation

/// The frame: the floating tab bar, or the sidebar.
enum AppLayout: Equatable {
    case tabs
    case sidebar

    /// The frame for a window whose horizontal size class is regular (or not).
    static func of(regular: Bool) -> AppLayout { regular ? .sidebar : .tabs }
}

/// The sidebar's places, in its order: Home, Activity and Groups (the
/// tabs' own), the money pages, then Insights, Savings and Meal vouchers
/// (once set up); Settings sits at its foot with your profile.
enum SidebarSection: String, CaseIterable, Hashable, Identifiable {
    case home, activity, groups, budgets, recurring, plan, insights, savings, vouchers, settings

    var id: String { rawValue }

    var titleKey: String {
        switch self {
        case .home: return "shell:nav.home"
        case .activity: return "ios:native.tabs.activity"
        case .groups: return "shell:nav.groups"
        case .budgets: return "shell:nav.budgets"
        case .recurring: return "shell:nav.recurring"
        case .plan: return "shell:nav.plan"
        case .insights: return "shell:nav.insights"
        case .savings: return "shell:nav.savings"
        case .vouchers: return "shell:nav.vouchers"
        case .settings: return "shell:nav.settings"
        }
    }

    /// The sidebar's symbol (the website's icons' nearest SF Symbols).
    var symbol: String {
        switch self {
        case .home: return "house"
        case .activity: return "list.bullet.rectangle.portrait"
        case .groups: return "person.2"
        case .budgets: return "target"
        case .recurring: return "repeat"
        case .plan: return "plus.forwardslash.minus"
        case .insights: return "chart.line.uptrend.xyaxis"
        case .savings: return "banknote"
        case .vouchers: return "ticket"
        case .settings: return "gearshape"
        }
    }

    /// The page it opens when it is a page of the app's own (nil for Home,
    /// Activity and Groups, which the frame lays out itself).
    var route: AppRoute? {
        switch self {
        case .home, .activity, .groups: return nil
        case .budgets: return .budgets
        case .recurring: return .recurring
        case .plan: return .plan
        case .insights: return .insights
        case .savings: return .savings
        case .vouchers: return .vouchers
        case .settings: return .settings
        }
    }

    /// Activity and Groups: a list, with what's picked in it beside it.
    var hasList: Bool { self == .activity || self == .groups }

    /// The sidebar's block: 0 the tabs' places, 1 the money pages, 2 the rest.
    var block: Int {
        switch self {
        case .home, .activity, .groups: return 0
        case .budgets, .recurring, .plan: return 1
        case .insights, .savings, .vouchers: return 2
        case .settings: return 3
        }
    }

    /// The sidebar's items in order, Settings aside (it sits at the foot);
    /// Meal vouchers only once they're set up, as on the website.
    static func items(vouchers: Bool) -> [SidebarSection] {
        allCases.filter { $0 != .settings && ($0 != .vouchers || vouchers) }
    }

    /// The items split into the sidebar's blocks, in order.
    static func blocks(_ items: [SidebarSection]) -> [[SidebarSection]] {
        Dictionary(grouping: items, by: \.block).sorted { $0.key < $1.key }.map(\.value)
    }

    /// The key that opens `section` with ⌘: 1…9 for the items in order,
    /// "," for Settings (iPad's convention), nil past the ninth.
    static func shortcut(_ section: SidebarSection, in items: [SidebarSection]) -> Character? {
        if section == .settings { return "," }
        guard let index = items.firstIndex(of: section), index < 9 else { return nil }
        return Character(String(index + 1))
    }

    /// The section whose own page `route` is (Budgets → .budgets), or nil.
    static func of(_ route: AppRoute) -> SidebarSection? {
        allCases.first { $0.route == route }
    }
}

/// A place in the sidebar's frame: the section, the group picked in Groups,
/// and the pages pushed over the section's page.
struct WidePlace: Equatable {
    var section: SidebarSection
    var group: String? = nil
    var routes: [AppRoute] = []
}

/// The same place in either frame.
enum AppLayoutRules {
    /// A tab and its pushed pages as the sidebar's place: a page that is a
    /// section of its own (Budgets under Home, Plan under More) becomes that
    /// section, a group's page the group picked beside the list; More's own
    /// list has no page of its own beside a sidebar, so it shows Home.
    static func wide(tab: NativeTab, routes: [AppRoute]) -> WidePlace {
        switch tab {
        case .activity:
            return WidePlace(section: .activity, routes: routes)
        case .groups:
            if case .group(let id)? = routes.first {
                return WidePlace(section: .groups, group: id, routes: Array(routes.dropFirst()))
            }
            return WidePlace(section: .groups, routes: routes)
        case .home, .add, .more:
            if let first = routes.first, let section = SidebarSection.of(first) {
                return WidePlace(section: section, routes: Array(routes.dropFirst()))
            }
            return WidePlace(section: .home, routes: routes)
        }
    }

    /// The sidebar's place as a tab and its pages, where AppPaths keeps them
    /// (Budgets under Home; Recurring, Plan, Insights, Savings, Meal
    /// vouchers and Settings under More).
    static func narrow(_ place: WidePlace) -> AppPaths.Place {
        switch place.section {
        case .home:
            return AppPaths.Place(tab: .home, routes: place.routes)
        case .activity:
            return AppPaths.Place(tab: .activity, routes: place.routes)
        case .groups:
            return AppPaths.Place(tab: .groups, routes: (place.group.map { [AppRoute.group($0)] } ?? []) + place.routes)
        case .budgets:
            return AppPaths.Place(tab: .home, routes: [.budgets] + place.routes)
        case .recurring, .plan, .insights, .savings, .vouchers, .settings:
            return AppPaths.Place(tab: .more, routes: (place.section.route.map { [$0] } ?? []) + place.routes)
        }
    }
}
