// The store screenshots' sample data (Fixtures/store-sample.json): the
// fixtures' fake data as a store picture shows it. Their 2020 moves to 2026
// (the same weekdays from March on, so "Yesterday" and the month's days stay
// true), a category matching a default one gets its key (it then shows in
// the app's language), and the words that are fixture text rather than app
// text (entries, groups, people, the month in words) are swapped for the
// language's own. `StoreSample.plain` changes nothing: the ordinary
// snapshots and the parity tests keep the fixtures as they are.
import Foundation
import XCTest
@testable import Budgeer

struct StoreSample {
    let years: Int
    let defaultKeys: [String: String]
    let names: [String: String]

    static let plain = StoreSample(years: 0, defaultKeys: [:], names: [:])

    static func load(_ lang: String) throws -> StoreSample {
        let file = try JSONValue.parse(fixtureData("store-sample"))
        let strings = { (value: JSONValue?) in (value?.objectValue ?? [:]).compactMapValues(\.stringValue) }
        return StoreSample(years: try XCTUnwrap(file["years"]?.intValue), defaultKeys: strings(file["defaultKeys"]),
                           names: strings(file["names"]?[lang]))
    }

    /// The years the fixtures were written in (and nothing later, so a date
    /// already in 2026 stays where it is).
    private static let fixtureYear = try! NSRegularExpression(pattern: "\\b(201[89]|202[0-2])\\b")

    /// A string with its fixture years moved on: "2020-09-15", "m:2020-8", "y:2020".
    func day(_ text: String) -> String {
        guard years != 0 else { return text }
        let range = NSRange(text.startIndex..., in: text)
        var out = text
        for match in StoreSample.fixtureYear.matches(in: text, range: range).reversed() {
            guard let span = Range(match.range, in: out), let year = Int(out[span]) else { continue }
            out.replaceSubrange(span, with: String(year + years))
        }
        return out
    }

    /// Any value with every date moved on, the default keys added and the words swapped.
    func callAsFunction(_ value: JSONValue) -> JSONValue {
        switch value {
        case .string(let text): return .string(names[text] ?? day(text))
        case .array(let items): return .array(items.map { self($0) })
        case .object(let object):
            var out = [String: JSONValue]()
            for (key, item) in object { out[day(key)] = self(item) }
            if let name = object["name"]?.stringValue, let key = defaultKeys[name], object["default_key"]?.stringValue == nil {
                out["default_key"] = .string(key)
            }
            return .object(out)
        default: return value
        }
    }

    /// Fixtures/<name>.json as this sample has it, read by the fixture's own type.
    func fixture<T: Decodable>(_ type: T.Type, _ name: String) throws -> T {
        try JSONDecoder().decode(T.self, from: JSONEncoder().encode(self(JSONValue.parse(fixtureData(name)))))
    }
}
