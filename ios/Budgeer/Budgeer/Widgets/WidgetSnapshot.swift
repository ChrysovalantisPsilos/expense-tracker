// What the widgets show, as the app leaves it for them: this month's
// figures already worked out and worded by the core (WidgetSync, in the
// app), kept in the App Group's shared defaults on this iPhone only, and
// read by the widget extension, which runs no core, no network and no
// sign-in. Compiled into the app and the extension alike.
import Foundation

/// This month's overview, its By category and its budgets, every string as
/// the app's core wrote it in the app's language.
struct WidgetSnapshot: Codable, Equatable, Sendable {
    /// A share of the spending (categoryBars' top three, then "Other").
    struct Bar: Codable, Equatable, Sendable {
        let label: String
        let amount: String
        /// A whole percent; the bars add up to 100.
        let share: Int
        /// kitMath.shareSwatch's token for its place (Theme.swatch).
        let swatch: String
    }

    /// A budget as Home's Budgets card shows it (budgetMath.budgetRowParts).
    struct Budget: Codable, Equatable, Sendable {
        let name: String
        /// "€312.40 of €400.00".
        let meta: String
        /// "78%".
        let valueLabel: String
        /// Spend as a whole percent of the cap (the bar's length, unclamped).
        let percent: Int
        /// The bar's tone: nil (brand), 'warning' from 80%, 'negative' over.
        let tone: String?
    }

    /// When the app wrote it.
    let written: Date
    /// The month it is for (periods.thisMonthPeriod's from and to, ISO days).
    let from: String
    let to: String
    /// The language its words are in ('en', 'el').
    let language: String
    let spent: String
    let income: String
    /// Signed (formatSigned), coloured by `netTone` (kitMath.signTone).
    let net: String
    let netTone: String
    let bars: [Bar]
    /// The large widgets' By category: the top five, then "Other" (nil in a
    /// snapshot written before there were large widgets).
    var wideBars: [Bar]? = nil
    /// The extra-large widget's Budgets (Home's card, its first four), and
    /// the card's words when the month has none (nil before they're read).
    var budgets: [Budget]? = nil
    var budgetsEmpty: String? = nil

    /// Whether `day` (an ISO day, yyyy-MM-dd) falls in its month: anything
    /// else shows "open the app" rather than an old month's figures.
    func covers(_ day: String) -> Bool {
        from <= day && day <= to
    }

    /// The same figures and words (when it was written aside).
    func sameAs(_ other: WidgetSnapshot) -> Bool {
        from == other.from && to == other.to && language == other.language && spent == other.spent
            && income == other.income && net == other.net && netTone == other.netTone && bars == other.bars
            && wideBars == other.wideBars && budgets == other.budgets && budgetsEmpty == other.budgetsEmpty
    }

    /// `date` as the calendar day the phone is on (yyyy-MM-dd).
    static func isoDay(_ date: Date, calendar: Calendar = .current) -> String {
        let parts = calendar.dateComponents([.year, .month, .day], from: date)
        return String(format: "%04d-%02d-%02d", parts.year ?? 0, parts.month ?? 0, parts.day ?? 0)
    }
}

/// Where the snapshot lives: the App Group's shared defaults
/// (group.com.budgeer.app, or .dev, from the build's BUDGEER_APP_GROUP).
struct WidgetShelf {
    static let key = "budgeer.widget.month"
    /// The widgets' kinds (WidgetKit's), reloaded after each write.
    static let monthKind = "budgeer.month"
    static let addKind = "budgeer.add"

    let defaults: UserDefaults?

    /// This build's App Group, from Info.plist (BudgeerAppGroup).
    static var shared: WidgetShelf {
        let group = Bundle.main.object(forInfoDictionaryKey: "BudgeerAppGroup") as? String
        return WidgetShelf(defaults: group.flatMap { $0.isEmpty ? nil : UserDefaults(suiteName: $0) })
    }

    func read() -> WidgetSnapshot? {
        guard let data = defaults?.data(forKey: WidgetShelf.key) else { return nil }
        return try? JSONDecoder().decode(WidgetSnapshot.self, from: data)
    }

    func write(_ snapshot: WidgetSnapshot) {
        guard let data = try? JSONEncoder().encode(snapshot) else { return }
        defaults?.set(data, forKey: WidgetShelf.key)
    }

    /// Signed out (or the account deleted): nothing of it stays on the phone.
    func clear() {
        defaults?.removeObject(forKey: WidgetShelf.key)
    }
}

/// Where a widget's tap leads: budgeer://app<web path>, the web's own
/// addresses (AppPaths): Home, and Add as a new expense (addLinks'
/// /transactions/new).
enum WidgetLinks {
    static let host = "app"
    static let home = URL(string: "budgeer://app/")!
    static let add = URL(string: "budgeer://app/transactions/new")!

    /// The web path a widget's link names, or nil for any other URL.
    static func path(_ url: URL) -> String? {
        guard url.scheme == "budgeer", url.host == host,
              let parts = URLComponents(url: url, resolvingAgainstBaseURL: false) else { return nil }
        let path = parts.path.isEmpty ? "/" : parts.path
        return parts.query.map { "\(path)?\($0)" } ?? path
    }
}
