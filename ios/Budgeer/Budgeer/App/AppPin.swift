// The lock's own PIN, for when Face ID fails or isn't there: 4 to 6 digits,
// kept on this iPhone only, in the Keychain, as a salted PBKDF2 hash (never
// the digits). Wrong tries back off: after 5 in a row each wait doubles from
// 30 seconds, up to an hour, and the count and the wait are kept with the
// hash, so quitting the app doesn't reset them. The Keychain and the hash
// function are behind seams (PinVault, PinHasher: PinKeychain.swift on the
// phone), so the rules are tested without either.
import Foundation

/// Where the PIN's record lives (the Keychain on the phone).
protocol PinVault: AnyObject {
    func read() -> Data?
    func write(_ data: Data) -> Bool
    func erase()
}

/// The salted hash a PIN is kept as.
protocol PinHasher {
    func hash(_ pin: String, salt: Data, rounds: Int) -> Data
    func salt() -> Data
}

/// What the lock's PIN answered.
enum PinAnswer: Equatable {
    case ok
    /// Wrong; `wait` > 0 once the tries have run out for now.
    case wrong(wait: TimeInterval)
    /// Not now: too many wrong tries, this many seconds to go.
    case waiting(TimeInterval)
}

final class AppPin {
    static let lengths = 4...6
    /// Wrong tries before the first wait, the first wait, and the longest.
    static let freeTries = 5
    static let firstWait: TimeInterval = 30
    static let longestWait: TimeInterval = 3600
    static let rounds = 120_000

    /// The stored record: the salt and hash, the PIN's length (the pad
    /// checks once it has that many digits), and the wrong tries so far.
    struct Record: Codable, Equatable {
        var salt: Data
        var hash: Data
        var length: Int
        var rounds: Int
        var failures = 0
        /// No tries until then (seconds since 1970).
        var until: TimeInterval = 0
    }

    private let vault: PinVault
    private let hasher: PinHasher
    private let now: () -> Date

    init(vault: PinVault, hasher: PinHasher, now: @escaping () -> Date = { Date() }) {
        self.vault = vault
        self.hasher = hasher
        self.now = now
    }

    private var record: Record? {
        vault.read().flatMap { try? JSONDecoder().decode(Record.self, from: $0) }
    }

    private func store(_ record: Record) -> Bool {
        guard let data = try? JSONEncoder().encode(record) else { return false }
        return vault.write(data)
    }

    /// A PIN is set on this iPhone.
    var isSet: Bool { record != nil }

    /// How many digits the PIN has (the pad checks at that many), nil without one.
    var length: Int? { record?.length }

    /// 4 to 6 digits, nothing else.
    static func valid(_ pin: String) -> Bool {
        lengths.contains(pin.count) && pin.allSatisfy { $0.isASCII && $0.isNumber }
    }

    /// Set (or replace) the PIN; false when it isn't 4–6 digits or couldn't be kept.
    @discardableResult
    func set(_ pin: String) -> Bool {
        guard AppPin.valid(pin) else { return false }
        let salt = hasher.salt()
        return store(Record(salt: salt, hash: hasher.hash(pin, salt: salt, rounds: AppPin.rounds), length: pin.count,
                            rounds: AppPin.rounds))
    }

    func remove() {
        vault.erase()
    }

    /// Seconds before another try is allowed (0: now).
    var wait: TimeInterval {
        guard let record else { return 0 }
        return max(0, record.until - now().timeIntervalSince1970)
    }

    /// Check a PIN: right resets the tries; wrong counts one, and from the
    /// fifth in a row starts (or doubles) the wait.
    func check(_ pin: String) -> PinAnswer {
        guard var record else { return .wrong(wait: 0) }
        let left = wait
        if left > 0 { return .waiting(left) }
        let right = AppPin.same(hasher.hash(pin, salt: record.salt, rounds: record.rounds), record.hash)
        if right {
            record.failures = 0
            record.until = 0
            _ = store(record)
            return .ok
        }
        record.failures += 1
        let wait = AppPin.wait(after: record.failures)
        record.until = wait > 0 ? now().timeIntervalSince1970 + wait : 0
        _ = store(record)
        return .wrong(wait: wait)
    }

    /// The wait after `failures` wrong tries in a row: none for the first
    /// four, then 30 s, 60 s, 120 s… up to an hour.
    static func wait(after failures: Int) -> TimeInterval {
        guard failures >= freeTries else { return 0 }
        let doublings = min(failures - freeTries, 12)
        return min(longestWait, firstWait * pow(2, Double(doublings)))
    }

    /// Equal bytes, compared in constant time.
    private static func same(_ a: Data, _ b: Data) -> Bool {
        guard a.count == b.count else { return false }
        var diff: UInt8 = 0
        for (x, y) in zip(a, b) { diff |= x ^ y }
        return diff == 0
    }
}
