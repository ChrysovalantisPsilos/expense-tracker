// BudgeerCore: the web app's pure JavaScript (mobile-core/, bundled into
// core.js) run in JavaScriptCore, behind a typed Swift face. One shared
// context, every call serialised on one queue. The maths is never written a
// second time in Swift: a figure the app shows comes out of `call`.
//
// Calls travel as JSON (mobile-core/vectorCodec.js): the arguments as a JSON
// array, the result as JSON, where `undefined` is {"$":"u"}, a Date
// {"$":"date","v":ISO}, a Set {"$":"set","v":[…]}, a Map {"$":"map","v":[…]}
// and a thrown error of the web's own {"$":"error","message":…}.
//
// Time zone and locale: the engine formats dates in the process time zone
// (TimeZone.current, which honours the TZ environment variable) and, for
// English, Intl's default locale is the device's, as in the web app. Greek
// pins el-GR in the core itself. `setLanguage` picks the wording.
import Foundation
import JavaScriptCore

public enum BudgeerCoreError: Error, CustomStringConvertible {
    /// core.js is not in the bundle: run `npm run core:build` before building.
    case bundleMissing
    /// The engine could not be created.
    case engineUnavailable
    /// The core threw: the message and, when it has one, the stack.
    case javaScript(message: String, stack: String?)
    /// The core exists but has no such namespace or function.
    case noSuchFunction(String)
    /// The result could not be decoded into the requested type.
    case decoding(String, underlying: Error)
    /// The call answered with a thrown error of the web's own (a UserError, say).
    case coreError(message: String)

    public var description: String {
        switch self {
        case .bundleMissing: return "BudgeerCore: core.js is missing from the bundle (run npm run core:build)"
        case .engineUnavailable: return "BudgeerCore: JavaScriptCore is unavailable"
        case .javaScript(let message, let stack): return "BudgeerCore: \(message)" + (stack.map { "\n\($0)" } ?? "")
        case .noSuchFunction(let name): return "BudgeerCore: no function \(name)"
        case .decoding(let json, let error): return "BudgeerCore: cannot decode \(json): \(error)"
        case .coreError(let message): return message
        }
    }
}

/// A JavaScript `undefined` argument.
public struct JSUndefined: Encodable {
    public init() {}
    public func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: Key.self)
        try container.encode("u", forKey: .tag)
    }
    enum Key: String, CodingKey { case tag = "$" }
}

/// A JavaScript `Date` argument (an instant).
public struct JSDate: Encodable {
    public let date: Date
    public init(_ date: Date) { self.date = date }
    public func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: Key.self)
        try container.encode("date", forKey: .tag)
        try container.encode(JSDate.formatter.string(from: date), forKey: .value)
    }
    enum Key: String, CodingKey { case tag = "$", value = "v" }
    static let formatter: ISO8601DateFormatter = {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return formatter
    }()
}

private struct AnyEncodable: Encodable {
    let value: Encodable
    func encode(to encoder: Encoder) throws { try value.encode(to: encoder) }
}

/// The last uncaught exception of the context (the handler writes, calls read).
private final class ExceptionBox {
    var value: JSValue?
}

public final class BudgeerCore: @unchecked Sendable {
    /// The one context the app uses. The bundle is a build-time resource, so a
    /// missing one is a broken build, not a runtime condition.
    public static let shared: BudgeerCore = {
        do { return try BudgeerCore() } catch { fatalError("\(error)") }
    }()

    private let context: JSContext
    private let core: JSValue
    private let bridge: JSValue
    private let exceptions: ExceptionBox
    private let queue = DispatchQueue(label: "com.budgeer.core")
    private let encoder = JSONEncoder()
    private let decoder = JSONDecoder()

    /// Load core.js from the package's own bundle into a fresh context.
    public convenience init() throws {
        try self.init(bundle: .module)
    }

    /// Load core.js from `bundle` into a fresh context.
    public init(bundle: Bundle) throws {
        guard let url = bundle.url(forResource: "core", withExtension: "js") else { throw BudgeerCoreError.bundleMissing }
        let source = try String(contentsOf: url, encoding: .utf8)
        guard let machine = JSVirtualMachine(), let context = JSContext(virtualMachine: machine) else {
            throw BudgeerCoreError.engineUnavailable
        }
        let exceptions = ExceptionBox()
        context.exceptionHandler = { _, exception in exceptions.value = exception }
        context.evaluateScript(source, withSourceURL: url)
        if let exception = exceptions.value {
            exceptions.value = nil
            throw BudgeerCore.error(exception)
        }
        guard let core = context.objectForKeyedSubscript("BudgeerCore"), core.isObject,
              let bridge = core.objectForKeyedSubscript("vectors"), bridge.isObject else {
            throw BudgeerCoreError.javaScript(message: "core.js did not define BudgeerCore", stack: nil)
        }
        self.context = context
        self.core = core
        self.bridge = bridge
        self.exceptions = exceptions
    }

    private static func error(_ exception: JSValue) -> BudgeerCoreError {
        var stack: String?
        if let value = exception.objectForKeyedSubscript("stack"), !value.isUndefined {
            stack = value.toString()
        }
        return .javaScript(message: exception.toString(), stack: stack)
    }

    /// Run `work` on the engine's queue; a JavaScript exception becomes a Swift error.
    private func onEngine(_ work: () -> JSValue?) throws -> JSValue {
        try queue.sync {
            exceptions.value = nil
            let result = work()
            if let exception = exceptions.value {
                exceptions.value = nil
                throw BudgeerCore.error(exception)
            }
            guard let result = result else {
                throw BudgeerCoreError.javaScript(message: "the call gave no value", stack: nil)
            }
            return result
        }
    }

