// The Face ID lock: off until the owner turns it on (and passes the check),
// then locked on every launch and after a minute away, open again only
// after the check (or the app PIN); turning it off unlocks at once.
import XCTest
@testable import Budgeer

@MainActor
final class AppLockTests: XCTestCase {
    private var defaults: UserDefaults!
    private var clock = Date(timeIntervalSince1970: 1_000_000)
    private let vault = MemoryPinVault()

    override func setUp() {
        super.setUp()
        defaults = UserDefaults(suiteName: "AppLockTests")!
        defaults.removePersistentDomain(forName: "AppLockTests")
    }

    private func makeLock(_ owner: FakeOwner) -> AppLock {
        AppLock(defaults: defaults, owner: owner, pin: AppPin(vault: vault, hasher: PlainPinHasher(), now: { [unowned self] in clock }),
                now: { [unowned self] in clock })
    }

    func testOffUntilTheOwnerTurnsItOn() async {
        let owner = FakeOwner()
        let lock = makeLock(owner)
        XCTAssertFalse(lock.enabled)
        XCTAssertFalse(lock.covers)
        lock.wentAway()
        lock.cameBack()
        XCTAssertFalse(lock.covers)

        owner.answer = false
        await lock.set(true, reason: "Unlock Budgeer")
        XCTAssertFalse(lock.enabled)

        owner.answer = true
        await lock.set(true, reason: "Unlock Budgeer")
        XCTAssertTrue(lock.enabled)
        XCTAssertFalse(lock.covers)
        XCTAssertEqual(owner.asked, ["Unlock Budgeer", "Unlock Budgeer"])
    }

    func testLocksOnLaunchAndAfterAMinuteAway() async {
        let owner = FakeOwner()
        await makeLock(owner).set(true, reason: "r")
        // The next launch starts locked.
        let lock = makeLock(owner)
        XCTAssertTrue(lock.covers)
        owner.answer = false
        await lock.unlock(reason: "r")
        XCTAssertTrue(lock.covers)
        owner.answer = true
        await lock.unlock(reason: "r")
        XCTAssertFalse(lock.covers)

        // Away: the switcher sees the lock; back within the minute, open.
        lock.wentAway()
        XCTAssertTrue(lock.covers)
        clock += 30
        lock.cameBack()
        XCTAssertFalse(lock.covers)

        // Away for a minute or more: locked.
        lock.wentAway()
        clock += AppLock.grace
        lock.cameBack()
        XCTAssertTrue(lock.locked)
        XCTAssertTrue(lock.covers)
    }

    func testTurningItOffUnlocksAtOnce() async {
        let owner = FakeOwner()
        await makeLock(owner).set(true, reason: "r")
        let lock = makeLock(owner)
        XCTAssertTrue(lock.covers)
        let asked = owner.asked.count
        await lock.set(false, reason: "r")
        XCTAssertFalse(lock.enabled)
        XCTAssertFalse(lock.covers)
        XCTAssertEqual(owner.asked.count, asked)
        XCTAssertFalse(makeLock(owner).enabled)
    }

    func testThePinUnlocksWhenFaceIDFails() async {
        let owner = FakeOwner()
        let first = makeLock(owner)
        XCTAssertFalse(first.hasPin)
        XCTAssertTrue(first.setPin("2580"))
        await first.set(true, reason: "r")
        let lock = makeLock(owner)
        XCTAssertTrue(lock.hasPin)
        XCTAssertEqual(lock.pinLength, 4)
        owner.answer = false
        await lock.unlock(reason: "r")
        XCTAssertTrue(lock.covers)
        XCTAssertEqual(lock.unlock(pin: "1111"), .wrong(wait: 0))
        XCTAssertTrue(lock.covers)
        XCTAssertEqual(lock.unlock(pin: "2580"), .ok)
        XCTAssertFalse(lock.covers)
    }

    func testWithoutFaceIDThePinIsWhatTurnsItOn() async {
        let owner = FakeOwner()
        owner.available = false
        let lock = makeLock(owner)
        XCTAssertFalse(lock.available)
        await lock.set(true, reason: "r")
        XCTAssertFalse(lock.enabled)
        lock.setPin("135790")
        XCTAssertTrue(lock.available)
        await lock.set(true, reason: "r")
        XCTAssertTrue(lock.enabled)
        XCTAssertEqual(owner.asked, [])
        // Removing the PIN there takes the lock with it: nothing else could open it.
        lock.removePin()
        XCTAssertFalse(lock.hasPin)
        XCTAssertFalse(lock.enabled)
        XCTAssertFalse(lock.covers)
    }
}
