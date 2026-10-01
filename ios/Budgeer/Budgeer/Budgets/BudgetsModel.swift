// The Budgets tab's state, after the web's Budgets page: this month's caps
// with their spend (BudgetFigures), the "Set a monthly cap" form (a row's
// cap loads into it to change it), delete, and "Copy last month's
// budgets". Reads and writes are the web's (my_budgets, edit_budget,
// delete_budget, copy_previous_budgets); every figure is the core's.
import Foundation
import Observation
import BudgeerCore

@MainActor
@Observable
final class BudgetsModel {
    enum State: Equatable {
        case loading
        case loaded(BudgetFigures)
        case failed(String)
    }

    private(set) var state: State = .loading
    /// The expense categories the form offers: (id, name shown).
    private(set) var categoryOptions: [(id: String, name: String)] = []
    /// The form: a category and its monthly cap as typed.
    var formCategory = ""
    private(set) var formAmount = ""
    private(set) var busy = false
    /// What the last action said (saved, removed, copied, or why it failed).
    private(set) var message: String?

    private var profile: JSONValue = [:]
    private var budgets: JSONValue = []
    /// Last month's caps (what Copy copies).
    private var previous: JSONValue = []

    private let data: DataLayer
    private let core: BudgeerCore
    private let now: @Sendable () -> Date

    init(data: DataLayer, core: BudgeerCore = .shared, now: @escaping @Sendable () -> Date = { Date() }) {
        self.data = data
        self.core = core
        self.now = now
    }

    var baseCurrency: String { profile["base_currency"]?.stringValue ?? "EUR" }
    var figures: BudgetFigures? {
        if case .loaded(let figures) = state { return figures }
        return nil
    }

    /// The month's caps, last month's, the month's expenses, then the figures.
    func load() async {
        do {
            let instant = now()
            profile = try await data.profile.profile()
            let span = try BudgetFigures.window(now: instant, core: core)
            let month = span["first"]?.stringValue ?? ""
            let from = span["from"]?.stringValue, to = span["to"]?.stringValue
            budgets = try await data.budgets.budgets(period: month)
            let previousMonth: String = try core.call("budgetMath", "previousPeriod", [span["last"] ?? .null])
            previous = (try? await data.budgets.budgets(period: previousMonth)) ?? []
            let read = try await data.transactions.transactions(TxnQuery(kind: "expense", from: from, to: to, spread: true))
            let rows = try await FxRates.fillPending(read, base: baseCurrency, today: try core.isoDate(instant), fx: data.fx, core: core)
            let categories = try await data.categories.categories(kind: "expense")
            categoryOptions = (categories.arrayValue ?? []).compactMap { category in
                guard let id = category["id"]?.stringValue else { return nil }
                return (id, (try? core.call("categoryName", "categoryDisplayName", [category])) ?? "")
            }
            state = .loaded(try BudgetFigures.compute(profile: profile, budgets: budgets, previous: previous, rows: rows,
                                                      now: instant, core: core))
        } catch {
            if case .loaded = state { return } // a failed refresh keeps the page
            state = .failed(String(describing: error))
        }
    }

    /// The cap as typed, cleaned as the web's MoneyInput cleans it.
    func setAmount(_ text: String) {
        formAmount = (try? core.call("moneyParse", "sanitizeAmountInput", [text, baseCurrency])) ?? text
    }

    /// Load a row's cap into the form, to change it.
    func edit(_ item: BudgetItem) {
        formCategory = item.categoryId
        let row = budgets.arrayValue?.first { $0["category_id"]?.stringValue == item.categoryId }
        formAmount = (try? core.call("currency", "minorToInput", [row?["amount_minor"] ?? 0, baseCurrency])) ?? ""
    }

    var canSet: Bool { !formCategory.isEmpty && !formAmount.isEmpty && !busy }

    /// The cap field's placeholder in the base currency (MoneyInput: moneyParse.amountFieldHints).
    var amountPlaceholder: String {
        (try? core.json("moneyParse", "amountFieldHints", [baseCurrency]))?["placeholder"]?.stringValue ?? ""
    }

    /// "Set": edit_budget for this month (a carried month first gets its own copy).
    func setCap() async {
        guard canSet, let figures else { return }
        busy = true
        defer { busy = false }
        do {
            let minor: Int = try core.call("currency", "toMinor", [formAmount, baseCurrency])
            try await data.budgets.edit(categoryId: formCategory, amountMinor: minor, currency: baseCurrency,
                                        period: figures.periodStart)
            formCategory = ""
            formAmount = ""
            message = core.text("budgets:saved")
            await load()
        } catch {
            message = core.text("budgets:saveFailed")
        }
    }

    func delete(_ item: BudgetItem) async {
        guard let figures else { return }
        busy = true
        defer { busy = false }
        do {
            try await data.budgets.delete(categoryId: item.categoryId, period: figures.periodStart)
            message = core.text("budgets:removed", ["name": .string(item.name)])
            await load()
        } catch {
            message = core.text("budgets:removeFailed")
        }
    }

    /// The copy confirm's words: this month's caps replaced by last month's.
    var copyBody: String {
        core.text("budgets:copy.body", ["count": .int(figures?.items.count ?? 0), "previous": .int(previous.arrayValue?.count ?? 0)])
    }

    func copyPrevious() async {
        guard let figures else { return }
        busy = true
        defer { busy = false }
        do {
            let copied = try await data.budgets.copyPrevious(period: figures.periodStart)
            message = core.text("budgets:copied", ["count": .int(copied)])
            await load()
        } catch {
            message = core.text("common:errors.generic")
        }
    }
}
