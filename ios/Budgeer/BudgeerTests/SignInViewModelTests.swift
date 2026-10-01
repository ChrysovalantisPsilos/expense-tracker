// The sign-in form's rules and the words a refusal gets.
import XCTest
@testable import Budgeer

@MainActor
final class SignInViewModelTests: XCTestCase {
    func testCanSubmitNeedsBothFields() {
        let model = SignInViewModel()
        XCTAssertFalse(model.canSubmit)
        model.email = "  sam@example.com "
        XCTAssertFalse(model.canSubmit)
        model.password = "pw"
        XCTAssertTrue(model.canSubmit)
        model.email = "   "
        XCTAssertFalse(model.canSubmit)
    }

    func testSubmitTrimsTheEmailAndSignsIn() async {
        let auth = FakeAuthService()
        let session = SessionStore(auth: auth)
        await session.start()
        let model = SignInViewModel()
        model.email = " sam@example.com "
        model.password = "pw"
        await model.submit(session: session)
        XCTAssertEqual(auth.signIns, [.password(email: "sam@example.com", password: "pw")])
        XCTAssertNil(model.errorKey)
        XCTAssertFalse(model.submitting)
        XCTAssertEqual(session.state, .ready(.sample))
    }

    func testARefusalShowsTheWebsMessage() async {
        let auth = FakeAuthService(signInResult: .failure(SignInError.rejected(code: "invalid_credentials", message: "x")))
        let session = SessionStore(auth: auth)
        await session.start()
        let model = SignInViewModel()
        model.email = "sam@example.com"
        model.password = "wrong"
        await model.submit(session: session)
        XCTAssertEqual(model.errorKey, "common:errors.auth.invalidCredentials")
        XCTAssertEqual(session.state, .signedOut)
    }

    func testMessageKeys() {
        XCTAssertEqual(SignInViewModel.messageKey(for: SignInError.rejected(code: "email_not_confirmed", message: "")),
                       "common:errors.auth.emailNotConfirmed")
        XCTAssertEqual(SignInViewModel.messageKey(for: SignInError.rejected(code: "over_request_rate_limit", message: "")),
                       "common:errors.tooMany")
        XCTAssertEqual(SignInViewModel.messageKey(for: SignInError.rejected(code: "something_else", message: "")),
                       "auth:serverError")
        XCTAssertEqual(SignInViewModel.messageKey(for: SignInError.network("timed out")), "common:errors.connection")
        XCTAssertEqual(SignInViewModel.messageKey(for: SignInError.unsupported(.google)), "common:errors.generic")
        XCTAssertEqual(SignInViewModel.messageKey(for: FakeError(description: "?")), "common:errors.generic")
    }

    // Google: the same session flow as email (the legal check after it).

    func testGoogleSignsInAndTheLegalCheckFollows() async {
        let auth = FakeAuthService()
        let session = SessionStore(auth: auth)
        await session.start()
        let model = SignInViewModel()
        await model.signInWithGoogle(session: session)
        XCTAssertEqual(auth.signIns, [.google])
        XCTAssertNil(model.errorKey)
        XCTAssertFalse(model.googleBusy)
        XCTAssertEqual(session.state, .ready(.sample))
    }

    func testGoogleWithDocumentsToAcceptShowsTheGate() async {
        let auth = FakeAuthService()
        auth.legal = .success(.fresh)
        let session = SessionStore(auth: auth)
        await session.start()
        await SignInViewModel().signInWithGoogle(session: session)
        XCTAssertEqual(session.state, .legalRequired(.sample, .fresh))
    }

    func testClosingGooglesSheetShowsNoError() async {
        let auth = FakeAuthService(signInResult: .failure(SignInError.cancelled))
        let session = SessionStore(auth: auth)
        await session.start()
        let model = SignInViewModel()
        await model.signInWithGoogle(session: session)
        XCTAssertEqual(auth.signIns, [.google])
        XCTAssertNil(model.errorKey)
        XCTAssertFalse(model.googleBusy)
        XCTAssertEqual(session.state, .signedOut)
    }

    func testAGoogleFailureShowsTheWebsMessage() async {
        let auth = FakeAuthService(signInResult: .failure(SignInError.rejected(code: "provider_disabled", message: "x")))
        let session = SessionStore(auth: auth)
        await session.start()
        let model = SignInViewModel()
        await model.signInWithGoogle(session: session)
        XCTAssertEqual(model.errorKey, "auth:serverError")
        XCTAssertEqual(session.state, .signedOut)

        auth.signInResult = .failure(SignInError.network("offline"))
        await model.signInWithGoogle(session: session)
        XCTAssertEqual(model.errorKey, "common:errors.connection")
    }

    // Apple: the sheet's credential (token, nonce, the first sign-in's name)
    // goes to the service as it came; the legal check follows.

    func testAppleSignsInWithTheCredentialAndTheGateFollows() async {
        let auth = FakeAuthService()
        auth.legal = .success(.fresh)
        let session = SessionStore(auth: auth)
        await session.start()
        let model = SignInViewModel()
        let credential = AppleCredential(idToken: "id.token.sig", nonce: "raw-nonce", fullName: "Sam Lee")
        await model.signInWithApple(credential, session: session)
        XCTAssertEqual(auth.signIns, [.apple(credential)])
        XCTAssertNil(model.errorKey)
        XCTAssertFalse(model.appleBusy)
        XCTAssertEqual(session.state, .legalRequired(.sample, .fresh))
    }

    func testAnAppleRefusalShowsTheWebsMessage() async {
        let auth = FakeAuthService(signInResult: .failure(SignInError.rejected(code: "provider_disabled", message: "x")))
        let session = SessionStore(auth: auth)
        await session.start()
        let model = SignInViewModel()
        await model.signInWithApple(AppleCredential(idToken: "t", nonce: "n"), session: session)
        XCTAssertEqual(model.errorKey, "auth:serverError")
        XCTAssertEqual(session.state, .signedOut)
        model.appleFailed()
        XCTAssertEqual(model.errorKey, "common:errors.generic")
    }
}
