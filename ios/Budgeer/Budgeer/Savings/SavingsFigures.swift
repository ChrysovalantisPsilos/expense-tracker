// The Savings page as the web's Savings.jsx works it out, every step a core
// call (in Node the same sequence writes the parity fixture:
// mobile-core/screenFigures.mjs savingsFigures): the savings categories
// (savingsIdsOf), the entries that move the pot (savingsMoves) over every
// income entry and every expense paid from savings, the pot (savingsPotMinor)
// and the total (savingsTotal: the savings accounts when there are any), then
// the page (savingsPage: the first-run explainer, the pot's card with its
// line, this month), the history for a filter (savingsHistory) and each
// goal's card (goalParts). Swift Charts only draws the line's points.
import Foundation
import BudgeerCore

/// One month-end point of the pot's line, in major units, with its amount.
struct PotPoint: Codable, Equatable, Sendable {
    let label: String
    let value: Double
    let text: String
}

/// The pot's card (potCardParts).
struct PotCard: Codable, Equatable, Sendable {
    struct Chip: Codable, Equatable, Sendable {
        /// 'up' (green), 'spent' or 'none'.
        let kind: String
        let text: String
    }
    let total: String
    let tone: String
    /// Where the total comes from (the savings accounts or the entries).
    let note: String
    let chip: Chip
    /// "since May · 5 months", nil without a line.
    let since: String?
    let points: [PotPoint]
    /// The line's points in words, for VoiceOver.
    let chart: String
}

/// "This month" (monthCardParts).
struct SavingsMonth: Codable, Equatable, Sendable {
    struct Tile: Codable, Equatable, Sendable {
        let key: String
        let label: String
        let text: String
        let tone: String
    }
    struct Repeating: Codable, Equatable, Identifiable, Sendable {
        let id: String
        let title: String
        let meta: String
    }
    let subtitle: String
    let tiles: [Tile]
    let net: SignedFigure
    let repeating: [Repeating]
}

/// A history row (savingsRowParts); `row` is the entry, to edit or delete.
struct SavingsEntryRow: Codable, Equatable, Identifiable, Sendable {
    let id: String
    let row: JSONValue
    let look: CategoryLook
    let title: String
    let date: String
    let note: String?
    let out: Bool
    let repeats: Bool
    let amount: String
    let tone: String
}

/// A month of the history: its heading, its net change, its rows.
struct SavingsMonthGroup: Codable, Equatable, Identifiable, Sendable {
    let key: String
    let heading: String
    let net: SignedFigure
    let rows: [SavingsEntryRow]
    var id: String { key }
}

/// "Savings history" for a filter (savingsHistory).
struct SavingsHistoryFigures: Codable, Equatable, Sendable {
    let groups: [SavingsMonthGroup]
    /// Why there is nothing, nil when there is.
    let empty: String?
}

/// A goal's card (goalParts).
struct GoalCard: Codable, Equatable, Identifiable, Sendable {
    struct Status: Codable, Equatable, Sendable {
        let text: String
        let strong: Bool
    }
    struct Arcs: Codable, Equatable, Sendable {
        /// [start, length] as fractions of the ring, from 12 o'clock.
        let amber: [Double]
        let coral: [Double]
    }
    let id: String
    let name: String
    let pct: Int
    let done: Bool
    /// The quick buttons' step (minor units).
    let step: Int
    let of: String
    let status: Status
    let plus: String?
    let minus: String?
    let arcs: Arcs
}

struct SavingsFigures: Codable, Equatable, Sendable {
    /// Nothing saved yet: the page explains how savings work.
    let first: Bool
    let pot: PotCard
    let month: SavingsMonth
    let history: SavingsHistoryFigures
    let goals: [GoalCard]

    /// - categories: the savings categories (id, kind, is_savings)
    /// - income: my_transactions(kind income); fromSavings: my_transactions(expense, p_paid_from_savings)
    /// - accounts: my_accounts; rules: my_recurring_rules; goals: my_goals
    /// - filter: the history's 'all', 'in' or 'out'
    static func compute(profile: JSONValue, categories: JSONValue, income: JSONValue, fromSavings: JSONValue,
                        accounts: JSONValue, rules: JSONValue, goals: JSONValue, filter: String, now: Date,
                        core: BudgeerCore) throws -> SavingsFigures {
        let base = JSONValue.string(profile["base_currency"]?.stringValue ?? "EUR")
        let ids = try core.json("savings", "savingsIdsOf", [categories])
        let rows = JSONValue.array((income.arrayValue ?? []) + (fromSavings.arrayValue ?? []))
        let moves = try core.json("savingsMath", "savingsMoves", [rows, ids])
        let pot = try core.json("savings", "savingsPotMinor", [moves, ids, base])
        let total = try core.json("savings", "savingsTotal", [accounts, pot])
        let date = try JSONValue.from(JSDate(now))
        let page = try core.json("savingsMath", "savingsPage", [[
            "moves": moves, "total": total, "savingsIds": ids, "baseCurrency": base, "rules": rules, "now": date,
        ] as JSONValue])
        let history: SavingsHistoryFigures = try core.call("savingsMath", "savingsHistory",
                                                           [moves, ids, base, JSONValue.string(filter), date])
        let cards: [GoalCard] = try (goals.arrayValue ?? []).map { goal in
            try core.call("savingsMath", "goalParts", [goal, date])
        }
        return SavingsFigures(first: page["first"]?.boolValue ?? false,
                              pot: try (page["pot"] ?? .null).decode(),
                              month: try (page["month"] ?? .null).decode(),
                              history: history,
                              goals: cards)
    }
}
