// The Budgets page as the web's Budgets.jsx + useBudgetProgress work it
// out, every step a core call (in Node the same sequence writes the parity
// fixture: mobile-core/screenFigures.mjs budgetFigures): this month's window
// (budgetWindow), its caps as budget sets (monthSets, the rollover), the
// spend (spendRows: a yearly payment's monthly share), the progress
// (periodBudgets), where the caps were carried over from, whether copying
// last month's is offered, and each row's words (budgetRowParts).
import Foundation
import BudgeerCore

struct BudgetItem: Codable, Equatable, Identifiable, Sendable {
    let id: String
    let categoryId: String
    let name: String
    let look: CategoryLook
    /// "€312.40 of €400.00".
    let meta: String
    /// Spend as a whole percent of the cap (the bar's length, unclamped).
    let percent: Int
    let valueLabel: String
    /// The bar's tone: nil (brand), 'warning' from 80%, 'negative' over.
    let tone: String?
    let over: Bool
    /// "Over budget", when over.
    let overLabel: String?
}

/// A past month that kept every budget (budgetMath.heldNote).
struct HeldNote: Codable, Equatable, Sendable {
    let title: String
    let note: String
}

/// Home's Budgets card for the picked period (BudgetsCard): the subtitle,
/// the empty state and whether it offers "Set a budget", the rows, and the
/// note when a past month kept every budget.
struct BudgetCardFigures: Codable, Equatable, Sendable {
    let subtitle: String
    let empty: String
    let canSet: Bool
    let items: [BudgetItem]
    let held: HeldNote?
}

struct BudgetFigures: Codable, Equatable, Sendable {
    /// The month the caps are set for ('YYYY-MM-01').
    let periodStart: String
    /// Last month (its caps are what "Copy" copies).
    let previousPeriod: String
    /// Where the month's spend is read from and to.
    let fetchFrom: String
    let fetchTo: String
    /// "September 2026" (the page's eyebrow).
    let heading: String
    /// "Carried over from August", when the month uses last month's caps.
    let subtitle: String?
    let canCopy: Bool
    let items: [BudgetItem]

    /// budgetWindow for this month: { first, last, from, to }.
    static func window(now: Date, core: BudgeerCore) throws -> JSONValue {
        let period = try core.json("periods", "thisMonthPeriod", [JSDate(now)])
        return try core.json("budgetMath", "budgetWindow", [period, try core.isoDate(now)])
    }

    /// - budgets: my_budgets for this month; previous: for last month
    /// - rows: my_transactions(expense, the month, p_spread)
    static func compute(profile: JSONValue, budgets: JSONValue, previous: JSONValue, rows: JSONValue, now: Date,
                        core: BudgeerCore) throws -> BudgetFigures {
        let base = profile["base_currency"]?.stringValue ?? "EUR"
        let span = try window(now: now, core: core)
        let sets = try core.json("budgetMath", "monthSets", [budgets])
        let options: JSONValue = ["separateYearly": .bool(profile["yearly_separate"]?.boolValue ?? false)]
        let spend = try core.json("spread", "spendRows", [rows, base, span["from"] ?? .null, span["to"] ?? .null, options])
        let progress = try core.json("budgetMath", "periodBudgets", [[
            "sets": sets, "span": span, "spend": spend, "baseCurrency": .string(base),
        ] as JSONValue])
        let first = span["first"] ?? .null
        let caps = try core.json("budgetMath", "capsInMonth", [sets, first])
        let carried = try core.json("budgetMath", "carriedFrom", [caps, first])
        let periodStart = span["last"]?.stringValue ?? ""
        let subtitle: String? = carried.isNull ? nil : try core.call("budgetMath", "carriedLabel", [carried, periodStart])
        let items = try (progress["items"]?.arrayValue ?? []).map { item -> BudgetItem in
            try core.call("budgetMath", "budgetRowParts", [item, base])
        }
        return BudgetFigures(
            periodStart: periodStart,
            previousPeriod: try core.call("budgetMath", "previousPeriod", [periodStart]),
            fetchFrom: span["from"]?.stringValue ?? "",
            fetchTo: span["to"]?.stringValue ?? "",
            heading: try core.call("dates", "monthTitle", [JSDate(now)]),
            subtitle: subtitle,
            canCopy: try core.call("budgetMath", "canCopyBudgets", [carried, previous.arrayValue?.count ?? 0]),
            items: items)
    }

    // MARK: Home's card (screenFigures.mjs budgetCard)

    /// budgetWindow for a picker period: { first, last, from, to }.
    static func cardWindow(periodValue: String?, now: Date, core: BudgeerCore) throws -> JSONValue {
        let period = try HomeFigures.period(periodValue, now: now, core: core)
        return try core.json("budgetMath", "budgetWindow", [period, try core.isoDate(now)])
    }

    /// - sets: useBudgetSets' answer (monthSets of one month, or each month's { period, rows })
    /// - rows: my_transactions(expense, the window, p_spread)
    static func card(profile: JSONValue, sets: JSONValue, rows: JSONValue, periodValue: String?, now: Date,
                     core: BudgeerCore) throws -> BudgetCardFigures {
        let base = profile["base_currency"]?.stringValue ?? "EUR"
        let todayISO = try core.isoDate(now)
        let period = try HomeFigures.period(periodValue, now: now, core: core)
        let span = try core.json("budgetMath", "budgetWindow", [period, todayISO])
        let options: JSONValue = ["separateYearly": .bool(profile["yearly_separate"]?.boolValue ?? false)]
        let spend = try core.json("spread", "spendRows", [rows, base, span["from"] ?? .null, span["to"] ?? .null, options])
        let progress = try core.json("budgetMath", "periodBudgets", [[
            "sets": sets, "span": span, "spend": spend, "baseCurrency": .string(base),
        ] as JSONValue])
        let month: Bool = try core.call("periods", "isMonthPeriod", [period])
        let first = span["first"] ?? .null
        let carried = month
            ? try core.json("budgetMath", "carriedFrom", [try core.json("budgetMath", "capsInMonth", [sets, first]), first])
            : JSONValue.null
        let past: Bool = try core.call("periods", "isPastPeriod", [period, todayISO])
        let empty = try core.json("budgetMath", "budgetsEmpty", [period, !past])
        let subtitle: String = try core.call("budgetMath", "budgetSubtitle", [period, [
            "months": progress["months"] ?? .int(0), "carried": carried, "periodStart": span["last"] ?? .null,
        ] as JSONValue])
        let parts = try (progress["items"]?.arrayValue ?? []).map { item -> JSONValue in
            try core.json("budgetMath", "budgetRowParts", [item, base])
        }
        let held = try core.json("budgetMath", "heldNote", [JSONValue.array(parts), period, todayISO])
        return BudgetCardFigures(subtitle: subtitle, empty: empty["text"]?.stringValue ?? "",
                                 canSet: empty["canSet"]?.boolValue ?? false,
                                 items: try parts.map { try $0.decode(BudgetItem.self) },
                                 held: held.isNull ? nil : try held.decode(HeldNote.self))
    }
}
