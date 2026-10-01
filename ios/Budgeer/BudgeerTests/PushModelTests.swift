// Push on this iPhone over a fake system and store: iOS's question asked
// only from Settings or once after the first entry (never on the demo
// login), the token saved with the build's environment, a refused or failed
// registration saved nowhere, the setup wizard's opt-in doing what the
// switch does, and the token forgotten on sign-out.
import XCTest
@testable import Budgeer

@MainActor
final class PushModelTests: XCTestCase {
    private var defaults: UserDefaults!

    override func setUp() async throws {
        defaults = UserDefaults(suiteName: "PushModelTests")
        defaults.removePersistentDomain(forName: "PushModelTests")
    }

    private func model(_ store: FakeStore, _ system: FakePushSystem, env: String = "sandbox") -> PushModel {
        PushModel(data: store.data, system: system, environment: env, defaults: defaults, core: .shared)
    }

    func testRefreshRegistersOnlyWhenAlreadyAllowed() async {
        let store = FakeStore()
        let system = FakePushSystem()
        let push = model(store, system)
        await push.refresh()
        XCTAssertEqual(system.asked, 0)
        XCTAssertEqual(store.deviceTokens, [])
        XCTAssertFalse(push.registered)

        system.status = .allowed
        await push.refresh()
        XCTAssertEqual(store.deviceTokens, ["save:\(FakePushSystem.token):sandbox"])
        XCTAssertTrue(push.registered)
    }

    func testEnableAsksOnceThenSavesWithTheEnvironment() async {
        let store = FakeStore()
        let system = FakePushSystem()
        system.answer = true
        let push = model(store, system, env: "production")
        let on = await push.enable()
        XCTAssertTrue(on)
        XCTAssertEqual(system.asked, 1)
        XCTAssertEqual(push.permission, .allowed)
        XCTAssertEqual(store.deviceTokens, ["save:\(FakePushSystem.token):production"])
        XCTAssertTrue(defaults.bool(forKey: PushModel.askedKey))
    }

    func testARefusalRegistersNothing() async {
        let store = FakeStore()
        let system = FakePushSystem()
        system.answer = false
        let push = model(store, system)
        let on = await push.enable()
        XCTAssertFalse(on)
        XCTAssertEqual(push.permission, .denied)
        XCTAssertEqual(store.deviceTokens, [])

        system.status = .allowed
        system.registerError = FakeError(description: "no APNs")
        let failed = await push.enable()
        XCTAssertFalse(failed)
        XCTAssertFalse(push.registered)
        XCTAssertEqual(store.deviceTokens, [])
    }

    func testTheFirstEntryAsksOnceAndNeverOnTheDemo() async {
        let demo = FakeStore()
        demo.profileResult = .success(["id": "u1", "is_demo": true])
        let system = FakePushSystem()
        await model(demo, system).askAfterFirstAction()
        XCTAssertEqual(system.asked, 0)

        let store = FakeStore()
        store.profileResult = .success(["id": "u1", "is_demo": false])
        let push = model(store, system)
        system.answer = true
        await push.askAfterFirstAction()
        XCTAssertEqual(system.asked, 1)
        await push.askAfterFirstAction()
        XCTAssertEqual(system.asked, 1) // once per install
    }

    func testAlreadyAnsweredIsNotAskedAgain() async {
        let store = FakeStore()
        store.profileResult = .success(["id": "u1"])
        let system = FakePushSystem()
        system.status = .denied
        await model(store, system).askAfterFirstAction()
        XCTAssertEqual(system.asked, 0)
        XCTAssertTrue(defaults.bool(forKey: PushModel.askedKey))
    }

    func testTheWizardsOptInIsSettingsSwitch() async {
        let store = FakeStore()
        store.profileResult = .success(["id": "u1", "notify_push": false])
        let system = FakePushSystem()
        system.answer = true
        let push = model(store, system)
        let status = await push.optIn()
        XCTAssertEqual(status, "subscribed")
        XCTAssertEqual(store.settingsWrites.last?.args, ["notify_push": true])
        XCTAssertEqual(system.asked, 1)
        XCTAssertEqual(store.deviceTokens, ["save:\(FakePushSystem.token):sandbox"])

        let refused = FakeStore()
        refused.profileResult = .success(["id": "u1"])
        let no = FakePushSystem()
        let denied = await model(refused, no).optIn()
        XCTAssertEqual(denied, "denied")
        XCTAssertEqual(refused.deviceTokens, [])

        let demo = FakeStore()
        demo.profileResult = .success(["id": "u1", "is_demo": true])
        let untouched = FakePushSystem()
        let onDemo = await model(demo, untouched).optIn()
        XCTAssertEqual(onDemo, "error")
        XCTAssertEqual(untouched.asked, 0)
        XCTAssertTrue(demo.settingsWrites.isEmpty)
    }

    func testSignOutForgetsTheToken() async {
        let store = FakeStore()
        let system = FakePushSystem()
        system.status = .allowed
        let push = model(store, system)
        await push.forget() // nothing registered: nothing to forget
        await push.refresh()
        await push.forget()
        XCTAssertEqual(store.deviceTokens, ["save:\(FakePushSystem.token):sandbox", "delete:\(FakePushSystem.token)"])
        XCTAssertFalse(push.registered)
    }
}

/// iOS's notification permission and APNs registration, answered by the test.
final class FakePushSystem: PushSystem, @unchecked Sendable {
    static let token = String(repeating: "ab", count: 32)
    var status: PushPermission = .notDetermined
    /// What the person answers iOS's question.
    var answer = false
    var registerError: Error?
    private(set) var asked = 0

    func permission() async -> PushPermission { status }

    func requestPermission() async -> Bool {
        asked += 1
        status = answer ? .allowed : .denied
        return answer
    }

    func register() async throws -> String {
        if let registerError { throw registerError }
        return FakePushSystem.token
    }
}
