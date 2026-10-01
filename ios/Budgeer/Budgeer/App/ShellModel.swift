// What the frame shows around the pages (AppShell): your initials for the
// picture (avatarLook.avatarInitials over the profile's name), the bell's
// feed with its unread count and badge (bellMath), when each came
// (dates.shortDateTime), and where a notification leads
// (bellMath.notificationPath), and whether the user gets meal vouchers
// (More lists their page once set up). Every rule is the web's, through
// the core; the feed is the web's table, read through the data layer.
import Foundation
import Observation
import BudgeerCore

/// One notification in the bell's list, as stored (its own words).
struct BellItem: Identifiable, Equatable, Sendable {
    let id: String
    let type: String
    let title: String
    let body: String?
    let read: Bool
    /// The web's path it opens ('/groups', '/recurring', '/groups/<id>', …), or nil.
    let path: String?
    /// When it came ("21 Sep, 14:05"; dates.shortDateTime), or nil.
    var when: String? = nil
}

@MainActor
@Observable
final class ShellModel {
    private(set) var initials = ""
    /// The profile's name (Settings' Profile row).
    private(set) var name = ""
    /// A meal vouchers setup exists (my_meal_vouchers).
    private(set) var vouchersOn = false
    private(set) var items: [BellItem] = []
    private(set) var unreadCount = 0
    /// The badge's words ("3", "9+"), nil with nothing unread.
    private(set) var badge: String?
    private(set) var failed: String?
    /// The ones that were unread when the page opened (they stay marked new there).
    private(set) var fresh: Set<String> = []

    private let data: DataLayer
    private let core: BudgeerCore
    private let now: @Sendable () -> Date

    init(data: DataLayer, core: BudgeerCore = .shared, now: @escaping @Sendable () -> Date = { Date() }) {
        self.data = data
        self.core = core
        self.now = now
    }

    /// The profile's initials, the vouchers' setup and the feed.
    func load() async {
        if let setup = try? await data.profile.mealVouchers() { vouchersOn = !setup.isNull }
        if let profile = try? await data.profile.profile() {
            let display = profile["display_name"] ?? .null
            name = display.stringValue ?? ""
            initials = (try? core.call("avatarLook", "avatarInitials", [display])) ?? ""
        }
        await loadFeed()
    }

    func loadFeed() async {
        do {
            let rows = try await data.profile.notifications()
            let list = rows.arrayValue ?? []
            let instant = now()
            items = list.map { row in
                BellItem(id: row["id"]?.stringValue ?? UUID().uuidString,
                         type: row["type"]?.stringValue ?? "",
                         title: row["title"]?.stringValue ?? "",
                         body: row["body"]?.stringValue,
                         read: !(row["read_at"]?.isNull ?? true),
                         path: (try? core.json("bellMath", "notificationPath", [row]))?.stringValue,
                         when: row["created_at"].flatMap { created in
                             (try? core.json("dates", "shortDateTime", [created, JSDate(instant)]))?.stringValue
                         })
            }
            unreadCount = (try? core.call("bellMath", "unreadCount", [rows])) ?? 0
            badge = (try? core.json("bellMath", "badgeText", [unreadCount]))?.stringValue
            failed = nil
        } catch {
            failed = String(describing: error)
        }
    }

    /// The bell opened: everything shown is read now (the web marks them at once).
    func opened() async {
        fresh = Set(items.filter { !$0.read }.map(\.id))
        guard unreadCount > 0 else { return }
        items = items.map {
            BellItem(id: $0.id, type: $0.type, title: $0.title, body: $0.body, read: true, path: $0.path, when: $0.when)
        }
        unreadCount = 0
        badge = nil
        try? await data.profile.markNotificationsRead()
    }
}
