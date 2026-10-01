// The Meal vouchers page as the web's Vouchers.jsx works it out, every step a
// core call (in Node the same sequence writes the parity fixture:
// mobile-core/screenFigures.mjs voucherFigures): what's on the card and this
// month's top-ups and spending (voucherSummary, voucherPageParts), the next
// top-up (nextTopUp, nextTopUpText), "Edit days" for the month it pays for
// (daysFor, daysFixParts), the card's history (voucherHistory,
// voucherHistoryParts), and Settings › Meal vouchers' form as it opens
// (setupDraft) with its choices (countryOptions).
import Foundation
import BudgeerCore

/// A line of the card's history: an expense paid with vouchers (`row` to
/// open it), a top-up, or the balance the setup started from.
struct VoucherLine: Codable, Equatable, Identifiable, Sendable {
    let key: String
    /// 'spend', 'topup' or 'start'.
    let type: String
    let row: JSONValue?
    let look: CategoryLook?
    let title: String
    let meta: String
    let amount: String
    let tone: String
    var id: String { key }
}

/// A month of the history: its heading, its net change, its lines.
struct VoucherMonth: Codable, Equatable, Identifiable, Sendable {
    let month: String
    let heading: String
    let net: SignedFigure
    let items: [VoucherLine]
    var id: String { month }
}

/// "Edit days" at a number of days (daysFixParts).
struct DaysFix: Codable, Equatable, Sendable {
    struct Total: Codable, Equatable, Sendable {
        let perDay: String
        let amount: String
    }
    let label: String
    /// The values of "× {{perDay}} = <b>{{amount}}</b>" (vouchers:fix.total).
    let total: Total
    let hint: String
    let fewer: Bool
    let more: Bool
}

/// Settings › Meal vouchers' form as it opens (setupDraft).
struct VoucherSetupDraft: Codable, Equatable, Sendable {
    let on: Bool
    let perDay: String
    let country: String
    let topUpOn: String
    let onCard: String
    let currency: String
}

/// A choice as the core words it ({ value, label }: the working days' countries, the history's filters).
struct CoreChoice: Codable, Equatable, Sendable {
    let value: String
    let label: String
}

struct VoucherFigures: Codable, Equatable, Sendable {
    struct Card: Codable, Equatable, Sendable {
        let balance: String
        let tone: String
        let topUps: SignedFigure
        let spent: SignedFigure
    }
    struct Next: Codable, Equatable, Sendable {
        /// "+€176.00 on 5 Oct".
        let amount: String
        /// "September · 22 working days × €8.00".
        let why: String
        /// The month it pays for ('YYYY-MM').
        let month: String
    }
    struct Fix: Codable, Equatable, Sendable {
        /// The days it opens on (the fix, else the calendar's).
        let days: Int
        let label: String
        let total: DaysFix.Total
        let hint: String
        let fewer: Bool
        let more: Bool
    }

    let card: Card
    let next: Next
    let fix: Fix
    let history: [VoucherMonth]
    let setup: VoucherSetupDraft
    let countries: [CoreChoice]

    /// - settings: my_meal_vouchers; spends: my_transactions(expense, p_paid_with_vouchers)
    static func compute(settings: JSONValue, spends: JSONValue, profile: JSONValue, now: Date,
                        core: BudgeerCore) throws -> VoucherFigures {
        let day = JSONValue.string(try core.isoDate(now))
        let summary = try core.json("voucherMath", "voucherSummary", [settings, spends, day])
        let next = try core.json("voucherMath", "nextTopUp", [settings, day])
        let month = next["month"] ?? .null
        let days = try core.json("voucherMath", "daysFor", [settings, month])["days"] ?? .int(0)
        let text = try core.json("voucherText", "nextTopUpText", [settings, next])
        let fix = try core.json("voucherText", "daysFixParts", [settings, month, days])
        let history = try core.json("voucherMath", "voucherHistory", [settings, spends, day])
        let date = try JSONValue.from(JSDate(now))
        let base = JSONValue.string(profile["base_currency"]?.stringValue ?? "EUR")
        return VoucherFigures(
            card: try core.call("voucherText", "voucherPageParts", [settings, summary]),
            next: Next(amount: text["amount"]?.stringValue ?? "", why: text["why"]?.stringValue ?? "",
                       month: month.stringValue ?? ""),
            fix: Fix(days: days.intValue ?? 0, label: fix["label"]?.stringValue ?? "",
                     total: try (fix["total"] ?? .null).decode(), hint: fix["hint"]?.stringValue ?? "",
                     fewer: fix["fewer"]?.boolValue ?? false, more: fix["more"]?.boolValue ?? false),
            history: try core.call("voucherText", "voucherHistoryParts", [settings, history, date]),
            setup: try core.call("voucherMath", "setupDraft", [settings, summary["balance"] ?? .int(0), base, day]),
            countries: try core.call("voucherText", "countryOptions", []))
    }

    /// Edit days at `days` (the stepper moved).
    static func fix(settings: JSONValue, month: String, days: Int, core: BudgeerCore) throws -> DaysFix {
        try core.call("voucherText", "daysFixParts", [settings, JSONValue.string(month), JSONValue.int(days)])
    }
}
