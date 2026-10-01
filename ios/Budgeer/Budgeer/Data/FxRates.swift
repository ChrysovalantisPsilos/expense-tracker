// The two exchange-rate steps a screen takes before its figures, as fx.js
// takes them: the network part here (FxRepository), every rule from the core
// (currency.pendingRateSpans / withEstimatedRates, ruleFx.foreignCurrencies).
import Foundation
import BudgeerCore

enum FxRates {
    /// fx.js fillPendingRates: rows whose rate the server hasn't filled in yet
    /// get the ECB rate for their date, flagged `rate_estimated` (a row with
    /// no rate stays null: sums leave it out, never 1:1).
    static func fillPending(_ rows: JSONValue, base: String, today: String, fx: FxRepository,
                            core: BudgeerCore) async throws -> JSONValue {
        let spans: JSONValue = try core.call("currency", "pendingRateSpans", [rows, base])
        if JSONValue.mapPairs(spans).isEmpty { return rows }
        let byCurrency = await seriesMap(spans, to: base, fx: fx)
        return try core.call("currency", "withEstimatedRates", [rows, base, byCurrency, today])
    }

    /// fx.js getRateSeriesMap: one ECB series per currency of `spans` (the
    /// core's Map of currency → { first, last }) into `base`, as the Map the
    /// core reads: {"$":"map","v":[[currency, [[date, rate]]], …]}.
    static func seriesMap(_ spans: JSONValue, to base: String, fx: FxRepository) async -> JSONValue {
        var series: [JSONValue] = []
        for pair in JSONValue.mapPairs(spans) {
            guard let currency = pair.key.stringValue, let first = pair.value["first"]?.stringValue,
                  let last = pair.value["last"]?.stringValue else { continue }
            let rates = await fx.series(from: currency, to: base, first: first, last: last)
            series.append([pair.key, rates])
        }
        return ["$": "map", "v": .array(series)]
    }

    /// fx.js useLatestRates for recurring rules: today's rate of each foreign
    /// currency among `rules` into `base` ({ PLN: 0.2327, … }); a currency with
    /// no rate is simply absent.
    static func latest(for rules: JSONValue, base: String, fx: FxRepository, core: BudgeerCore) async throws -> JSONValue {
        let currencies: [String] = try core.call("ruleFx", "foreignCurrencies", [rules, base])
        var rates: [String: JSONValue] = [:]
        for currency in currencies {
            if let rate = await fx.rate(from: currency, to: base, date: nil)?["rate"] {
                rates[currency] = rate
            }
        }
        return .object(rates)
    }
}
