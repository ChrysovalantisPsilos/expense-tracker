// Replay every recorded vector (Resources/vectors.json, from
// `npm run core:vectors`: the calls the web app's unit tests made into the
// core modules, with their results) through JavaScriptCore and compare the
// results as JSON values: exact for strings, booleans, integers and
// structure; a tolerance of 1e-9 (relative) for fractional numbers. Run
// with TZ=UTC, the zone the vectors were recorded in.
import Foundation
import XCTest
@testable import BudgeerCore

final class VectorReplayTests: XCTestCase {
    /// One recorded call: module, function, language (absent = "en"), the
    /// arguments as the exact JSON text they were recorded with (an object's
    /// key order is part of the call), and the result as a JSON tree.
    struct Vector: Decodable {
        let m: String
        let f: String
        let l: String?
        let a: String
        let r: JSONValue
    }

    struct File: Decodable {
        let vectors: [Vector]
    }

    /// A JSON tree, decoded as it is.
    indirect enum JSONValue: Decodable {
        case null
        case bool(Bool)
        case number(Double, isInteger: Bool)
        case string(String)
        case array([JSONValue])
        case object([String: JSONValue])

        init(from decoder: Decoder) throws {
            let container = try decoder.singleValueContainer()
            if container.decodeNil() { self = .null; return }
            if let bool = try? container.decode(Bool.self) { self = .bool(bool); return }
            if let int = try? container.decode(Int64.self) { self = .number(Double(int), isInteger: true); return }
            if let double = try? container.decode(Double.self) { self = .number(double, isInteger: false); return }
            if let string = try? container.decode(String.self) { self = .string(string); return }
            if let array = try? container.decode([JSONValue].self) { self = .array(array); return }
            self = .object(try container.decode([String: JSONValue].self))
        }

        /// Back to JSON text (for the call's arguments and the failure report).
        var json: String {
            switch self {
            case .null: return "null"
            case .bool(let b): return b ? "true" : "false"
            case .number(let d, let isInteger): return isInteger ? String(Int64(d)) : String(d)
            case .string(let s):
                let data = try! JSONSerialization.data(withJSONObject: [s])
                let text = String(decoding: data, as: UTF8.self)
                return String(text.dropFirst().dropLast())
            case .array(let items): return "[" + items.map(\.json).joined(separator: ",") + "]"
            case .object(let fields):
                return "{" + fields.keys.sorted().map { key in JSONValue.string(key).json + ":" + fields[key]!.json }.joined(separator: ",") + "}"
            }
        }

        static func same(_ a: JSONValue, _ b: JSONValue) -> Bool {
            switch (a, b) {
            case (.null, .null): return true
            case (.bool(let x), .bool(let y)): return x == y
            case (.number(let x, _), .number(let y, _)):
                if x == y { return true }
                return abs(x - y) <= 1e-9 * max(1, abs(x), abs(y))
            case (.string(let x), .string(let y)): return x == y
            case (.array(let x), .array(let y)):
                return x.count == y.count && zip(x, y).allSatisfy { same($0, $1) }
            case (.object(let x), .object(let y)):
                return x.count == y.count && x.allSatisfy { key, value in y[key].map { same(value, $0) } ?? false }
            default: return false
            }
        }
    }

    func testEveryRecordedVectorReplaysToTheSameResult() throws {
        XCTAssertEqual(TimeZone.current.secondsFromGMT(), 0, "run with TZ=UTC, the zone the vectors were recorded in")
        let url = try XCTUnwrap(Bundle.module.url(forResource: "vectors", withExtension: "json"))
        let file = try JSONDecoder().decode(File.self, from: Data(contentsOf: url))
        XCTAssertGreaterThan(file.vectors.count, 1000)

        let core = try BudgeerCore()
        var language = try core.setLanguage("en")
        var failures: [String] = []
        for vector in file.vectors {
            let wanted = vector.l ?? "en"
            if wanted != language { language = try core.setLanguage(wanted) }
            let json = try core.callJSON(vector.m, vector.f, argsJSON: vector.a)
            let got = try JSONDecoder().decode(JSONValue.self, from: Data(json.utf8))
            if !JSONValue.same(got, vector.r) {
                failures.append("\(vector.m).\(vector.f)(\(vector.a.prefix(160))) → \(json.prefix(160)), recorded \(vector.r.json.prefix(160))")
            }
        }
        if !failures.isEmpty {
            XCTFail("\(failures.count) of \(file.vectors.count) vectors differ:\n" + failures.prefix(25).joined(separator: "\n"))
        }
    }
}
