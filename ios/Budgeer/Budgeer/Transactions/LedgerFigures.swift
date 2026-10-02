// Activity (the web's Transactions list) as LedgerPage + TransactionList
// work it out, every step a core call (the same sequence, in Node, writes
// the parity fixture: mobile-core/screenFigures.mjs ledgerFigures): the
// search (txnFilter), the heading and its line (listHeading, ledgerSummary,
// a search's net), the first-run state, the rows by day with each
// row's words (rowParts.dayGroups) and the month's header (monthPulse). Nothing is filtered, summed, grouped or
// worded here.
import Foundation
import BudgeerCore

/// One transaction as a list shows it (rowParts.rowParts).
struct EntryRow: Codable, Equatable, Identifiable, Sendable {
    let id: String
    let title: String
    /// A group's share: read-only here (edited in the group).
    let shared: Bool
    let kind: String
    let look: CategoryLook
    /// The muted line's start: date, category, where savings came from.
    let meta: [String]
    let notes: String?
    let group: String?
    let repeats: String?
    let spread: String?
    let countsFor: String?
    let amount: String
    /// 'positive' (income) or 'default'.
    let tone: String
    let approx: String?
    let rate: String?
    let estimated: String?
}

/// One day of the list (rowParts.dayGroups): "Today", what it comes to, its rows.
struct EntryDay: Codable, Equatable, Identifiable, Sendable {
    /// A day with income: its net ("+€1.00 net") in its tone.
    struct Net: Codable, Equatable, Sendable {
        let text: String
        let tone: String
    }
    let key: String
    let title: String
    /// "€45.55 spent" on a day that only spent; nil without an expense, or with income (`net`).
    let spent: String?
    let net: Net?
    let rows: [EntryRow]
    var id: String { key }
}

/// The box under an entry (categoryMath.entryCategoryBox): its category in
/// the month it was paid ("Groceries · This month"), the category page's
/// link, that month's budget bar when it has one, and the category's other
/// entries that month, newest first, or the words for none.
struct EntryCategoryBox: Codable, Equatable, Sendable {
    /// categoryBudget's bar: "€152.60 of €250.00", the percent, the tone.
    struct Budget: Codable, Equatable, Sendable {
        let title: String
        let meta: String
        let percent: Int
        /// "61%".
        let valueLabel: String
        let tone: String?
        let over: Bool
    }
    struct Other: Codable, Equatable, Identifiable, Sendable {
        let id: String
        let name: String
        let date: String
        let amount: String
    }
    let title: String
    /// The category's page for the month (/categories/<id>?period=…; AppPaths).
    let path: String
    let seeAll: String
    let budget: Budget?
    let others: [Other]
    let empty: String?
}

/// The month at a glance over the list (rowParts.monthPulse): spent,
/// income and net in their words, a bar per day.
struct MonthPulse: Codable, Equatable, Sendable {
    struct Figure: Codable, Equatable, Sendable {
        let label: String
        let amount: String
    }
    struct Net: Codable, Equatable, Sendable {
        let label: String
        let text: String
        let tone: String
    }
    struct Day: Codable, Equatable, Identifiable, Sendable {
        let key: String
        /// The day of the month ("14").
        let label: String
        /// The day's amount next to the biggest day's (0…1).
        let bar: Double
        let today: Bool
        let future: Bool
        /// The bar as a button that opens its day in the list ("2 Oct · €89.00"); nil when it doesn't open.
        let spoken: String?
        var id: String { key }
    }
    let spent: Figure?
    let income: Figure?
    let net: Net?
    /// The picked month's days (none for a search).
    let days: [Day]
    /// "Biggest day: 14 Sep · €42.50".
    let peak: String?
}

struct LedgerFigures: Codable, Equatable, Sendable {
    let title: String
    let subtitle: String
    /// Nothing logged at all yet (the first-entry state).
    let firstRun: Bool
    let days: [EntryDay]
    let pulse: MonthPulse

    /// The advanced filters, all empty (txnFilter.EMPTY_FILTERS): the app searches by text.
    static let noFilters: JSONValue = ["categoryId": "", "from": "", "to": "", "min": "", "max": "", "shared": ""]

    /// - rows: my_transactions' answer for the view (the period's, or all history for a search)
    /// - kind: 'expense', 'income', or nil for all
    /// - oldest: the first transaction's date (nil: none); `oldestKnown` false when it couldn't be read
    /// - filters: the Filters panel's (txnFilter.EMPTY_FILTERS' keys; all empty by default)
    /// - today: 'YYYY-MM-DD' (the days' headings)
    /// - month: the picked month's { from, to } (the header's days; a search has none)
    static func compute(rows: JSONValue, profile: JSONValue, categories: JSONValue, kind: String?, periodLabel: String,
                        text: String, filters: JSONValue = noFilters, oldest: String?, oldestKnown: Bool = true,
                        today: String, month: JSONValue = .null, core: BudgeerCore) throws -> LedgerFigures {
        let base = profile["base_currency"]?.stringValue ?? "EUR"
        let salaryShift = try core.json("salaryShift", "salaryShiftOf", [profile])
        let savingsIds = try core.json("savings", "savingsIdsOf", [categories])
        let searching: Bool = try core.call("txnFilter", "isFiltering", [text, filters])
        // A search's matches, else the month's rows by the month each counts in (a late salary in the next).
        let shown = try core.json("txnFilter", "ledgerShown", [rows, [
            "text": .string(text), "filters": filters, "searching": .bool(searching), "month": month,
            "salaryShift": salaryShift,
        ] as JSONValue, .string(base)])
        let count = shown.arrayValue?.count ?? 0
        let net = try core.json("txnFilter", "netBaseMinor", [shown, base, savingsIds])
        let head = try core.json("listHeading", "listHeading", [[
            "kind": kind.json, "periodLabel": .string(periodLabel), "count": .int(count), "searching": .bool(searching),
        ] as JSONValue])
        let subtitle: String = try core.call("listHeading", "ledgerSummary", [head["subtitle"] ?? "", [
            "searching": .bool(searching), "count": .int(count), "net": net, "baseCurrency": .string(base),
        ] as JSONValue])
        // An oldest date that couldn't be read is left out (undefined): never "nothing logged".
        var run: JSONValue = ["loading": false, "failed": false, "count": .int(count), "searching": .bool(searching)]
        if oldestKnown { run = run.with("oldest", oldest.json) }
        let firstRun: Bool = try core.call("listHeading", "isFirstRun", [run])
        let options: JSONValue = ["kind": kind.json, "baseCurrency": .string(base), "salaryShift": salaryShift,
                                  "savingsIds": savingsIds]
        let days: [EntryDay] = try core.call("rowParts", "dayGroups", [shown, options, today])
        let pulse: MonthPulse = try core.call("rowParts", "monthPulse", [
            shown, ["kind": kind.json, "baseCurrency": .string(base), "savingsIds": savingsIds] as JSONValue,
            searching ? JSONValue.null : month, today,
        ])
        return LedgerFigures(title: head["title"]?.stringValue ?? "", subtitle: subtitle, firstRun: firstRun, days: days,
                             pulse: pulse)
    }
}
