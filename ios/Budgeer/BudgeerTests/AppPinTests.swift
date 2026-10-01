// The lock's app PIN: 4 to 6 digits only, kept as a salted hash (never the
// digits), right resets the tries, wrong ones back off from the fifth (30 s,
// doubling, at most an hour) and the wait survives a new AppPin (a relaunch).
import XCTest
@testable import Budgeer

/// The Keychain item in memory.
final class MemoryPinVault: PinVault {
    var data: Data?
    func read() -> Data? { data }
    func write(_ data: Data) -> Bool {
        self.data = data
        return true
    }
    func erase() { data = nil }
}

/// A stand-in hash (the rules don't depend on which one): the salt, the rounds and the digits.
struct PlainPinHasher: PinHasher {
    var nextSalt = Data([1, 2, 3, 4])
    func salt() -> Data { nextSalt }
    func hash(_ pin: String, salt: Data, rounds: Int) -> Data { salt + Data("\(rounds):\(pin)".utf8).reversed() }
}

final class AppPinTests: XCTestCase {
    private var clock = Date(timeIntervalSince1970: 2_000_000)

    private func makePin(_ vault: MemoryPinVault) -> AppPin {
        AppPin(vault: vault, hasher: PlainPinHasher(), now: { [unowned self] in clock })
    }

    func testOnlyFourToSixDigits() {
        XCTAssertTrue(AppPin.valid("1234"))
        XCTAssertTrue(AppPin.valid("123456"))
        XCTAssertFalse(AppPin.valid("123"))
        XCTAssertFalse(AppPin.valid("1234567"))
        XCTAssertFalse(AppPin.valid("12a4"))
        XCTAssertFalse(AppPin.valid("١٢٣٤"))
        let pin = makePin(MemoryPinVault())
        XCTAssertFalse(pin.set("12"))
        XCTAssertFalse(pin.isSet)
    }

    func testKeptAsASaltedHashNotTheDigits() throws {
        let vault = MemoryPinVault()
        let pin = makePin(vault)
        XCTAssertTrue(pin.set("482915"))
        let stored = try XCTUnwrap(vault.data)
        XCTAssertNil(String(data: stored, encoding: .utf8)?.range(of: "482915"))
        let record = try JSONDecoder().decode(AppPin.Record.self, from: stored)
        XCTAssertEqual(record.salt, Data([1, 2, 3, 4]))
        XCTAssertEqual(record.length, 6)
        XCTAssertEqual(record.rounds, AppPin.rounds)
        XCTAssertEqual(pin.length, 6)
        XCTAssertEqual(pin.check("482915"), .ok)
        XCTAssertEqual(pin.check("482916"), .wrong(wait: 0))
    }

    func testWrongTriesBackOffAndRightResets() {
        let vault = MemoryPinVault()
        let pin = makePin(vault)
        pin.set("2468")
        for _ in 1...4 { XCTAssertEqual(pin.check("0000"), .wrong(wait: 0)) }
        XCTAssertEqual(pin.check("0000"), .wrong(wait: 30))
        // Even the right PIN waits now, and a relaunch doesn't reset it.
        XCTAssertEqual(makePin(vault).check("2468"), .waiting(30))
        clock += 30
        XCTAssertEqual(pin.check("0000"), .wrong(wait: 60))
        clock += 60
        XCTAssertEqual(pin.check("2468"), .ok)
        XCTAssertEqual(pin.wait, 0)
        for _ in 1...4 { XCTAssertEqual(pin.check("1111"), .wrong(wait: 0)) }
    }

    func testTheWaitDoublesUpToAnHour() {
        XCTAssertEqual(AppPin.wait(after: 4), 0)
        XCTAssertEqual(AppPin.wait(after: 5), 30)
        XCTAssertEqual(AppPin.wait(after: 6), 60)
        XCTAssertEqual(AppPin.wait(after: 7), 120)
        XCTAssertEqual(AppPin.wait(after: 12), 3600)
        XCTAssertEqual(AppPin.wait(after: 400), 3600)
    }

    func testRemoved() {
        let vault = MemoryPinVault()
        let pin = makePin(vault)
        pin.set("1357")
        pin.remove()
        XCTAssertFalse(pin.isSet)
        XCTAssertNil(vault.data)
        XCTAssertEqual(pin.check("1357"), .wrong(wait: 0))
    }

    #if canImport(CommonCrypto)
    /// The phone's hash: PBKDF2-SHA256, 32 bytes, a fresh 16-byte salt each time.
    func testThePhonesHash() {
        let hasher = PBKDF2PinHasher()
        let salt = hasher.salt()
        XCTAssertEqual(salt.count, 16)
        XCTAssertNotEqual(salt, hasher.salt())
        let one = hasher.hash("1234", salt: salt, rounds: 1000)
        XCTAssertEqual(one.count, 32)
        XCTAssertEqual(one, hasher.hash("1234", salt: salt, rounds: 1000))
        XCTAssertNotEqual(one, hasher.hash("1235", salt: salt, rounds: 1000))
        XCTAssertNotEqual(one, hasher.hash("1234", salt: hasher.salt(), rounds: 1000))
    }
    #endif
}
