// Settings › Meal vouchers (the web's VoucherSetup): whether the user gets
// them, the amount per working day, whose working days (Belgium or Greece),
// the next top-up's date (its day repeats monthly) and what's on the card
// today. The form opens from voucherMath.setupDraft (the card's balance
// worked out as the page does) and saves what setupToSave answers: off
// removes the setup, on starts the card's count again from today.
import Foundation
import Observation
import BudgeerCore

@MainActor
@Observable
final class VoucherSetupModel {
    var on = false
    private(set) var perDay = ""
    var country = "BE"
    /// The next top-up's date, 'YYYY-MM-DD'.
    var topUpOn = ""
    private(set) var onCard = ""
    private(set) var currency = "EUR"
    private(set) var countries: [CoreChoice] = []
    private(set) var ready = false
    /// Save was tapped: the missing amount shows its message from now on.
    private(set) var tried = false
    private(set) var busy = false
    private(set) var failed: String?
    private(set) var loadError: String?

    private var settings: JSONValue = .null
    private let data: DataLayer
    private let core: BudgeerCore
    private let now: @Sendable () -> Date

    init(data: DataLayer, core: BudgeerCore = .shared, now: @escaping @Sendable () -> Date = { Date() }) {
        self.data = data
        self.core = core
        self.now = now
    }

    private var today: String { (try? core.isoDate(now())) ?? "" }

    func load() async {
        do {
            let instant = now()
            settings = try await data.profile.mealVouchers()
            let profile = try await data.profile.profile()
            let draft: VoucherSetupDraft
            if settings.isNull {
                draft = try core.call("voucherMath", "setupDraft", [JSONValue.null, JSONValue.int(0),
                                                                    JSONValue.string(profile["base_currency"]?.stringValue ?? "EUR"),
                                                                    JSONValue.string(today)])
                countries = try core.call("voucherText", "countryOptions", [])
            } else {
                // What's on the card now, worked out as the page does.
                let read = try await data.transactions.transactions(TxnQuery(kind: "expense", paidWithVouchers: true))
                let base = profile["base_currency"]?.stringValue ?? "EUR"
                let spends = try await FxRates.fillPending(read, base: base, today: today, fx: data.fx, core: core)
                let figures = try VoucherFigures.compute(settings: settings, spends: spends, profile: profile, now: instant,
                                                         core: core)
                draft = figures.setup
                countries = figures.countries
            }
            on = draft.on
            perDay = draft.perDay
            country = draft.country
            topUpOn = draft.topUpOn
            onCard = draft.onCard
            currency = draft.currency
            ready = true
            loadError = nil
        } catch {
            loadError = String(describing: error)
        }
    }

    func setPerDay(_ text: String) { perDay = clean(text) }
    func setOnCard(_ text: String) { onCard = clean(text) }

    /// An amount as typed, cleaned as the web's MoneyInput cleans it.
    private func clean(_ text: String) -> String {
        (try? core.call("moneyParse", "sanitizeAmountInput", [text, currency])) ?? text
    }

    /// The amount fields' placeholder (MoneyInput: moneyParse.amountFieldHints).
    var placeholder: String {
        (try? core.json("moneyParse", "amountFieldHints", [currency]))?["placeholder"]?.stringValue ?? ""
    }

    /// setupToSave: off ({ settings: null }), missing its amount, or the setup.
    private var toSave: JSONValue {
        let form: JSONValue = ["on": .bool(on), "perDay": .string(perDay), "country": .string(country),
                               "topUpOn": .string(topUpOn), "onCard": .string(onCard), "currency": .string(currency)]
        return (try? core.json("voucherMath", "setupToSave", [form, settings, JSONValue.string(today)])) ?? [:]
    }

    /// The amount per day is missing (shown once Save was tapped).
    var missing: Bool { tried && toSave["missing"]?.boolValue == true }

    /// Save: the words to show (saved, or turned off with its note), nil when it didn't save.
    func save() async -> SetupSaved? {
        tried = true
        let answer = toSave
        guard answer["missing"]?.boolValue != true, let next = answer["settings"] else { return nil }
        busy = true
        defer { busy = false }
        do {
            try await data.profile.saveMealVouchers(next)
            failed = nil
            let had = !settings.isNull
            settings = next
            if next.isNull {
                return SetupSaved(title: core.text("vouchers:setup.off"),
                                  note: had ? core.text("vouchers:setup.offHint") : nil)
            }
            return SetupSaved(title: core.text("vouchers:setup.saved"), note: nil)
        } catch {
            failed = core.text("common:errors.generic")
            return nil
        }
    }
}

/// What a save said: saved, or turned off (with its note when there was a setup).
struct SetupSaved: Equatable {
    let title: String
    let note: String?
}
