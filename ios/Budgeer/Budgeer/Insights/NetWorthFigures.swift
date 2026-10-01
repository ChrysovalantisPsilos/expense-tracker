// Insights' net worth as the web's NetWorthCard (with useSavingsMoves) works
// it out, every step a core call (in Node the same sequence writes the parity
// fixture: mobile-core/screenFigures.mjs netWorthFigures): the savings pot
// from every income entry and every expense paid from savings (savingsIdsOf,
// savingsMoves, savingsPotMinor), then the card (insightsMath.netWorthParts).
import Foundation
import BudgeerCore

struct NetWorthCard: Codable, Equatable, Sendable {
    struct Row: Codable, Equatable, Identifiable, Sendable {
        let id: String
        /// 'asset', 'debt' or 'savings'.
        let kind: String
        let title: String
        let meta: String
        let amount: String
        let tone: String
        /// The account itself (its page edits it).
        let account: JSONValue
    }
    struct Pot: Codable, Equatable, Sendable {
        let amount: String
        let tone: String
        /// "More paid from savings than saved · ", nil while it's above zero.
        let overdrawn: String?
    }
    let assets: String
    let debts: SignedFigure
    let empty: Bool
    let savings: [Row]
    let pot: Pot?
    let accounts: [Row]
    let net: SignedFigure
}

struct NetWorthFigures: Codable, Equatable, Sendable {
    /// The savings pot in minor units of the base currency.
    let pot: Int
    let card: NetWorthCard

    /// - categories: the savings categories; income: every income entry;
    ///   fromSavings: every expense paid from savings; accounts: my_accounts
    static func compute(profile: JSONValue, categories: JSONValue, income: JSONValue, fromSavings: JSONValue,
                        accounts: JSONValue, core: BudgeerCore) throws -> NetWorthFigures {
        let base = JSONValue.string(profile["base_currency"]?.stringValue ?? "EUR")
        let ids = try core.json("savings", "savingsIdsOf", [categories])
        let rows = JSONValue.array((income.arrayValue ?? []) + (fromSavings.arrayValue ?? []))
        let moves = try core.json("savingsMath", "savingsMoves", [rows, ids])
        let pot = try core.json("savings", "savingsPotMinor", [moves, ids, base])
        return NetWorthFigures(pot: pot.intValue ?? 0,
                               card: try core.call("insightsMath", "netWorthParts", [accounts, pot, base]))
    }
}
