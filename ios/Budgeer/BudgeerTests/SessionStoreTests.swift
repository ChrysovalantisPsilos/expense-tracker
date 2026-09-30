// SessionStore over a fake auth service: the stored session, the legal
// check that fails closed, sign-in, sign-out and changes from outside.
import XCTest
@testable import Budgeer

@MainActor
final class SessionStoreTests: XCTestCase {
    func testNoStoredSessionIsSignedOut() async {
        let auth = FakeAuthService()
        let store = SessionStore(auth: auth)
        XCTAssertEqual(store.state, .loading)
        await store.start()
        XCTAssertEqual(store.state, .signedOut)
    }

    func testStoredSessionWithAcceptedDocumentsIsReady() async {
        let auth = FakeAuthService(user: .sample)
        let store = SessionStore(auth: auth)
        await store.start()
        XCTAssertEqual(store.state, .ready(.sample))
    }

    func testDocumentsNotAcceptedShowTheGate() async {
        let auth = FakeAuthService(user: .sample)
        auth.legal = .success(.outdated)
        let store = SessionStore(auth: auth)
        await store.start()
        XCTAssertEqual(store.state, .legalRequired(.sample, .outdated))
        XCTAssertFalse(LegalStatus.outdated.isFirstAcceptance)
        XCTAssertTrue(LegalStatus.fresh.isFirstAcceptance)

        // Accepted on the web: a recheck lets the app through.
        auth.legal = .success(.accepted)
        await store.recheckLegal()
        XCTAssertEqual(store.state, .ready(.sample))
    }

    func testLegalCheckFailureBlocksTheApp() async {
        let auth = FakeAuthService(user: .sample)
        auth.legal = .failure(FakeError(description: "offline"))
        let store = SessionStore(auth: auth)
        await store.start()
        XCTAssertEqual(store.state, .legalCheckFailed(.sample, "offline"))
        XCTAssertEqual(store.state.user, .sample)
    }

    func testSignInThenSignOut() async throws {
        let auth = FakeAuthService()
        let store = SessionStore(auth: auth)
        await store.start()
        try await store.signIn(email: "sam@example.com", password: "pw")
        XCTAssertEqual(auth.signIns, [.password(email: "sam@example.com", password: "pw")])
        XCTAssertEqual(store.state, .ready(.sample))
        await store.signOut()
        XCTAssertEqual(auth.signedOut, 1)
        XCTAssertEqual(store.state, .signedOut)
    }

    func testRejectedSignInStaysSignedOut() async {
        let auth = FakeAuthService(signInResult: .failure(SignInError.rejected(code: "invalid_credentials", message: "no")))
        let store = SessionStore(auth: auth)
        await store.start()
        do {
            try await store.signIn(email: "sam@example.com", password: "wrong")
            XCTFail("expected a throw")
        } catch {
            XCTAssertEqual(error as? SignInError, .rejected(code: "invalid_credentials", message: "no"))
        }
        XCTAssertEqual(store.state, .signedOut)
    }

    func testASessionThatEndsElsewhereSignsOut() async {
        let auth = FakeAuthService(user: .sample)
        let store = SessionStore(auth: auth)
        await store.start()
        XCTAssertEqual(store.state, .ready(.sample))
        auth.change(to: nil)
        await waitUntil { store.state == .signedOut }
        XCTAssertEqual(store.state, .signedOut)
    }

    private func waitUntil(_ condition: () -> Bool) async {
        for _ in 0..<200 where !condition() {
            try? await Task.sleep(nanoseconds: 10_000_000)
        }
    }
}