    // MARK: Language

    /// Make `lang` ("en" or "el") the language every wording function answers
    /// in; returns the language that is active (English for an unknown one).
    @discardableResult
    public func setLanguage(_ lang: String) throws -> String {
        try onEngine { core.invokeMethod("setLanguage", withArguments: [lang]) }.toString()
    }

    /// The active language.
    public var language: String {
        (try? onEngine { core.invokeMethod("getLanguage", withArguments: []) }.toString()) ?? "en"
    }

    // MARK: Calls

    /// Call `module.fn` with `argsJSON` (a JSON array) and get the encoded
    /// result as JSON. A thrown error of the web's own comes back as
    /// {"$":"error","message":…}, not as a Swift error: the vector replays
    /// compare those too.
    public func callJSON(_ module: String, _ fn: String, argsJSON: String) throws -> String {
        try onEngine { bridge.invokeMethod("call", withArguments: [module, fn, argsJSON]) }.toString()
    }

    /// Call `module.fn` with `args` and decode the result. A call that threw
    /// in the core is a `coreError`; a missing function is `noSuchFunction`.
    public func call<Result: Decodable>(_ module: String, _ fn: String, _ args: [Encodable]) throws -> Result {
        let parts = try args.map { arg -> String in
            let data = try encoder.encode(AnyEncodable(value: arg))
            return String(decoding: data, as: UTF8.self)
        }
        let json: String
        do {
            json = try callJSON(module, fn, argsJSON: "[" + parts.joined(separator: ",") + "]")
        } catch BudgeerCoreError.javaScript(let message, _) where message.contains("BudgeerCore: no ") {
            throw BudgeerCoreError.noSuchFunction("\(module).\(fn)")
        }
        return try decoded(json)
    }

    /// Call `module.fn` with a file's bytes as its first argument (handed to
    /// the engine as a Uint8Array, never as JSON: a statement can be
    /// megabytes) and `args` after them, and decode the result as `call` does.
    public func callBytes<Result: Decodable>(_ module: String, _ fn: String, bytes: Data,
                                             _ args: [Encodable] = []) throws -> Result {
        let parts = try args.map { arg -> String in
            let data = try encoder.encode(AnyEncodable(value: arg))
            return String(decoding: data, as: UTF8.self)
        }
        let json: String
        do {
            json = try onEngine {
                let ref = context.jsGlobalContextRef
                guard let array = JSObjectMakeTypedArray(ref, kJSTypedArrayTypeUint8Array, bytes.count, nil) else { return nil }
                if !bytes.isEmpty, let target = JSObjectGetTypedArrayBytesPtr(ref, array, nil) {
                    bytes.copyBytes(to: target.assumingMemoryBound(to: UInt8.self), count: bytes.count)
                }
                let file = JSValue(jsValueRef: array, in: context) as Any
                return bridge.invokeMethod("callBytes", withArguments: [module, fn, file, "[" + parts.joined(separator: ",") + "]"])
            }.toString()
        } catch BudgeerCoreError.javaScript(let message, _) where message.contains("BudgeerCore: no ") {
            throw BudgeerCoreError.noSuchFunction("\(module).\(fn)")
        }
        return try decoded(json)
    }

    /// A call's JSON answer as `Result`, or the core's own thrown error.
    private func decoded<Result: Decodable>(_ json: String) throws -> Result {
        let data = Data(json.utf8)
        if let thrown = try? decoder.decode(ThrownError.self, from: data), thrown.tag == "error" {
            throw BudgeerCoreError.coreError(message: thrown.message)
        }
        do {
            return try decoder.decode(Result.self, from: data)
        } catch {
            throw BudgeerCoreError.decoding(json, underlying: error)
        }
    }

    private struct ThrownError: Decodable {
        let tag: String
        let message: String
        enum CodingKeys: String, CodingKey { case tag = "$", message }
    }
}

// MARK: - Typed conveniences (examples; every figure still comes from the core)

public extension BudgeerCore {
    /// Money helpers: `currency` in the core.
    struct Money {
        let core: BudgeerCore
        /// An amount in minor units as the app shows it ("€1,234.56"; Greek "1.234,56 €").
        public func format(_ minor: Int, currency: String = "EUR") throws -> String {
            try core.call("currency", "formatMoney", [minor, currency])
        }
        /// A signed amount with a true minus sign, or a plus with `plus`.
        public func formatSigned(_ minor: Int, currency: String = "EUR", plus: Bool = false) throws -> String {
            try core.call("currency", "formatSigned", [minor, currency, ["plus": plus] as [String: Bool]])
        }
        /// Minor units of an amount typed as text ("18.50" → 1850).
        public func toMinor(_ amount: String, currency: String = "EUR") throws -> Int {
            try core.call("currency", "toMinor", [amount, currency])
        }
    }
    var money: Money { Money(core: self) }

    /// Group bill splitting: `splitMath` in the core (the same maths the server checks).
    struct Split {
        let core: BudgeerCore
        /// `totalMinor` split into `count` shares, the remainder cents on the first ones.
        public func equally(_ totalMinor: Int, among count: Int) throws -> [Int] {
            try core.call("splitMath", "splitEqually", [totalMinor, count])
        }
    }
    var split: Split { Split(core: self) }
}
