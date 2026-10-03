// The Recurring page's state, after the web's Recurring.jsx: the rules
// (my_recurring_rules), today's rates for the foreign ones (as fx.js
// useLatestRates), the savings categories, then the figures from the core.
// Pause and resume, and remove, are the web's save_recurring_rule and
// delete; editing opens the rule in the entry form.
import Foundation
import Observation
import BudgeerCore

@MainActor
@Observable
final class RecurringModel {
    enum State: Equatable {
        case loading
        case loaded(RecurringFigures)
        case failed(String)
    }

    private(set) var state: State = .loading
    /// 'expense' (Subscriptions) or 'income'.
    var tab = "expense"
    private(set) var message: String?

    private var rules: JSONValue = []
    private let data: DataLayer
    private let core: BudgeerCore

    init(data: DataLayer, core: BudgeerCore = .shared) {
        self.data = data
        self.core = core
    }

    func load() async {
        do {
            let profile = try await data.profile.profile()
            let base = profile["base_currency"]?.stringValue ?? "EUR"
            rules = try await data.recurring.rules()
            let savings = try await data.categories.savingsCategories()
            let rates = try await FxRates.latest(for: rules, base: base, fx: data.fx, core: core)
            state = .loaded(try RecurringFigures.compute(profile: profile, categories: savings, rules: rules,
                                                         rates: rates, today: try core.isoDate(Date()), core: core))
        } catch {
            if case .loaded = state { return }
            state = .failed(String(describing: error))
        }
    }

    /// The saved rule behind a row (the form edits it).
    func rule(id: String) -> JSONValue? {
        rules.arrayValue?.first { $0["id"]?.stringValue == id }
    }

    /// Pause or resume (save_recurring_rule with is_active only).
    func setActive(_ row: RuleRow, _ active: Bool) async {
        do {
            try await data.recurring.save(id: row.id, fields: ["is_active": .bool(active)])
            await load()
        } catch {
            message = core.text("recurring:list.updateFailed")
        }
    }

    /// The remove confirm's words.
    func removeBody(_ row: RuleRow) -> String {
        let name: String = (try? core.call("categoryName", "entryName",
                                           [rule(id: row.id) ?? .null, core.text("recurring:list.remove.thisEntry")])) ?? ""
        return core.text("recurring:list.remove.body", ["name": .string(name)])
    }

    func remove(_ row: RuleRow) async {
        do {
            try await data.recurring.deleteRule(id: row.id)
            message = core.text("recurring:list.removed")
            await load()
        } catch {
            message = core.text("recurring:list.removeFailed")
        }
    }
}
