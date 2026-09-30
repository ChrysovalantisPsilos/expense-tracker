// The Insights page's spending and income cards as the web's Insights.jsx
// works them out, every step a core call (in Node the same sequence writes
// the parity fixture: mobile-core/screenFigures.mjs insightsFigures): the
// last six months (lastMonths), the rows spread and shifted (spendRows),
// the trend (buildTrend), "Where your money went" for the picked month
// (spendingShares, pickedMonthLabel), the six-month bars and headline
// (spendingBars), and this month's income, spend, left over and change
// (incomeFigures). Swift Charts only draws what this holds.
import Foundation
import BudgeerCore

struct ShareItem: Codable, Equatable, Sendable {
    let name: String
    let label: String
    /// Whole percent; the shares add up to 100.
    let share: Int
    /// "Other", merging several buckets.
    let folded: Bool?
}

struct TrendBar: Codable, Equatable, Sendable {
    let label: String
    /// The month's spend in major units (the bar's height).
    let value: Double
    /// What a tap says ("Aug: €1,540.00. Show this month").
    let ariaLabel: String
}

struct SignedFigure: Codable, Equatable, Sendable {
    let text: String
    /// 'positive', 'negative' or 'muted'.
    let tone: String
}

struct InsightsFigures: Codable, Equatable, Sendable {
    struct Bars: Codable, Equatable, Sendable {
        /// "Aug: €1,540.00", over the bars.
        let aside: String
        let bars: [TrendBar]
    }
    struct Income: Codable, Equatable, Sendable {
        let income: String
        let spent: String
        /// What's left over (income − expenses − savings taken from income).
        let net: SignedFigure
        /// Spending's change from last month in percent (nil without one).
        let delta: Int?
    }
    struct Month: Codable, Equatable, Sendable {
        let label: String
        let income: Double
        let expense: Double
    }

    let fetchFrom: String
    let fetchTo: String
    let picked: Int
    let monthLabel: String
    let shares: [ShareItem]
    let hasTrend: Bool
    let bars: Bars
    let income: Income
    let chart: [Month]

    /// lastMonths(6): the months and where to read their rows from and to.
    static func months(now: Date, core: BudgeerCore) throws -> JSONValue {
        try core.json("dates", "lastMonths", [6, JSDate(now)])
    }

    /// - rows: my_transactions over the six months with p_spread
    /// - picked: the month tapped (an index into the six), nil for this one
    static func compute(profile: JSONValue, categories: JSONValue, rows: JSONValue, now: Date, picked: Int?,
                        core: BudgeerCore) throws -> InsightsFigures {
        let base = profile["base_currency"]?.stringValue ?? "EUR"
        let months = try months(now: now, core: core)
        let list = months.arrayValue ?? []
        let from = list.first?["from"] ?? .null
        let to = list.last?["to"] ?? .null
        let options: JSONValue = ["separateYearly": .bool(profile["yearly_separate"]?.boolValue ?? false),
                                  "salaryShift": try core.json("salaryShift", "salaryShiftOf", [profile])]
        let spend = try core.json("spread", "spendRows", [rows, base, from, to, options])
        let savingsIds = try core.json("savings", "savingsIdsOf", [categories])
        let trend = try core.json("insightsMath", "buildTrend", [spend, months, base, savingsIds])
        let index = picked ?? (list.count - 1)
        let key = list.indices.contains(index) ? (list[index]["key"] ?? .null) : .null
        return InsightsFigures(
            fetchFrom: from.stringValue ?? "",
            fetchTo: to.stringValue ?? "",
            picked: index,
            monthLabel: try core.call("insightsMath", "pickedMonthLabel", [months, index, JSDate(now)]),
            shares: try core.call("insightsMath", "spendingShares", [spend, key, base]),
            hasTrend: try core.call("insightsMath", "hasTrendData", [trend]),
            bars: try core.call("insightsMath", "spendingBars", [trend, index, base]),
            income: try core.call("insightsMath", "incomeFigures", [trend, base]),
            chart: try trend.decode([Month].self))
    }
}
