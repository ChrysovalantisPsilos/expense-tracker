// "Your salary" as the web's salary.js and SalaryPage work it out, every step
// a core call (in Node the same sequence writes the parity fixture:
// mobile-core/screenFigures.mjs salaryFigures): the corrections as the app
// keeps them (normaliseNotes), the salary and Bonus categories
// (salaryCategoryId, bonusCategoryId), the country prices are compared with
// (defaultCountry), the report (salaryReport), then each card's parts
// (salaryText: the headline, the pay chart, the raises, the years, the
// extras, the projection and the prices). Swift Charts draws the series.
import Foundation
import BudgeerCore

/// A choice whose value is a number (years, a year).
struct NumberChoice: Codable, Equatable, Sendable {
    let value: Int
    let label: String
}

/// A chart's value axis in major units, with its labels ("2.3k").
struct ChartAxisParts: Codable, Equatable, Sendable {
    let domain: [Double]
    let ticks: [Double]
    let labels: [String]
}

/// A year tick under a monthly chart.
struct YearTick: Codable, Equatable, Sendable {
    let key: String
    let label: String
}

struct SalaryHeadline: Codable, Equatable, Sendable {
    let level: String
    /// "+3.2% in Jan 2026", nil: "No raise yet".
    let raise: String?
}

/// The pay chart (payChartParts): a row a month in major units.
struct PayChart: Codable, Equatable, Sendable {
    struct Row: Codable, Equatable, Sendable {
        let key: String
        let off: Bool
        let level: Double
        let pay: Double?
        let holiday: Double
        let thirteenth: Double
        let bonus: Double
    }
    let rows: [Row]
    let ticks: [YearTick]
    let axis: ChartAxisParts
    let hasExtras: Bool
    let hasOff: Bool
    let aria: String
}

struct SalaryRaises: Codable, Equatable, Sendable {
    struct Average: Codable, Equatable, Sendable {
        let text: String
        let tone: String
        let note: String?
    }
    struct Row: Codable, Equatable, Identifiable, Sendable {
        let key: String
        let up: Bool
        let title: String
        let meta: String
        let amount: String
        var id: String { key }
    }
    let since: String
    let average: Average
    let rows: [Row]
    /// "Show all (6)", nil with five or fewer.
    let all: String?
}

struct SalaryYear: Codable, Equatable, Identifiable, Sendable {
    let year: Int
    let title: String
    let meta: String
    let amount: String
    var id: Int { year }
}

struct SalaryExtrasYear: Codable, Equatable, Identifiable, Sendable {
    struct Row: Codable, Equatable, Identifiable, Sendable {
        let id: String
        let key: String
        let kind: String
        let title: String
        let meta: String
        let guess: Bool
        let fixed: Bool
        let amount: String
        let regular: Bool
        let fixLabel: String
    }
    let year: Int
    let total: String
    let rows: [Row]
    var id: Int { year }
}

struct SalaryProjection: Codable, Equatable, Sendable {
    struct Point: Codable, Equatable, Sendable {
        let key: String
        let value: Double
    }
    struct Way: Codable, Equatable, Identifiable, Sendable {
        let id: String
        let title: String
        let meta: String
        let total: String
        let series: [Point]
    }
    struct Slider: Codable, Equatable, Sendable {
        let min: Double
        let max: Double
        let step: Double
        let start: Double
        let value: String
    }
    let horizons: [NumberChoice]
    let ways: [Way]
    let ticks: [YearTick]
    let axis: ChartAxisParts
    let slider: Slider
    let total: String
    let trendLater: String?
}

struct SalaryPrices: Codable, Equatable, Sendable {
    struct Tile: Codable, Equatable, Sendable {
        let key: String
        let label: String
        let text: String
        let tone: String
    }
    let countries: [CoreChoice]
    let choices: [NumberChoice]
    let from: Int?
    let empty: String?
    let headline: String?
    let tiles: [Tile]
    /// The monthly gap (rich: <b>), nil with nothing to compare.
    let gap: String?
    let info: String
}

/// Insights' card: the headline and the regular pay's steps (minor units).
struct SalaryCardParts: Codable, Equatable, Sendable {
    let level: String
    let raise: String?
    let steps: [Int]
}

struct SalaryPageParts: Codable, Equatable, Sendable {
    let headline: SalaryHeadline
    let chart: PayChart
    let raises: SalaryRaises
    let years: [SalaryYear]
    let extras: [SalaryExtrasYear]
    let projection: SalaryProjection
    let prices: SalaryPrices
    let paidMonths: Int

