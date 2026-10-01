// A net-worth account's page (the web's AccountPage): its name, what it is
// (an asset, a debt, savings) and its balance in its own currency (the base
// one for a new account), a balance kept up to date by hand. The form opens
// from insightsMath.accountDraft and saves what accountToSave answers (or
// says what's missing first) through save_account; an existing account can
// be removed (the view asks first).
import Foundation
import Observation
import BudgeerCore

@MainActor
@Observable
final class AccountEditorModel {
    /// The account's id, nil for a new one.
    let id: String?
    private(set) var name = ""
    private(set) var type = "asset"
    private(set) var balance = ""
    private(set) var currency = "EUR"
    private(set) var ready = false
    /// What's missing (accountToSave's words), or why a save failed; shown
    /// after Save is tapped, and gone again once the form is edited.
    private(set) var error: String?
    private(set) var busy = false

    private let account: JSONValue?
    private let data: DataLayer
    private let core: BudgeerCore

    init(account: JSONValue?, data: DataLayer, core: BudgeerCore = .shared) {
        self.account = account
        id = account?["id"]?.stringValue
        self.data = data
        self.core = core
    }

    var isNew: Bool { id == nil }

    /// The form as it opens (accountDraft), in the base currency for a new account.
    func load() async {
        guard !ready else { return }
        let profile = (try? await data.profile.profile()) ?? [:]
        let base = profile["base_currency"]?.stringValue ?? "EUR"
        guard let draft = try? core.json("insightsMath", "accountDraft", [account ?? JSONValue.null, JSONValue.string(base)])
        else { return }
        name = draft["name"]?.stringValue ?? ""
        type = draft["type"]?.stringValue ?? "asset"
        balance = draft["balance"]?.stringValue ?? ""
        currency = draft["currency"]?.stringValue ?? base
        ready = true
    }

    /// Asset, debt or savings, worded (accountTypes).
    var types: [CoreChoice] {
        (try? core.call("insightsMath", "accountTypes", [])) ?? []
    }

    /// "Balance (EUR)".
    var balanceLabel: String { core.text("insights:account.balance", ["currency": .string(currency)]) }

    func setName(_ text: String) {
        name = text
        error = nil
    }

    func setType(_ value: String) {
        type = value
        error = nil
    }

    /// A balance as typed (a debt's can be below zero), cleaned as the web's MoneyInput cleans it.
    func setBalance(_ text: String) {
        balance = (try? core.call("moneyParse", "sanitizeSignedAmountInput", [text, currency])) ?? text
        error = nil
    }

    /// Save the account: true once it's saved, else `error` says why.
    func save() async -> Bool {
        let draft: JSONValue = ["name": .string(name), "type": .string(type), "balance": .string(balance),
                                "currency": .string(currency)]
        guard let answer = try? core.json("insightsMath", "accountToSave", [draft, id.json]) else { return false }
        if let missing = answer["error"]?.stringValue {
            error = missing
            return false
        }
        busy = true
        defer { busy = false }
        do {
            try await data.savings.saveNetWorthAccount(answer["account"] ?? .null)
            error = nil
            return true
        } catch {
            self.error = UserMessage.of(error, fallback: core.text("common:errors.notSaved"), core: core)
            return false
        }
    }

    /// Remove it from the net worth.
    func delete() async -> Bool {
        guard let id else { return false }
        busy = true
        defer { busy = false }
        do {
            try await data.savings.deleteNetWorthAccount(id: id)
            return true
        } catch {
            self.error = core.text("insights:netWorth.removeFailed")
            return false
        }
    }
}
