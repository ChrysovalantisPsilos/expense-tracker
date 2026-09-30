// The Transactions list as the web's LedgerPage + TransactionList work it
// out, every step a core call (the same sequence, in Node, writes the parity
// fixture: mobile-core/screenFigures.mjs ledgerFigures): the search
// (txnFilter), the heading and its line (listHeading, ledgerSummary, a
// search's net), the first-run state, the page (paginate) and each row's
// words (rowParts). Nothing is filtered, summed or worded here.
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

struct LedgerFigures: Codable, Equatable, Sendable {
    let title: String
    let subtitle: String
    /// Nothing logged at all yet (the first-entry state).
    let firstRun: Bool
    let pages: Int
    /// "Page 1 of 3".
    let position: String
    let rows: [EntryRow]

    /// Rows per page (screenFigures.mjs LEDGER_PAGE).
    static let pageSize = 20

    /// The advanced filters, all empty (txnFilter.EMPTY_FILTERS): the app searches by text.
    static let noFilters: JSONValue = ["categoryId": "", "from": "", "to": "", "min": "", "max": ""]

    /// - rows: my_transactions' answer for the view (the period's, or all history for a search)
    /// - kind: 'expense', 'income', or nil for all
    /// - oldest: the first transaction's date (nil: none); `oldestKnown` false when it couldn't be read
    static func compute(rows: JSONValue, profile: JSONValue, categories: JSONValue, kind: String?, periodLabel: String,
                        text: String, oldest: String?, oldestKnown: Bool = true, page: Int = 1,
                        core: BudgeerCore) throws -> LedgerFigures {
        let base = profile["base_currency"]?.stringValue ?? "EUR"
        let salaryShift = try core.json("salaryShift", "salaryShiftOf", [profile])
        let savingsIds = try core.json("savings", "savingsIdsOf", [categories])
        let searching: Bool = try core.call("txnFilter", "isFiltering", [text, noFilters])
        let shown = searching
            ? try core.json("txnFilter", "filterTransactions", [rows, noFilters.with("text", .string(text)), base])
            : rows
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
        let pages: Int = try core.call("paginate", "pageCount", [count, pageSize])
        let position = core.text("common:paginator.position", ["page": .int(page), "pages": .int(pages)])
        let visible = try core.json("paginate", "pageSlice", [shown, page, pageSize])
        let options: JSONValue = ["kind": kind.json, "baseCurrency": .string(base), "salaryShift": salaryShift,
                                  "savingsIds": savingsIds]
        let parts: [EntryRow] = try core.call("rowParts", "listParts", [visible, options])
        return LedgerFigures(title: head["title"]?.stringValue ?? "", subtitle: subtitle, firstRun: firstRun,
                             pages: pages, position: position, rows: parts)
    }
}
