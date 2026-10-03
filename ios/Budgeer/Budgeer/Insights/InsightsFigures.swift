// The Insights page's spending and income cards as the web's Insights.jsx
// works them out, every step a core call (in Node the same sequence writes
// the parity fixture: mobile-core/screenFigures.mjs insightsFigures): the
// last six months (lastPayMonths: pay months with the salary setting on),
// the rows spread (spendRows),
// the trend (buildTrend), "Where your money went" for the picked month
// (spendingShares, pickedMonthLabel, each entry's link: linkBuckets), the six-month bars and headline
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
    /// Where the entry drills down to (categoryLinks.linkBuckets: its
    /// category's page, or its group's; none for "Other"), and its spoken name.
    let to: String?
    let linkLabel: String?
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
    /// "Spending abroad" (abroadCard), nil without a foreign payment this month.
    let abroad: Abroad?

    struct Abroad: Codable, Equatable, Sendable {
        struct Row: Codable, Equatable, Identifiable, Sendable {
            let id: String
            let label: String
            let rate: String
            let from: String
            let to: String
        }
        let subtitle: String
        let rows: [Row]
        let more: String?
        let total: String
    }

    /// lastPayMonths(6): the months (pay months with `cal`) and where to read
    /// their rows from and to.
    static func months(now: Date, cal: JSONValue = .null, core: BudgeerCore) throws -> JSONValue {
        try core.json("periods", "lastPayMonths", [6, JSDate(now), cal])
    }

    /// - rows: my_transactions over the six months with p_spread
    /// - picked: the month tapped (an index into the six), nil for this one
    /// - moves: my_group_flow over the six months (the trend's net counts them, as Home's Net does)
    static func compute(profile: JSONValue, categories: JSONValue, rows: JSONValue, moves: JSONValue = [], now: Date,
                        picked: Int?, cal: JSONValue = .null, core: BudgeerCore) throws -> InsightsFigures {
        let base = profile["base_currency"]?.stringValue ?? "EUR"
        let months = try months(now: now, cal: cal, core: core)
        let list = months.arrayValue ?? []
        let from = list.first?["from"] ?? .null
        let to = list.last?["to"] ?? .null
        let options: JSONValue = ["separateYearly": .bool(profile["yearly_separate"]?.boolValue ?? false), "cal": cal]
        let spend = try core.json("spread", "spendRows", [rows, base, from, to, options])
        let savingsIds = try core.json("savings", "savingsIdsOf", [categories])
        let trend = try core.json("insightsMath", "buildTrend", [spend, months, base, savingsIds, moves, cal])
        let index = picked ?? (list.count - 1)
        let key = list.indices.contains(index) ? (list[index]["key"] ?? .null) : .null
        let monthLabel: String = try core.call("insightsMath", "pickedMonthLabel", [months, index, JSDate(now)])
        let month = (list.indices.contains(index) ? list[index] : JSONValue.object([:])).with("label", .string(monthLabel))
        let shares = try core.json("insightsMath", "spendingShares", [spend, key, base, cal])
        return InsightsFigures(
            fetchFrom: from.stringValue ?? "",
            fetchTo: to.stringValue ?? "",
            picked: index,
            monthLabel: monthLabel,
            shares: try core.call("categoryLinks", "linkBuckets", [shares, spend, month]),
            hasTrend: try core.call("insightsMath", "hasTrendData", [trend]),
            bars: try core.call("insightsMath", "spendingBars", [trend, index, base]),
            income: try core.call("insightsMath", "incomeFigures", [trend, base]),
            chart: try trend.decode([Month].self),
            abroad: try abroad(rows: rows, month: list.last?["key"] ?? .null, base: base, cal: cal, core: core))
    }

    /// foreignSpending over this month's rows, worded by abroadCard (nil when none).
    static func abroad(rows: JSONValue, month: JSONValue, base: String, cal: JSONValue = .null,
                       core: BudgeerCore) throws -> Abroad? {
        let spending = try core.json("insightsMath", "foreignSpending", [rows, month, base, cal])
        guard !(spending["items"]?.arrayValue ?? []).isEmpty else { return nil }
        return try core.call("insightsMath", "abroadCard", [spending, base])
    }
}
