// The Recurring page as the web's Recurring.jsx works it out, every step a
// core call (in Node the same sequence writes the parity fixture:
// mobile-core/screenFigures.mjs recurringFigures): the subscriptions by
// frequency (subscriptionGroups, foreign rules at today's rates), each
// group's headline (groupTotalParts), the income tab (incomeRules,
// incomePerMonth, incomeTotalParts), and each rule's row (ruleRowParts).
import Foundation
import BudgeerCore

/// One rule as the page lists it (recurringMath.ruleRowParts).
struct RuleRow: Codable, Equatable, Identifiable, Sendable {
    let id: String
    let title: String
    let look: CategoryLook
    let active: Bool
    /// How often, the next charge, a yearly expense's budget share.
    let meta: [String]
    /// "3d": remind that many days before.
    let remind: String?
    /// "Paused".
    let paused: String?
    let amount: String
    /// A foreign rule's charge in the base currency at today's rate.
    let hint: String?
    let tone: String
}

/// A total's headline and its rates notes (groupTotalParts / incomeTotalParts).
struct RuleTotal: Codable, Equatable, Sendable {
    let label: String?
    let value: String
    let perMonth: String?
    let converted: String?
    let missing: String?
}

struct RuleGroup: Codable, Equatable, Identifiable, Sendable {
    let key: String
    let label: String
    let total: RuleTotal
    let rows: [RuleRow]
    var id: String { key }
}

struct RecurringFigures: Codable, Equatable, Sendable {
    struct Income: Codable, Equatable, Sendable {
        let total: RuleTotal
        let rows: [RuleRow]
    }
    let groups: [RuleGroup]
    let income: Income

    /// - rules: my_recurring_rules; categories: the savings categories
    /// - rates: today's rate of each foreign currency among the rules ({ USD: 0.9 })
    static func compute(profile: JSONValue, categories: JSONValue, rules: JSONValue, rates: JSONValue,
                        core: BudgeerCore) throws -> RecurringFigures {
        let base = profile["base_currency"]?.stringValue ?? "EUR"
        let options: JSONValue = ["baseCurrency": .string(base), "rates": rates,
                                  "separateYearly": .bool(profile["yearly_separate"]?.boolValue ?? false)]
        let savingsIds = try core.json("savings", "savingsIdsOf", [categories])
        let income = try core.json("recurringMath", "incomePerMonth", [rules, savingsIds, base, rates])
        let groups = try core.json("recurringMath", "subscriptionGroups", [rules, base, ["rates": rates] as JSONValue])
        let shaped = try (groups.arrayValue ?? []).map { group -> RuleGroup in
            RuleGroup(key: group["key"]?.stringValue ?? "", label: group["label"]?.stringValue ?? "",
                      total: try core.call("recurringMath", "groupTotalParts", [group, base]),
                      rows: try rows(group["rules"] ?? [], options, core))
        }
        let incomeRules = try core.json("recurringMath", "incomeRules", [rules])
        return RecurringFigures(
            groups: shaped,
            income: Income(total: try core.call("recurringMath", "incomeTotalParts", [income, base]),
                           rows: try rows(incomeRules, options, core)))
    }

    private static func rows(_ rules: JSONValue, _ options: JSONValue, _ core: BudgeerCore) throws -> [RuleRow] {
        try (rules.arrayValue ?? []).map { try core.call("recurringMath", "ruleRowParts", [$0, options]) }
    }
}
