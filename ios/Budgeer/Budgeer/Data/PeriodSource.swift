// The period pickers' options, as the web builds them: from the first
// transaction up to now (useOldestTransactionDate), through the core's
// buildPeriods, cut by the user's pay months with the salary setting on
// (my_pay_calendar → payCalendar.payCalendar, as the web's ProfileProvider
// does). The reads are the web's; every rule is the core's.
import Foundation
import BudgeerCore

struct PeriodOptions: Equatable, Sendable {
    let periods: [HomePeriod]
    /// The first transaction's date (nil: none).
    let oldest: String?
    /// False when it couldn't be read (so nothing reads as "no entries").
    let oldestKnown: Bool
    /// The user's pay calendar (payCalendar's Cal), null with the setting off.
    let cal: JSONValue
}

enum PeriodSource {
    static func load(profile: JSONValue, data: DataLayer, core: BudgeerCore, now: Date) async -> PeriodOptions {
        var oldest: String?
        var known = true
        do { oldest = try await data.transactions.oldestDate() } catch { known = false }
        let cal = await calendar(profile: profile, data: data, core: core, now: now)
        let options: JSONValue = ["cal": cal]
        let periods: [HomePeriod] = (try? core.call("periods", "buildPeriods", [oldest.json, JSDate(now), options])) ?? []
        return PeriodOptions(periods: periods, oldest: oldest, oldestKnown: known, cal: cal)
    }

    /// The pay calendar: null while the salary setting is off (no read at
    /// all), else the core's payCalendar over my_pay_calendar's dates, as of
    /// the device's today. A failed read counts as no paydays yet.
    static func calendar(profile: JSONValue, data: DataLayer, core: BudgeerCore, now: Date) async -> JSONValue {
        guard let shift = try? core.json("payCalendar", "salaryShiftOf", [profile]), !shift.isNull,
              let today = try? core.isoDate(now) else {
            return .null
        }
        let read = (try? await data.transactions.payCalendar()) ?? ["days": []]
        return (try? core.json("payCalendar", "payCalendar", [shift, read["days"] ?? [], today])) ?? .null
    }

    /// The newest payday (payCalendar.paydayHints' lastPayDay), or null.
    static func lastPayDay(data: DataLayer) async -> JSONValue {
        let read = (try? await data.transactions.payCalendar()) ?? ["days": []]
        return read["days"]?.arrayValue?.last ?? .null
    }
}
