// The period pickers' options, as the web builds them: from the first
// transaction up to now (useOldestTransactionDate), plus next month once a
// salary that counts in it is in (useNewestCountedDate), through the core's
// buildPeriods. The reads are the web's; every rule is the core's.
import Foundation
import BudgeerCore

struct PeriodOptions: Equatable, Sendable {
    let periods: [HomePeriod]
    /// The first transaction's date (nil: none).
    let oldest: String?
    /// False when it couldn't be read (so nothing reads as "no entries").
    let oldestKnown: Bool
}

enum PeriodSource {
    static func load(profile: JSONValue, data: DataLayer, core: BudgeerCore, now: Date) async -> PeriodOptions {
        var oldest: String?
        var known = true
        do { oldest = try await data.transactions.oldestDate() } catch { known = false }
        let newest = await newestCounted(profile: profile, data: data, core: core, now: now)
        let options: JSONValue = ["newestISO": newest]
        let periods: [HomePeriod] = (try? core.call("periods", "buildPeriods", [oldest.json, JSDate(now), options])) ?? []
        return PeriodOptions(periods: periods, oldest: oldest, oldestKnown: known)
    }

    /// useNewestCountedDate: the date the newest salary in counts on, when
    /// that's next month (else null); no read while the salary setting is off.
    static func newestCounted(profile: JSONValue, data: DataLayer, core: BudgeerCore, now: Date) async -> JSONValue {
        guard let shift = try? core.json("salaryShift", "salaryShiftOf", [profile]), !shift.isNull,
              let categoryId = shift["categoryId"]?.stringValue,
              let nextMonth: String = try? core.call("periods", "nextMonthStart", [JSDate(now)]),
              let since: String = try? core.call("salaryShift", "shiftFetchFrom", [nextMonth, shift]),
              let rows = try? await data.transactions.newestIncome(categoryId: categoryId, since: since) else {
            return .null
        }
        let first = rows.arrayValue?.first ?? .null
        return (try? core.json("salaryShift", "newestCountedDate", [first, shift, nextMonth])) ?? .null
    }
}
