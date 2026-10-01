// The Face ID lock: off until the owner turns it on (and passes the check),
// then locked on every launch and after a minute away, open again only
// after the check; turning it off unlocks at once.
import XCTest
@testable import Budgeer

@MainActor
final class AppLockTests: XCTestCase {
    private var defaults: UserDefaults!
    private var clock = Date(timeIntervalSince1970: 1_000_000)

    override func setUp() {
        super.setUp()
        defaults = UserDefaults(suiteName: "AppLockTests")!
        defaults.removePersistentDomain(forName: "AppLockTests")
    }

    private func makeLock(_ owner: FakeOwner) -> AppLock {
        AppLock(defaults: defaults, owner: owner, now: { [unowned self] in clock })
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
        XCTAssertFalse(AppLock(defaults: defaults, owner: owner).enabled)
    }
}
