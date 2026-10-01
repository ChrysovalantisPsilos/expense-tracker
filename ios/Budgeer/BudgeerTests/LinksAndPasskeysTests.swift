// The website's links opened in the app (AppLink: Universal Links and
// budgeer://), an auth email's link signing in or leading to a new password
// (SessionStore, ResetPasswordModel), and passkeys: signing in with one,
// Settings › Security's list, Add and Remove, the wizard's Add and the ask
// after signing in. Over fakes; the rules are the core's (groupFormat,
// confirmLink, authMethods, reauth).
import AuthenticationServices
import XCTest
import BudgeerCore
@testable import Budgeer

@MainActor
final class AppLinkTests: XCTestCase {
    private let dev = ["dev.budgeer.com"]

    private func link(_ text: String, hosts: [String]? = nil) -> AppLink? {
        AppLink.of(URL(string: text)!, hosts: hosts ?? dev)
    }

    func testAnInviteOnTheWebsiteOrTheAppsScheme() {
        XCTAssertEqual(link("https://dev.budgeer.com/join/a1b2c3d4e5f6"), .join("a1b2c3d4e5f6"))
        XCTAssertEqual(link("https://dev.budgeer.com/join/a1b2c3d4e5f6/"), .join("a1b2c3d4e5f6"))
        XCTAssertEqual(link("budgeer://join/a1b2c3d4e5f6a7b8c9"), .join("a1b2c3d4e5f6a7b8c9"))
        XCTAssertNil(link("https://dev.budgeer.com/join/a1b2c3/extra"))
        XCTAssertNil(link("budgeer://auth-callback?code=x"))
    }

    func testAnAuthEmailsLink() {
        XCTAssertEqual(link("https://dev.budgeer.com/auth/confirm?token_hash=pkce_0123456789abcdef&type=recovery"),
                       .email(EmailLink(tokenHash: "pkce_0123456789abcdef", type: "recovery")))
        XCTAssertEqual(link("https://dev.budgeer.com/auth/confirm?type=signup&token_hash=0123456789abcdef"),
                       .email(EmailLink(tokenHash: "0123456789abcdef", type: "signup")))
        // Incomplete or odd: nothing (confirmLink.parseConfirmLink).
        XCTAssertNil(link("https://dev.budgeer.com/auth/confirm?token_hash=short&type=signup"))
        XCTAssertNil(link("https://dev.budgeer.com/auth/confirm?token_hash=0123456789abcdef&type=invite"))
        XCTAssertNil(link("https://dev.budgeer.com/auth/confirm"))
    }

    func testThePagesTheAppHas() {
        XCTAssertEqual(link("https://dev.budgeer.com/"), .page("/"))
        XCTAssertEqual(link("https://dev.budgeer.com"), .page("/"))
        XCTAssertEqual(link("https://dev.budgeer.com/groups/9f1c0e2a"), .page("/groups/9f1c0e2a"))
        XCTAssertEqual(link("https://dev.budgeer.com/categories/c1?period=m%3A2026-9"), .page("/categories/c1?period=m%3A2026-9"))
        XCTAssertEqual(link("https://dev.budgeer.com/help#what-is-a-passkey"), .page("/help#what-is-a-passkey"))
        XCTAssertEqual(link("https://dev.budgeer.com/settings/data/export"), .page("/settings/data/export"))
        // Pages it hasn't got stay on the website.
        for path in ["/privacy", "/terms", "/login", "/reset-password", "/groups/g1/edit", "/transactions/t1",
                     "/settings/unknown", "/savings/goals/new"] {
            XCTAssertNil(link("https://dev.budgeer.com\(path)"), path)
        }
    }

