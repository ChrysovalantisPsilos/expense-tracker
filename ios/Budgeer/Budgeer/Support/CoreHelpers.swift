// Small conveniences over BudgeerCore that every view model uses: today's
// date as the web writes it, a worded string, and a JSON answer. Each is one
// core call; nothing is computed here.
import Foundation
import BudgeerCore

extension BudgeerCore {
    /// dates.isoDate: `now` as the local calendar's 'YYYY-MM-DD'.
    func isoDate(_ now: Date) throws -> String {
        try call("dates", "isoDate", [JSDate(now)])
    }

    /// i18n.t: a string by its "ns:key", filled in and pluralised as the web does.
    func text(_ key: String, _ vars: JSONValue = [:]) -> String {
        (try? call("i18n", "t", [key, vars])) ?? key
    }

    /// A call whose answer the caller reads as JSON.
    func json(_ module: String, _ fn: String, _ args: [Encodable]) throws -> JSONValue {
        try call(module, fn, args)
    }

    /// currency.formatMoney: minor units as the app shows them.
    func formatMoney(_ minor: JSONValue, _ currency: String) -> String {
        (try? call("currency", "formatMoney", [minor, currency])) ?? ""
    }
}
