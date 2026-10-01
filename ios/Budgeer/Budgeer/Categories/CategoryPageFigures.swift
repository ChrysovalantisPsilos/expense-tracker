// A category's page as the web's CategoryPage.jsx works it out, every step
// a core call (in Node the same sequence writes the parity fixture:
// mobile-core/categoryFigures.mjs): the period (periodFromValue), the
// heading (categoryPageHead), the period's real payments and its total by
// the app's spread rule (categoryPeriod), the list's heading (listHeading),
// the month's budget (categoryBudget: monthly only, this month's cap the
// one that can change) and each row's words (rowParts.listParts). Nothing
// is added, filtered or worded here.
import Foundation
import BudgeerCore

/// The budget line under the total (categoryMath.categoryBudget).
struct CategoryBudgetLine: Codable, Equatable, Sendable {
    /// 'monthly', 'bar', 'set' or 'none'.
    let state: String
    /// The line's words ('monthly', 'set': the button's, 'none').
    let text: String?
    let title: String?
    /// "€84.30 of €100.00".
    let meta: String?
    let percent: Int?
    let tone: String?
    let over: Bool?
    /// "Carried over from August", for a cap from an earlier month.
    let carried: String?
}

struct CategoryPageFigures: Codable, Equatable, Sendable {
    /// False for an id that names none of the user's categories.
    let found: Bool
    /// The not-found page's title and line.
    let title: String?
    let text: String?
    let period: HomePeriod?
    let kind: String?
    let name: String?
    let eyebrow: String?
    let look: CategoryLook?
    /// A real category (the uncategorised bucket has nothing to edit).
    let editable: Bool?
    let archived: Bool?
    /// "Spent", "Earned" or "Saved", and the period's total.
    let totalLabel: String?
    let total: String?
    /// Expense categories only.
    let budget: CategoryBudgetLine?
    /// This month's cap can change (budgets are kept per month).
    let canEditBudget: Bool?
    /// The month's cap (minor units), nil without one.
    let budgetMinor: Int?
    /// The cap as the field starts ("" for none), and the field's help line.
    let budgetInput: String?
    let budgetHelp: String?
    let listTitle: String?
    let listSubtitle: String?
    let rows: [EntryRow]?

    /// The uncategorised bucket's id in a link (categoryName.NO_CATEGORY).
    static let uncategorised = "none"

    /// The period a picker value names (this month for nil or an unknown one).
    static func period(_ value: String?, now: Date, core: BudgeerCore) throws -> JSONValue {
        try HomeFigures.period(value, now: now, core: core)
    }

    /// What to read for the page: my_transactions for the category (the
    /// uncategorised bucket reads the period's expenses), spread.
    static func query(categoryId: String, period: JSONValue) -> TxnQuery {
        let none = categoryId == uncategorised
        return TxnQuery(kind: none ? "expense" : nil, from: period["from"]?.stringValue, to: period["to"]?.stringValue,
                        categoryId: none ? nil : categoryId, spread: true)
    }

    /// The month whose budgets the page reads: the period's month, or this month for a longer period.
    static func budgetMonth(period: JSONValue, now: Date, core: BudgeerCore) throws -> String {
        let month: Bool = try core.call("periods", "isMonthPeriod", [period])
        if month, let from = period["from"]?.stringValue { return from }
        return try core.json("dates", "monthRange", [JSDate(now)])["from"]?.stringValue ?? ""
    }

