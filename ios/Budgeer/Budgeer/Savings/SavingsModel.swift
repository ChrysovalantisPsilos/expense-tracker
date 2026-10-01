// The Savings page's state, after the web's useSavingsBalance, useGoals and
// useRecurring: the profile, the savings categories (and the active income
// ones, for "Add to savings"), every income entry and every expense paid
// from savings (pending rates filled), the net-worth accounts, the rules and
// the goals; then the figures from the core (SavingsFigures). The history's
// filter and "Show older" refigure without reading again. A goal's quick
// "+ / −" saves the whole goal (savingsMath.goalSavedAfter), as the web's
// GoalsCard does; deleting a goal or an entry asks first (the view).
import Foundation
import Observation
import BudgeerCore

@MainActor
@Observable
final class SavingsModel {
    enum State: Equatable {
        case loading
        case loaded(SavingsFigures)
        case failed(String)
    }

    private(set) var state: State = .loading
    /// The history's filter: 'all', 'in' or 'out' (savingsMath.HISTORY_FILTERS).
    private(set) var filter = "all"
    /// The months "Show older" asked for, nil for the first ones.
    private(set) var months: Int?
    /// What the last action said (a goal or an entry deleted, or why it failed).
    private(set) var message: String?
    private(set) var warning = false
    private(set) var busy = false

    private var profile: JSONValue = [:]
    private var categories: JSONValue = []
    private var incomeCategories: JSONValue = []
    private var income: JSONValue = []
    private var fromSavings: JSONValue = []
    private var accounts: JSONValue = []
    private var rules: JSONValue = []
    private var goalRows: JSONValue = []

    private let data: DataLayer
    private let core: BudgeerCore
    private let now: @Sendable () -> Date

    init(data: DataLayer, core: BudgeerCore = .shared, now: @escaping @Sendable () -> Date = { Date() }) {
        self.data = data
        self.core = core
        self.now = now
    }

    var figures: SavingsFigures? {
        if case .loaded(let figures) = state { return figures }
        return nil
    }

    func load() async {
        do {
            let instant = now()
            profile = try await data.profile.profile()
            let base = profile["base_currency"]?.stringValue ?? "EUR"
            let today = try core.isoDate(instant)
            async let savings = data.categories.savingsCategories()
            async let incomeKinds = data.categories.categories(kind: "income")
            async let incomeRead = data.transactions.transactions(TxnQuery(kind: "income"))
            async let spentRead = data.transactions.transactions(TxnQuery(kind: "expense", paidFromSavings: true))
            async let accountRows = data.savings.accounts()
            async let goals = data.savings.goals()
            categories = try await savings
            incomeCategories = (try? await incomeKinds) ?? []
            income = try await FxRates.fillPending(try await incomeRead, base: base, today: today, fx: data.fx, core: core)
            fromSavings = try await FxRates.fillPending(try await spentRead, base: base, today: today, fx: data.fx, core: core)
            accounts = try await accountRows
            goalRows = try await goals
            // The repeating savings are this page's extra; the rest doesn't wait on them.
            rules = (try? await data.recurring.rules()) ?? []
            try refigure()
        } catch {
            if case .loaded = state { return } // a failed refresh keeps the page
            state = .failed(String(describing: error))
        }
    }

    private func refigure() throws {
        state = .loaded(try SavingsFigures.compute(profile: profile, categories: categories, income: income,
                                                   fromSavings: fromSavings, accounts: accounts, rules: rules,
                                                   goals: goalRows, filter: filter, now: now(), core: core))
    }

    // MARK: The history

    /// All / In / Out, each with its name (savingsMath.historyFilters).
    var filters: [CoreChoice] {
        (try? core.call("savingsMath", "historyFilters", [])) ?? []
    }

    func setFilter(_ value: String) {
        filter = value
        months = nil
        try? refigure()
    }

    /// historyWindow: how many months show, and whether "Show older" is offered.
    var window: (shown: Int, more: Bool) {
        let answer = historyWindow()
        return (answer["shown"]?.intValue ?? 0, answer["more"]?.boolValue ?? false)
    }

    func showOlder() {
        months = historyWindow()["next"]?.intValue
    }

    private func historyWindow() -> JSONValue {
        let count = JSONValue.int(figures?.history.groups.count ?? 0)
        let asked: JSONValue = months.map { JSONValue.int($0) } ?? JSONValue.null
        return (try? core.json("savingsMath", "historyWindow", [count, asked])) ?? [:]
    }

    /// Delete an entry from the history (after the web's question).
    func delete(entry row: JSONValue) async {
        guard let id = row["id"]?.stringValue else { return }
        busy = true
        defer { busy = false }
        do {
            try await data.transactions.delete(id: id)
            say(row["kind"]?.stringValue == "income" ? "savings:history.deletedIncome" : "savings:history.deletedExpense")
            await load()
        } catch {
            say("savings:history.deleteFailed", warning: true)
        }
    }

    // MARK: Adding and the rules

    /// The category "Add to savings" opens Add on (savingsCategoryOf), nil without one.
    var savingsCategory: String? {
        (try? core.json("savingsMath", "savingsCategoryOf", [incomeCategories]))?.stringValue
    }

    /// A repeating saving's rule, to edit.
    func rule(id: String) -> JSONValue? {
        rules.arrayValue?.first { $0["id"]?.stringValue == id }
    }

    // MARK: Goals

    /// A goal as saved, for its page.
    func goal(id: String) -> JSONValue? {
        goalRows.arrayValue?.first { $0["id"]?.stringValue == id }
    }

    /// "+ €X" / "− €X": the goal saved with its new amount (never below zero).
    func addTo(_ card: GoalCard, step: Int) async {
        guard let goal = goal(id: card.id) else { return }
        busy = true
        defer { busy = false }
        do {
            let saved: Int = try core.call("savingsMath", "goalSavedAfter", [goal, JSONValue.int(step)])
            try await data.savings.saveGoal(goal.with("saved_minor", .int(saved)))
            message = nil
            await load()
        } catch {
            say("savings:goals.updateFailed", warning: true)
        }
    }

    func deleteGoal(id: String) async {
        busy = true
        defer { busy = false }
        do {
            try await data.savings.deleteGoal(id: id)
            message = nil
            await load()
        } catch {
            say("savings:goals.deleteFailed", warning: true)
        }
    }

    /// The question before a goal goes.
    func deleteGoalQuestion(id: String) -> String {
        core.text("savings:goals.deleteQuestion", ["name": .string(goal(id: id)?["name"]?.stringValue ?? "")])
    }

    private func say(_ key: String, warning: Bool = false) {
        message = core.text(key)
        self.warning = warning
    }
}
