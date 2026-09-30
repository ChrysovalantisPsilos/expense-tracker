// Home's figures, every one from the core: the web's Dashboard.jsx steps
// (thisMonthPeriod, salaryShiftOf, savingsIdsOf, spendRows, periodTotals,
// periodProjection, projectedTotals, categoryBars, bucketLabels, formatMoney,
// formatSigned, signTone, savingsLine) called one by one through
// BudgeerCore, each answer carried to the next as the JSON it came as.
// Nothing is added, summed, rounded or worded here. The same sequence, run
// in Node, writes the parity fixture (mobile-core/homeFigures.mjs); the
// Swift test HomeParityTests must get its figures from this file.
import Foundation
import BudgeerCore

/// What the reads give: the rows as my_transactions returns them, the
/// profile columns, the savings categories, and the instant "now".
struct HomeInput: Equatable, Sendable {
    let rows: JSONValue
    let profile: JSONValue
    let categories: JSONValue
    let now: Date
}

struct HomePeriod: Codable, Equatable, Sendable {
    let value: String
    let from: String?
    let to: String?
    let label: String
}

struct HomeBar: Codable, Equatable, Sendable {
    let name: String
    /// The name on screen (a default category in the app's language, a group's name).
    let label: String
    let value: Double
    /// Integer share of the spending, the shares summing to 100.
    let share: Int
    /// The bar's length relative to the largest, 0…1.
    let ratio: Double
    let amount: String
}

struct HomeFigures: Codable, Equatable, Sendable {
    let period: HomePeriod
    /// Where the rows were fetched from (before the period with a salary shift).
    let fetchFrom: String
    let spentTotal: Double
    let earnedTotal: Double
    let netTotal: Double
    let spent: String
    let income: String
    let net: String
    /// 'positive', 'negative' or 'muted' (kitMath.signTone).
    let netTone: String
    /// The savings line under the overview, when there is one.
    let saved: String?
    let bars: [HomeBar]

    // categoryBars' `top`: the web passes Infinity (Home folds nothing);
    // JSON can't carry it, so a number no list reaches (homeFigures.mjs NO_FOLD).
    static let noFold = 1_000_000

    /// The month `now` is in and where to fetch its rows from, given the profile.
    static func window(profile: JSONValue, now: Date, core: BudgeerCore) throws -> (period: HomePeriod, fetchFrom: String?) {
        let period: JSONValue = try core.call("periods", "thisMonthPeriod", [JSDate(now)])
        let salaryShift: JSONValue = try core.call("salaryShift", "salaryShiftOf", [profile])
        let from = period["from"] ?? .null
        let fetchFrom: JSONValue = try core.call("salaryShift", "shiftFetchFrom", [from, salaryShift])
        return (try decode(period), fetchFrom.stringValue ?? from.stringValue)
    }

    static func compute(_ input: HomeInput, core: BudgeerCore) throws -> HomeFigures {
        let period: JSONValue = try core.call("periods", "thisMonthPeriod", [JSDate(input.now)])
        let from = period["from"] ?? .null
        let to = period["to"] ?? .null
        let baseCurrency = input.profile["base_currency"]?.stringValue ?? "EUR"
        let separateYearly = input.profile["yearly_separate"]?.boolValue ?? false
        let salaryShift: JSONValue = try core.call("salaryShift", "salaryShiftOf", [input.profile])
        let savingsIds: JSONValue = try core.call("savings", "savingsIdsOf", [input.categories])
        let options: JSONValue = .object(["separateYearly": .bool(separateYearly), "salaryShift": salaryShift])
        let spend: JSONValue = try core.call("spread", "spendRows", [input.rows, baseCurrency, from, to, options])
        let totals: JSONValue = try core.call("dashboardMath", "periodTotals", [spend, baseCurrency, savingsIds])
        let todayISO: String = try core.call("dates", "isoDate", [JSDate(input.now)])
        let range: JSONValue = .object(["from": from, "to": to])
        let proj: JSONValue = try core.call("dashboardMath", "periodProjection",
                                            [JSONValue.array([]), range, todayISO, separateYearly, salaryShift, savingsIds])
        let figures: JSONValue = try core.call("dashboardMath", "projectedTotals", [totals, proj])
        // bucketRow is a Map (tagged {"$":"map","v":[[key, row], …]}); its rows label the bars.
        let bucketRows: [JSONValue] = (totals["bucketRow"]?["v"]?.arrayValue ?? []).compactMap { $0.arrayValue?.last }
        let labels: JSONValue = try core.call("txnRollup", "bucketLabels", [JSONValue.array(bucketRows)])
        let byCategory = totals["byCategory"] ?? JSONValue.array([])
        let ranked: [JSONValue] = try core.call("breakdown", "categoryBars", [byCategory, noFold])
        let bars = try ranked.map { c -> HomeBar in
            let value = c["value"]?.doubleValue ?? 0
            let label: String = try core.call("txnRollup", "bucketLabel", [c, labels])
            let amount: String = try core.call("currency", "formatMoney", [value, baseCurrency])
            return HomeBar(name: c["name"]?.stringValue ?? "", label: label, value: value,
                           share: c["share"]?.intValue ?? 0, ratio: c["ratio"]?.doubleValue ?? 0, amount: amount)
        }
        let spentTotal = figures["spentTotal"]?.doubleValue ?? 0
        let earnedTotal = figures["earnedTotal"]?.doubleValue ?? 0
        let netTotal = figures["netTotal"]?.doubleValue ?? 0
        let fetchFrom: JSONValue = try core.call("salaryShift", "shiftFetchFrom", [from, salaryShift])
        let saved: JSONValue = try core.call("dashboardMath", "savingsLine",
                                             [totals["saved"] ?? JSONValue.int(0), figures["fromSavingsTotal"] ?? JSONValue.int(0), period, baseCurrency])
        return HomeFigures(
            period: try decode(period),
            fetchFrom: fetchFrom.stringValue ?? from.stringValue ?? "",
            spentTotal: spentTotal,
            earnedTotal: earnedTotal,
            netTotal: netTotal,
            spent: try core.call("currency", "formatMoney", [spentTotal, baseCurrency]),
            income: try core.call("currency", "formatMoney", [earnedTotal, baseCurrency]),
            net: try core.call("currency", "formatSigned", [netTotal, baseCurrency, JSONValue.object(["plus": .bool(true)])]),
            netTone: try core.call("kitMath", "signTone", [netTotal]),
            saved: saved.stringValue,
            bars: bars)
    }

    private static func decode<T: Decodable>(_ value: JSONValue) throws -> T {
        try JSONDecoder().decode(T.self, from: JSONEncoder().encode(value))
    }
}
