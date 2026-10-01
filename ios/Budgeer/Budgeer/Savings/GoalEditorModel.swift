// A savings goal's page (the web's GoalPage): the name, the target and what's
// saved so far in the goal's currency (the base one for a new goal), and an
// optional target date. The form opens from savingsMath.goalDraft and saves
// what goalToSave answers (or says what's missing first: only once Save is
// tapped, and gone again as soon as the form is edited, as the web's toast
// is) through save_goal; an existing goal can be deleted (the view asks first).
import Foundation
import Observation
import BudgeerCore

@MainActor
@Observable
final class GoalEditorModel {
    /// The goal's id, nil for a new one.
    let id: String?
    private(set) var name = ""
    private(set) var target = ""
    private(set) var saved = ""
    private(set) var currency = "EUR"
    /// The target date's switch (OptionalDate): off saves no date.
    private(set) var dated = false
    /// The target date, 'YYYY-MM-DD'.
    private(set) var targetDate = ""
    private(set) var ready = false
    /// What's missing (goalToSave's words) once Save was tapped, or why a save failed.
    private(set) var error: String?
    private(set) var busy = false

    private let goal: JSONValue?
    private let data: DataLayer
    private let core: BudgeerCore
    private let now: @Sendable () -> Date

    init(goal: JSONValue?, data: DataLayer, core: BudgeerCore = .shared, now: @escaping @Sendable () -> Date = { Date() }) {
        self.goal = goal
        id = goal?["id"]?.stringValue
        self.data = data
        self.core = core
        self.now = now
    }

    var isNew: Bool { id == nil }

    /// The form as it opens (goalDraft), in the base currency for a new goal.
    func load() async {
        guard !ready else { return }
        let profile = (try? await data.profile.profile()) ?? [:]
        let base = profile["base_currency"]?.stringValue ?? "EUR"
        guard let draft = try? core.json("savingsMath", "goalDraft", [goal ?? JSONValue.null, JSONValue.string(base)]) else { return }
        name = draft["name"]?.stringValue ?? ""
        target = draft["target"]?.stringValue ?? ""
        saved = draft["saved"]?.stringValue ?? ""
        currency = draft["currency"]?.stringValue ?? base
        targetDate = draft["targetDate"]?.stringValue ?? ""
        dated = !targetDate.isEmpty
        ready = true
    }

    /// "Target (EUR)".
    var targetLabel: String { core.text("savings:goal.target", ["currency": .string(currency)]) }

    /// The amount fields' placeholder in the goal's currency (MoneyInput: moneyParse.amountFieldHints).
    var placeholder: String {
        (try? core.json("moneyParse", "amountFieldHints", [currency]))?["placeholder"]?.stringValue ?? ""
    }

    func setName(_ text: String) {
        name = text
        error = nil
    }

    func setTarget(_ text: String) {
        target = clean(text)
        error = nil
    }

    func setSaved(_ text: String) {
        saved = clean(text)
        error = nil
    }

    /// The date's switch: on starts at today, off clears it.
    func setDated(_ on: Bool) {
        dated = on
        targetDate = on ? ((try? core.isoDate(now())) ?? "") : ""
        error = nil
    }

    func setTargetDate(_ day: String) {
        targetDate = day
        error = nil
    }

    /// An amount as typed, cleaned as the web's MoneyInput cleans it.
    private func clean(_ text: String) -> String {
        (try? core.call("moneyParse", "sanitizeAmountInput", [text, currency])) ?? text
    }

    /// Save the goal: true once it's saved, else `error` says why.
    func save() async -> Bool {
        let draft: JSONValue = ["name": .string(name), "target": .string(target), "saved": .string(saved),
                                "currency": .string(currency), "targetDate": .string(dated ? targetDate : "")]
        guard let answer = try? core.json("savingsMath", "goalToSave", [draft, id.json]) else { return false }
        if let missing = answer["error"]?.stringValue {
            error = missing
            return false
        }
        busy = true
        defer { busy = false }
        do {
            try await data.savings.saveGoal(answer["goal"] ?? .null)
            error = nil
            return true
        } catch {
            self.error = core.text("common:errors.generic")
            return false
        }
    }

    func delete() async -> Bool {
        guard let id else { return false }
        busy = true
        defer { busy = false }
        do {
            try await data.savings.deleteGoal(id: id)
            return true
        } catch {
            self.error = core.text("savings:goals.deleteFailed")
            return false
        }
    }
}
