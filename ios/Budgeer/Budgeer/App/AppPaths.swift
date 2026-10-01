// The website's addresses as the app's places: a tab and the pages pushed
// on it. Where a notification, a What's new action, the tour's stops and a
// category link (categoryLinks: "/categories/<id>?period=m%3A2026-9") lead.
// Only the pages the app has are here; any other address opens nothing.
import Foundation

enum AppPaths {
    struct Place: Equatable {
        let tab: NativeTab
        let routes: [AppRoute]
    }

    /// Settings' pages by their web address (/settings/<name>).
    private static let settings: [String: AppRoute] = [
        "account": .account, "notifications": .messages, "appearance": .appearance, "language": .language,
        "spending": .spending, "vouchers": .voucherSetup, "ai": .aiHelpers, "categories": .categoryList,
        "security": .security, "privacy": .privacy, "whats-new": .whatsNew,
        "import-rules": .importRules, "data": .yourData,
    ]

    /// The tabs' first pages and the pages under More, by their web address.
    private static let pages: [String: Place] = [
        "": Place(tab: .home, routes: []),
        "budgets": Place(tab: .home, routes: [.budgets]),
        "transactions": Place(tab: .activity, routes: []),
        "import": Place(tab: .activity, routes: [.importStatement]),
        "groups": Place(tab: .groups, routes: []),
        "more": Place(tab: .more, routes: []),
        "recurring": Place(tab: .more, routes: [.recurring]),
        "plan": Place(tab: .more, routes: [.plan]),
        "insights": Place(tab: .more, routes: [.insights]),
        "savings": Place(tab: .more, routes: [.savings]),
        "vouchers": Place(tab: .more, routes: [.vouchers]),
        "settings": Place(tab: .more, routes: [.settings]),
    ]

    /// Where `path` (a web address, its query included) opens, or nil.
    static func place(_ path: String) -> Place? {
        guard let components = URLComponents(string: path) else { return nil }
        let parts = components.path.split(separator: "/").map(String.init)
        let query = components.queryItems ?? []
        switch parts.count {
        case 0, 1:
            if parts.first == "help" { return Place(tab: .more, routes: [.settings, .help(components.fragment)]) }
            return pages[parts.first ?? ""]
        case 2:
            switch parts[0] {
            case "insights" where parts[1] == "salary":
                return Place(tab: .more, routes: [.insights, .salary])
            case "groups":
                return Place(tab: .groups, routes: [parts[1] == "new" ? .newGroup : .group(parts[1])])
            case "categories":
                let period = query.first(where: { $0.name == "period" })?.value
                return Place(tab: .home, routes: [.categoryPage(parts[1], period)])
            case "settings":
                return settings[parts[1]].map { Place(tab: .more, routes: [.settings, $0]) }
            default:
                return nil
            }
        case 3 where parts == ["settings", "privacy", "request"]:
            return Place(tab: .more, routes: [.settings, .privacy, .privacyRequest])
        case 3 where parts == ["settings", "data", "export"]:
            return Place(tab: .more, routes: [.settings, .yourData, .exportBackup])
        case 3 where parts == ["settings", "data", "restore"]:
            return Place(tab: .more, routes: [.settings, .yourData, .restoreBackup])
        default:
            return nil
        }
    }

    /// The kind of a new entry when `path` is Add's (addLinks' /transactions/new,
    /// `kind=income` or the expense it defaults to), or nil.
    static func addKind(_ path: String) -> String? {
        guard let components = URLComponents(string: path), components.path == "/transactions/new" else { return nil }
        return components.queryItems?.first(where: { $0.name == "kind" })?.value == "income" ? "income" : "expense"
    }

    /// The page a link inside a tab pushes (the place's last page), or nil.
    static func route(_ path: String?) -> AppRoute? {
        path.flatMap { place($0)?.routes.last }
    }
}