    /// Every page the site's apple-app-site-association sends here opens somewhere.
    func testEveryPageTheSiteSendsHereOpens() {
        for path in ["/", "/budgets", "/transactions", "/import", "/groups", "/groups/new", "/groups/g1", "/more",
                     "/recurring", "/plan", "/insights", "/insights/salary", "/savings", "/vouchers", "/categories/c1",
                     "/help", "/settings", "/settings/account", "/settings/notifications", "/settings/appearance",
                     "/settings/language", "/settings/spending", "/settings/vouchers", "/settings/ai",
                     "/settings/categories", "/settings/security", "/settings/privacy", "/settings/privacy/request",
                     "/settings/whats-new", "/settings/import-rules", "/settings/data", "/settings/data/export",
                     "/settings/data/restore"] {
            XCTAssertEqual(link("https://dev.budgeer.com\(path)"), .page(path), path)
        }
    }

    func testOnlyThisBuildsOwnSite() {
        XCTAssertNil(link("https://www.budgeer.com/budgets"))
        XCTAssertNil(link("http://dev.budgeer.com/budgets"))
        XCTAssertNil(link("https://evil.example/join/a1b2c3d4e5f6"))
        let prod = AppConfig(environment: .prod, supabaseURL: URL(string: "https://p.supabase.co")!, supabaseAnonKey: "k")
        XCTAssertEqual(prod.linkHosts, ["www.budgeer.com", "budgeer.com"])
        XCTAssertEqual(link("https://budgeer.com/budgets", hosts: prod.linkHosts), .page("/budgets"))
        XCTAssertEqual(link("https://WWW.budgeer.com/budgets", hosts: prod.linkHosts), .page("/budgets"))
        XCTAssertNil(link("https://dev.budgeer.com/budgets", hosts: prod.linkHosts))
        let devConfig = AppConfig(environment: .dev, supabaseURL: URL(string: "https://d.supabase.co")!, supabaseAnonKey: "k")
        XCTAssertEqual(devConfig.linkHosts, dev)
    }
}

@MainActor
final class EmailLinkTests: XCTestCase {
    private let recovery = EmailLink(tokenHash: "pkce_0123456789abcdef", type: "recovery")
    private let signup = EmailLink(tokenHash: "0123456789abcdef01", type: "signup")

    func testASignUpLinkSignsIn() async {
        let auth = FakeAuthService()
        let store = SessionStore(auth: auth)
        await store.start()
        await store.openEmailLink(signup)
        XCTAssertEqual(auth.verifiedLinks, [signup])
        XCTAssertEqual(store.state, .ready(.sample))
        // The same link again (a URL and a browsing activity): sent once.
        await store.openEmailLink(signup)
        XCTAssertEqual(auth.verifiedLinks.count, 1)
    }

    func testAResetLinkAsksForTheNewPasswordFirst() async {
        let auth = FakeAuthService()
        let store = SessionStore(auth: auth)
        await store.start()
        await store.openEmailLink(recovery)
        XCTAssertEqual(store.state, .recovering(.sample))
        // A change from outside for the same user doesn't skip it.
        auth.change(to: .sample)
        await Task.yield()
        XCTAssertEqual(store.state, .recovering(.sample))

        let model = ResetPasswordModel(session: store)
        model.password = "new-pass-12"
        model.confirm = "new-pass-13"
        await model.submit()
        XCTAssertEqual(model.problem, BudgeerCore.shared.text("auth:password.mismatch"))
        model.password = "short"
        model.confirm = "short"
        await model.submit()
        XCTAssertNotNil(model.problem)
        XCTAssertTrue(auth.newPasswords.isEmpty)

        auth.newPasswordError = SignInError.rejected(code: "same_password", message: "New password should be different")
        model.password = "new-pass-12"
        model.confirm = "new-pass-12"
        await model.submit()
        XCTAssertNotNil(model.problem)
        XCTAssertEqual(store.state, .recovering(.sample))

        auth.newPasswordError = nil
        await model.submit()
        XCTAssertNil(model.problem)
        XCTAssertEqual(auth.newPasswords, ["new-pass-12"])
        XCTAssertEqual(store.state, .ready(.sample))
    }