    enum CodingKeys: String, CodingKey {
        case headline, chart, raises, years, extras, projection, paidMonths
        case prices = "inflation"
    }
}

struct SalaryFigures: Codable, Equatable, Sendable {
    struct Choice: Codable, Equatable, Identifiable, Sendable {
        let id: String
        let label: String
    }
    let salaryId: String?
    let bonusId: String?
    /// 'BE' or 'GR'.
    let country: String
    let nowKey: String
    /// The Bonus picker's categories.
    let bonus: [Choice]
    /// nil before any salary entry.
    let card: SalaryCardParts?
    let page: SalaryPageParts?

    /// The corrections as the app keeps them, the categories, the country and the report.
    struct Report: Sendable {
        let notes: JSONValue
        let salaryId: JSONValue
        let bonusId: JSONValue
        let country: String
        let nowKey: String
        /// salaryReport's answer (null before any salary entry).
        let report: JSONValue
    }

    /// - categories: every category; income: every income entry; notes: my_salary_history
    /// - vouchers: my_meal_vouchers (its country); language: the app's
    /// - cal: the pay calendar (null with the salary setting off): every entry counts in its pay month
    static func report(profile: JSONValue, categories: JSONValue, income: JSONValue, notes: JSONValue,
                       vouchers: JSONValue, language: String, now: Date, cal: JSONValue = .null,
                       core: BudgeerCore) throws -> Report {
        let base = JSONValue.string(profile["base_currency"]?.stringValue ?? "EUR")
        let nowKey: String = try core.call("payCalendar", "payMonthOf", [try core.isoDate(now), cal])
        let kept = try core.json("salaryMath", "normaliseNotes", [notes])
        let salaryId = try core.json("planMath", "salaryCategoryId", [profile, categories])
        let bonusId = try core.json("salaryMath", "bonusCategoryId", [categories, kept])
        let country: String = try core.call("salaryMath", "defaultCountry", [[
            "picked": kept["country"] ?? .null, "voucherCountry": vouchers["country"] ?? .null, "language": .string(language),
        ] as JSONValue])
        let report = try core.json("salaryMath", "salaryReport", [income, [
            "salaryId": salaryId, "bonusId": bonusId, "currency": base, "notes": kept,
            "cal": cal, "nowKey": .string(nowKey),
        ] as JSONValue])
        return Report(notes: kept, salaryId: salaryId, bonusId: bonusId, country: country, nowKey: nowKey, report: report)
    }

    /// Every card's parts for `report`: the projection `years` ahead at `whatIf` % a year, the prices from `since`.
    static func compute(_ r: Report, profile: JSONValue, categories: JSONValue, years: Int = 5, whatIf: Double = 2,
                        since: Int? = nil, now: Date, core: BudgeerCore) throws -> SalaryFigures {
        let base = JSONValue.string(profile["base_currency"]?.stringValue ?? "EUR")
        var page: SalaryPageParts?
        if !r.report.isNull {
            let report = r.report
            let country = JSONValue.string(r.country)
            page = SalaryPageParts(
                headline: try core.call("salaryText", "payHeadline", [report, base]),
                chart: try core.call("salaryText", "payChartParts", [report, base]),
                raises: try core.call("salaryText", "raisesParts", [report, base, country]),
                years: try core.call("salaryText", "yearsParts", [report, base, JSONValue.string(r.nowKey)]),
                extras: try core.call("salaryText", "extrasParts", [report, base, JSDate(now)]),
                projection: try core.call("salaryText", "projectionParts", [report, [
                    "country": country, "years": .int(years), "whatIf": .double(whatIf), "nowKey": .string(r.nowKey),
                    "currency": base,
                ] as JSONValue]),
                prices: try core.call("salaryText", "inflationParts", [report, country,
                                                                      since.map { JSONValue.int($0) } ?? .null, base]),
                paidMonths: report["paidMonths"]?.intValue ?? 0)
        }
        return SalaryFigures(salaryId: r.salaryId.stringValue, bonusId: r.bonusId.stringValue, country: r.country,
                             nowKey: r.nowKey, bonus: try core.call("salaryText", "bonusChoices", [categories, r.salaryId]),
                             card: try core.call("salaryText", "salaryCardParts", [r.report, base]), page: page)
    }
}
