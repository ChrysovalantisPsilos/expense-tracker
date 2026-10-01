// A category's page (the web's CategoryPage, /categories/:id?period=…),
// where Home's bars, the budget rows and the Categories list drill down to:
// the period's total, the month's budget, the entries paid in it, and
// this month's cap edited in place (Edit). The category's name, icon and
// colour are its editor's (CategoryEditView), as on the web's Edit panel.
// Reads and writes are the web's (every category, my_transactions for the
// category and the period, my_budgets, edit_budget, delete_budget); every
// figure and word is CategoryPageFigures' (the core's).
import Foundation
import Observation
import BudgeerCore

@MainActor
@Observable
final class CategoryPageModel {
    enum State: Equatable {
        case loading
        case loaded(CategoryPageFigures)
        case failed(String)
    }

    let categoryId: String
    private(set) var state: State = .loading
    /// The picker's periods (with the one shown, should it be outside them).
    private(set) var periods: [HomePeriod] = []
    /// The picked period's value (nil: this month).
    private(set) var periodValue: String?
    /// The budget's Edit is open, and its field as typed.
    var editing = false
    private(set) var budgetText = ""
    private(set) var busy = false
    /// What the last save said (Saved, Nothing to save, or why it failed).
    private(set) var message: String?
    private(set) var warning = false

    private var profile: JSONValue = [:]
    private var rows: JSONValue = []
    private let data: DataLayer
    private let core: BudgeerCore
    private let now: @Sendable () -> Date

    init(categoryId: String, periodValue: String? = nil, data: DataLayer, core: BudgeerCore = .shared,
         now: @escaping @Sendable () -> Date = { Date() }) {
        self.categoryId = categoryId
        self.periodValue = periodValue
        self.data = data
        self.core = core
        self.now = now
    }

    var figures: CategoryPageFigures? {
        if case .loaded(let figures) = state { return figures }
        return nil
    }

    private var baseCurrency: String { profile["base_currency"]?.stringValue ?? "EUR" }

    /// The profile, every category, the picker's periods, the period's entries
    /// and the month's budgets, one after another; then the figures.
    func load() async {
        do {
            let instant = now()
            profile = try await data.profile.profile()
            let categories = try await data.categories.allCategories()
            let period = try CategoryPageFigures.period(periodValue, now: instant, core: core)
            let options = await PeriodSource.load(profile: profile, data: data, core: core, now: instant)
            periods = (try? core.call("periods", "withPeriod", [options.periods, period])) ?? options.periods
            let read = try await data.transactions.transactions(CategoryPageFigures.query(categoryId: categoryId, period: period))
            rows = try await FxRates.fillPending(read, base: baseCurrency, today: try core.isoDate(instant), fx: data.fx,
                                                 core: core)
            let month = try CategoryPageFigures.budgetMonth(period: period, now: instant, core: core)
            let budgets = try await data.budgets.budgets(period: month)
            let figures = try CategoryPageFigures.compute(profile: profile, categories: categories, rows: rows,
                                                          budgets: budgets, categoryId: categoryId,
                                                          periodValue: periodValue, now: instant, core: core)
            state = .loaded(figures)
            if !editing { budgetText = figures.budgetInput ?? "" }
        } catch {
            if case .loaded = state { return } // a failed refresh keeps the page
            state = .failed(UserMessage.of(error, core: core))
        }
    }

    /// Another period from the picker.
    func setPeriod(_ value: String) async {
        guard value != figures?.period?.value else { return }
        periodValue = value
        editing = false
        message = nil
        await load()
    }

    /// The saved row behind a list row (to open it in Edit).
    func row(id: String) -> JSONValue? {
        rows.arrayValue?.first(where: { $0["id"]?.stringValue == id })
    }

    /// The cap as typed, cleaned as the web's MoneyInput cleans it.
    func setBudgetText(_ text: String) {
        budgetText = (try? core.call("moneyParse", "sanitizeAmountInput", [text, baseCurrency])) ?? text
    }

    /// The field's placeholder ("No budget").
    var budgetPlaceholder: String { core.text("categories:page.noBudgetPlaceholder") }

    /// Open (or close) Edit, starting from the cap as saved.
    func toggleEdit() {
        editing.toggle()
        message = nil
        if editing { budgetText = figures?.budgetInput ?? "" }
    }

    /// Save: budgetChange against this month's cap (set it, or clear it to
    /// remove the budget); nothing changed says so, as the web's toast does.
    @discardableResult
    func saveBudget() async -> Bool {
        guard let figures, figures.canEditBudget == true, let month = figures.period?.from else { return false }
        busy = true
        defer { busy = false }
        do {
            let current: JSONValue = figures.budgetMinor.map { JSONValue.int($0) } ?? .null
            let change = try core.json("budgetMath", "budgetChange", [current, budgetText, baseCurrency])
            if let set = change["set"]?.intValue {
                try await data.budgets.edit(categoryId: categoryId, amountMinor: set, currency: baseCurrency, period: month)
            } else if change["remove"]?.boolValue == true {
                try await data.budgets.delete(categoryId: categoryId, period: month)
            }
            warning = false
            message = core.text(change.isNull ? "categories:toasts.nothingToSave" : "categories:toasts.saved")
            editing = false
            await load()
            return true
        } catch {
            warning = true
            message = UserMessage.of(error, core: core)
            return false
        }
    }
}