    func testALinkThatCantBeUsedSaysWhatToDo() async throws {
        let auth = FakeAuthService()
        auth.linkResult = .failure(SignInError.rejected(code: "otp_expired", message: "Email link is invalid or has expired"))
        let store = SessionStore(auth: auth)
        await store.start()
        await store.openEmailLink(recovery)
        XCTAssertEqual(store.state, .signedOut)
        XCTAssertEqual(store.linkProblem, "recovery")
        let help = try XCTUnwrap(ExpiredLinkHelp.of("recovery"))
        XCTAssertEqual(help.actions.map(\.to), ["/forgot-password"])
        XCTAssertEqual(ExpiredLinkHelp.of("signup")?.actions.map(\.to), ["/login", "/login?signup=1"])
        store.dismissLinkProblem()
        XCTAssertNil(store.linkProblem)
        // The next sign-in is an ordinary one.
        try await store.signIn(email: "sam@example.com", password: "pw")
        XCTAssertEqual(store.state, .ready(.sample))
    }

    func testSignedInALinkIsLeftAlone() async {
        let auth = FakeAuthService(user: .sample)
        let store = SessionStore(auth: auth)
        await store.start()
        await store.openEmailLink(recovery)
        XCTAssertTrue(auth.verifiedLinks.isEmpty)
        XCTAssertEqual(store.state, .ready(.sample))
    }

    func testSigningOutEndsARecovery() async {
        let auth = FakeAuthService()
        let store = SessionStore(auth: auth)
        await store.start()
        await store.openEmailLink(recovery)
        await store.signOut()
        XCTAssertEqual(store.state, .signedOut)
        try? await store.signIn(email: "sam@example.com", password: "pw")
        XCTAssertEqual(store.state, .ready(.sample))
    }
}

@MainActor
final class PasskeyTests: XCTestCase {
    func testSigningInWithAPasskey() async {
        let auth = FakeAuthService()
        let store = SessionStore(auth: auth)
        await store.start()
        let sheet = FakePasskeySheet()
        let model = SignInViewModel()
        await model.signInWithPasskey(session: store, sheet: sheet)
        XCTAssertEqual(sheet.used, [PasskeyChallenge.signIn.options])
        let answer = PasskeyCredential(challengeId: "ch-1", credential: ["id": "cred-1", "rawId": "cred-1", "type": "public-key"])
        XCTAssertEqual(auth.signIns, [.passkey(answer)])
        XCTAssertEqual(store.state, .ready(.sample))
        XCTAssertNil(model.errorKey)
        XCTAssertFalse(model.passkeyBusy)
    }

    func testClosingThePasskeySheetIsNoError() async {
        let auth = FakeAuthService()
        let store = SessionStore(auth: auth)
        await store.start()
        let sheet = FakePasskeySheet()
        sheet.answer = .failure(ASAuthorizationError(.canceled))
        let model = SignInViewModel()
        await model.signInWithPasskey(session: store, sheet: sheet)
        XCTAssertNil(model.errorKey)
        XCTAssertTrue(auth.signIns.isEmpty)
        XCTAssertEqual(store.state, .signedOut)
    }

    func testAFailedPasskeySignInSaysSo() async {
        let auth = FakeAuthService()
        auth.challenge = .failure(SignInError.network("offline"))
        let store = SessionStore(auth: auth)
        await store.start()
        let model = SignInViewModel()
        await model.signInWithPasskey(session: store, sheet: FakePasskeySheet())
        XCTAssertEqual(model.errorKey, "auth:login.passkeyFailed")

        auth.challenge = .success(.signIn)
        auth.signInResult = .failure(SignInError.rejected(code: "webauthn_verification_failed", message: "no"))
        await model.signInWithPasskey(session: store, sheet: FakePasskeySheet())
        XCTAssertEqual(model.errorKey, "auth:login.passkeyFailed")
        XCTAssertEqual(store.state, .signedOut)
    }