    /// - categories: every category, archived ones included (useAllCategories)
    /// - rows: my_transactions(query) for the page
    /// - budgets: my_budgets for budgetMonth
    static func compute(profile: JSONValue, categories: JSONValue, rows: JSONValue, budgets: JSONValue, categoryId: String,
                        periodValue: String?, now: Date, core: BudgeerCore) throws -> CategoryPageFigures {
        let period = try period(periodValue, now: now, core: core)
        let none = categoryId == uncategorised
        let category: JSONValue? = none ? nil : categories.arrayValue?.first(where: { $0["id"]?.stringValue == categoryId })
        if !none && category == nil {
            return CategoryPageFigures(found: false, title: core.text("categories:page.notFound"),
                                       text: core.text("categories:page.notFoundText"), period: nil, kind: nil, name: nil,
                                       eyebrow: nil, look: nil, editable: nil, archived: nil, totalLabel: nil, total: nil,
                                       budget: nil, canEditBudget: nil, budgetMinor: nil, budgetInput: nil, budgetHelp: nil, listTitle: nil,
                                       listSubtitle: nil, rows: nil)
        }
        let base = profile["base_currency"]?.stringValue ?? "EUR"
        let separateYearly = profile["yearly_separate"]?.boolValue ?? false
        let salaryShift: JSONValue = try core.call("salaryShift", "salaryShiftOf", [profile])
        let head = try core.json("categoryMath", "categoryPageHead", [category ?? .null, none])
        let kind = head["kind"]?.stringValue ?? "expense"
        let from = period["from"] ?? .null
        let to = period["to"] ?? .null
        let window = try core.json("categoryMath", "categoryPeriod", [rows, [
            "categoryId": .string(categoryId), "from": from, "to": to, "baseCurrency": .string(base),
            "separateYearly": .bool(separateYearly), "salaryShift": salaryShift,
        ] as JSONValue])
        let listed = window["listed"] ?? []
        let total = window["total"] ?? .int(0)
        let list = try core.json("listHeading", "listHeading", [[
            "kind": .string(kind), "savings": .bool(category?["is_savings"]?.boolValue ?? false),
            "periodLabel": period["label"] ?? .null, "count": .int(listed.arrayValue?.count ?? 0),
        ] as JSONValue])
        // Budgets are monthly and expense-only; only this month's cap can change.
        let thisMonth = try core.json("dates", "monthRange", [JSDate(now)])["from"]?.stringValue
        let month: Bool = try core.call("periods", "isMonthPeriod", [period])
        let hasBudgets = !none && kind == "expense"
        let budget: JSONValue? = hasBudgets && month
            ? budgets.arrayValue?.first(where: { $0["category_id"]?.stringValue == categoryId })
            : nil
        let canEdit = hasBudgets && from.stringValue == thisMonth
        let budgetMinor = budget?["amount_minor"]
        var line: CategoryBudgetLine?
        if hasBudgets {
            line = try core.call("categoryMath", "categoryBudget", [[
                "budget": budget ?? .null, "spent": total, "month": .bool(month), "canEdit": .bool(canEdit),
                "period": period, "baseCurrency": .string(base),
            ] as JSONValue]) as CategoryBudgetLine
        }
        let savingsIds: JSONValue = try core.call("savings", "savingsIdsOf", [categories])
        let options: JSONValue = ["kind": .string(kind), "baseCurrency": .string(base), "salaryShift": salaryShift,
                                  "savingsIds": savingsIds]
        return CategoryPageFigures(
            found: true, title: nil, text: nil,
            period: try period.decode(HomePeriod.self),
            kind: kind,
            name: head["name"]?.stringValue,
            eyebrow: head["eyebrow"]?.stringValue,
            look: try CategoryLook.of(category ?? .string(""), kind: kind, core: core),
            editable: category != nil,
            archived: category?["is_archived"]?.boolValue ?? false,
            totalLabel: head["totalLabel"]?.stringValue,
            total: core.formatMoney(total, base),
            budget: line,
            canEditBudget: canEdit,
            budgetMinor: budgetMinor?.intValue,
            budgetInput: budgetMinor.map { (try? core.call("currency", "minorToInput", [$0, base])) ?? "" } ?? "",
            budgetHelp: core.text(budgetMinor == nil ? "categories:page.budgetNew" : "categories:page.budgetChange"),
            listTitle: list["title"]?.stringValue,
            listSubtitle: list["subtitle"]?.stringValue,
            rows: try core.call("rowParts", "listParts", [listed, options]) as [EntryRow])
    }
}
