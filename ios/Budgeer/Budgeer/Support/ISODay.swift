// The app's dates are the web's: 'YYYY-MM-DD' strings in the local calendar
// (shared/lib/dates.js). A date picker works in Date; this only converts
// between the two, in the device's calendar and time zone (no date maths).
import Foundation

enum ISODay {
    private static let formatter: DateFormatter = {
        let formatter = DateFormatter()
        formatter.calendar = Calendar(identifier: .gregorian)
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.timeZone = .current
        formatter.dateFormat = "yyyy-MM-dd"
        return formatter
    }()

    /// 'YYYY-MM-DD' → noon of that day (safe from DST edges), or nil.
    static func date(_ iso: String) -> Date? {
        guard let day = formatter.date(from: iso) else { return nil }
        return Calendar(identifier: .gregorian).date(byAdding: .hour, value: 12, to: day)
    }

    /// A picked day → 'YYYY-MM-DD'.
    static func string(_ date: Date) -> String {
        formatter.string(from: date)
    }
}