    func testTheWebsitesShapeOfAnAnswer() {
        let bytes = Data([0xFB, 0xFF, 0x01])
        XCTAssertEqual(Base64URL.encode(bytes), "-_8B")
        XCTAssertEqual(Base64URL.decode("-_8B"), bytes)
        XCTAssertEqual(Base64URL.decode("c2lnbi1pbg"), Data("sign-in".utf8))
        let assertion = PasskeyJSON.assertion(credentialID: bytes, clientData: Data("{}".utf8), authenticatorData: Data([1]),
                                              signature: Data([2]), userID: Data("user".utf8))
        XCTAssertEqual(assertion["id"], "-_8B")
        XCTAssertEqual(assertion["rawId"], "-_8B")
        XCTAssertEqual(assertion["type"], "public-key")
        XCTAssertEqual(assertion["response"]?["clientDataJSON"], "e30")
        XCTAssertEqual(assertion["response"]?["userHandle"], "dXNlcg")
        let registration = PasskeyJSON.registration(credentialID: bytes, clientData: Data("{}".utf8), attestation: Data([3]))
        XCTAssertEqual(registration["response"]?["attestationObject"], "Aw")
        XCTAssertEqual(registration["authenticatorAttachment"], "platform")
        XCTAssertEqual(PasskeyJSON.ids([["id": "-_8B"], ["type": "public-key"]]), [bytes])
    }

    private func security(_ fake: FakeSecurity, sheet: FakePasskeySheet) -> SecurityModel {
        let now = TestData.now
        return SecurityModel(data: FakeStore().data, security: fake, signOut: {}, sheet: sheet, core: .shared, now: { now })
    }

    func testSettingsListsAddsAndRemovesPasskeys() async {
        let fake = FakeSecurity()
        let sheet = FakePasskeySheet()
        let model = security(fake, sheet: sheet)
        await model.load()
        XCTAssertEqual(model.passkeys, [])
        XCTAssertEqual(model.methods.last?.key, "passkeys")
        XCTAssertEqual(model.methods.last?.connected, false)

        await model.addPasskey()
        XCTAssertEqual(sheet.created, [PasskeyChallenge.add.options])
        XCTAssertEqual(fake.calls, ["passkeyOptions", "savePasskey:reg-1"])
        XCTAssertEqual(model.message, BudgeerCore.shared.text("settings:passkeys.added"))
        XCTAssertEqual(model.passkeys, [PasskeyRow(id: "pk-new", name: "iPhone", meta: "added 2026-09-15")])
        XCTAssertEqual(model.methods.last?.connected, true)

        await model.removePasskey("pk-new")
        XCTAssertEqual(fake.calls.last, "removePasskey:pk-new")
        XCTAssertEqual(model.passkeys, [])
    }

    func testAddingAPasskeyNeedsAFreshSignInAndAClosedSheetSaysNothing() async {
        let fake = FakeSecurity()
        fake.claims = ["iat": .int(Int(TestData.now.timeIntervalSince1970) - 3600)]
        let sheet = FakePasskeySheet()
        let model = security(fake, sheet: sheet)
        await model.load()
        await model.addPasskey()
        XCTAssertEqual(model.message, BudgeerCore.shared.text("common:errors.reauth.addPasskey"))
        XCTAssertTrue(model.warning)
        XCTAssertTrue(sheet.created.isEmpty)

        fake.claims = ["iat": .int(Int(TestData.now.timeIntervalSince1970) - 30)]
        sheet.answer = .failure(ASAuthorizationError(.canceled))
        let fresh = security(fake, sheet: sheet)
        await fresh.load()
        await fresh.addPasskey()
        XCTAssertNil(fresh.message)
        XCTAssertEqual(fake.calls, ["passkeyOptions"])
    }

    func testPasskeysOffOnTheServerHideThem() async {
        let fake = FakeSecurity()
        fake.passkeyList = .failure(ServerError(code: "passkeys_disabled", message: "off"))
        let model = security(fake, sheet: FakePasskeySheet())
        await model.load()
        XCTAssertNil(model.passkeys)
        XCTAssertEqual(model.methods.map(\.key), ["password", "google", "apple"])
    }

    private func greeter(_ profile: JSONValue, _ fake: FakeSecurity, _ sheet: FakePasskeySheet) -> (WelcomeModel, FakeStore) {
        let store = FakeStore()
        store.profileResult = .success(profile)
        let welcome = WelcomeModel(data: store.data, now: { TestData.now })
        welcome.passkeyKit = PasskeyKit(security: fake, sheet: sheet)
        return (welcome, store)
    }

    private let onboarded: JSONValue = ["id": "u1", "onboarded_at": "2025-03-02T10:00:00Z", "tour_done": true]

    func testTheAskAfterSigningInForAnAccountWithoutAPasskey() async {
        let fake = FakeSecurity()
        let sheet = FakePasskeySheet()
        let (welcome, store) = greeter(onboarded, fake, sheet)
        await welcome.greet()
        XCTAssertTrue(welcome.passkeyAsk)
        await welcome.createAskedPasskey()
        XCTAssertEqual(fake.calls, ["passkeyOptions", "savePasskey:reg-1"])
        XCTAssertFalse(welcome.passkeyAsk)
        XCTAssertFalse(store.settingsWrites.contains { $0.args == ["passkey_reminder_off": true] })
    }

    func testDontRemindMeAgainTurnsTheAskOff() async {
        let (welcome, store) = greeter(onboarded, FakeSecurity(), FakePasskeySheet())
        await welcome.greet()
        welcome.passkeyNever = true
        await welcome.closePasskeyAsk()
        XCTAssertFalse(welcome.passkeyAsk)
        XCTAssertEqual(store.settingsWrites.last?.args, ["passkey_reminder_off": true])
    }

    func testNoAskWithAPasskeyRemindersOffOnTheDemoOrPasskeysOff() async {
        let has = FakeSecurity()
        has.passkeyList = .success([["id": "pk1"]])
        let (first, _) = greeter(onboarded, has, FakePasskeySheet())
        await first.greet()
        XCTAssertFalse(first.passkeyAsk)

        let (second, _) = greeter(onboarded.with("passkey_reminder_off", true), FakeSecurity(), FakePasskeySheet())
        await second.greet()
        XCTAssertFalse(second.passkeyAsk)

        let (third, _) = greeter(onboarded.with("is_demo", true), FakeSecurity(), FakePasskeySheet())
        await third.greet()
        XCTAssertFalse(third.passkeyAsk)

        let off = FakeSecurity()
        off.passkeyList = .failure(ServerError(code: nil, message: "off"))
        let (fourth, _) = greeter(onboarded, off, FakePasskeySheet())
        await fourth.greet()
        XCTAssertFalse(fourth.passkeyAsk)
    }

    func testTheWizardAddsAPasskey() async {
        let fake = FakeSecurity()
        let store = FakeStore()
        store.profileResult = .success(["id": "u1", "base_currency": "EUR", "onboarded_at": .null, "tour_done": false])
        let welcome = WelcomeModel(data: store.data, now: { TestData.now })
        welcome.passkeyKit = PasskeyKit(security: fake, sheet: FakePasskeySheet())
        await welcome.greet()
        XCTAssertTrue(welcome.wizard)
        XCTAssertFalse(welcome.passkeyAsk)
        await welcome.addPasskey()
        XCTAssertTrue(welcome.passkeyDone)
        XCTAssertEqual(welcome.message, BudgeerCore.shared.text("settings:passkeys.added"))
        XCTAssertEqual(fake.calls, ["passkeyOptions", "savePasskey:reg-1"])
    }
}
