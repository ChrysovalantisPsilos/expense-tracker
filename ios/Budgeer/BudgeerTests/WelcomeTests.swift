// What greets an account (WelcomeModel, TourModel) and the signed-out pages
// (SignUpModel, VerifyEmailModel, ForgotPasswordModel) over fakes: the
// rules are the core's (onboardingMath, tourSteps, whatsNewMath, authChecks,
// confirmWait); these check the models call them and write what the web
// writes.
import XCTest
import BudgeerCore
@testable import Budgeer

/// The signed-out account calls, answered by the test.
final class FakeAccess: AccountAccess, @unchecked Sendable {
    var signUpSession = false
    var signUpError: Error?
    private(set) var signUps: [(email: String, password: String, metadata: JSONValue, redirect: URL)] = []
    private(set) var resent: [String] = []
    private(set) var resets: [(email: String, redirect: URL)] = []

    func signUp(email: String, password: String, metadata: JSONValue, redirect: URL) async throws -> Bool {
        if let signUpError { throw signUpError }
        signUps.append((email, password, metadata, redirect))
        return signUpSession
    }

    func resendConfirmation(email: String, redirect: URL) async throws {
        resent.append(email)
    }

    func sendPasswordReset(email: String, redirect: URL) async throws {
        resets.append((email, redirect))
    }
}

@MainActor
final class WelcomeModelTests: XCTestCase {
    override func tearDown() {
        try? BudgeerCore.shared.setLanguage("en")
        super.tearDown()
    }

    private func store(_ profile: JSONValue) -> FakeStore {
        let store = FakeStore()
        store.profileResult = .success(profile)
        return store
    }

    func testANewAccountGetsTheWizardAndItsDefaultCategories() async {
        let store = store(["id": "u1", "display_name": "Sam", "base_currency": "GBP", "onboarded_at": .null,
                           "tour_done": false, "whats_new_seen": .null])
        let welcome = WelcomeModel(data: store.data)
        await welcome.greet()
        XCTAssertTrue(welcome.wizard)
        XCTAssertNil(welcome.story)
        XCTAssertEqual(welcome.name, "Sam")
        XCTAssertEqual(welcome.currency, "GBP")
        XCTAssertEqual(welcome.progress, 0.25)
        XCTAssertEqual(store.settingsWrites.first?.name, "ensureDefaultCategories")
        // Once per session.
        await welcome.greet()
        XCTAssertEqual(store.settingsWrites.filter { $0.name == "ensureDefaultCategories" }.count, 1)
    }

    func testTheWizardSavesTheBasicsMakesTheGroupAndHandsOverToTheTour() async {
        let store = store(["id": "u1", "display_name": .null, "base_currency": "EUR", "onboarded_at": .null,
                           "tour_done": false])
        let welcome = WelcomeModel(data: store.data, now: { TestData.now })
        await welcome.greet()
        welcome.name = "  Alex "
        welcome.currency = "USD"
        await welcome.saveBasics()
        XCTAssertEqual(welcome.step, 1)
        XCTAssertEqual(store.settingsWrites.last?.args, ["display_name": "Alex", "base_currency": "USD"])
        welcome.groupName = "Corfu trip"
        await welcome.saveGroup()
        XCTAssertEqual(welcome.step, 2)
        XCTAssertEqual(store.groupWrites.last?.args, ["p_name": "Corfu trip", "p_currency": "USD"])
        XCTAssertEqual(welcome.message, "Group “Corfu trip” created")
        // No push in this build: the button stays off, nothing happens.
        XCTAssertNil(welcome.pushOptIn)
        await welcome.turnOnPush()
        XCTAssertFalse(welcome.pushDone)
        welcome.continueToTour()
        XCTAssertEqual(welcome.step, 3)
        await welcome.finish(tour: true)
        XCTAssertFalse(welcome.wizard)
        XCTAssertEqual(welcome.tourRequest, "/groups/g-new")
        XCTAssertEqual(store.settingsWrites.last?.args, ["onboarded_at": "2026-09-15T10:00:00.000Z"])
    }

    func testClosingTheWizardMarksTheTourSeenAndOpensTheGroup() async {
        let store = store(["id": "u1", "base_currency": "EUR", "onboarded_at": .null, "tour_done": false])
        let welcome = WelcomeModel(data: store.data, now: { TestData.now })
        await welcome.greet()
        welcome.skip()
        welcome.groupName = "Flatmates"
        await welcome.saveGroup()
        await welcome.finish(tour: false)
        XCTAssertEqual(store.settingsWrites.last?.args, ["onboarded_at": "2026-09-15T10:00:00.000Z", "tour_done": true])
        XCTAssertNil(welcome.tourRequest)
        XCTAssertEqual(welcome.openAfter, "/groups/g-new")
    }

    func testThePushStepSaysWhatHappened() async {
        let welcome = WelcomeModel(data: store([:]).data)
        welcome.pushOptIn = { "denied" }
        await welcome.turnOnPush()
        XCTAssertTrue(welcome.pushDone)
        XCTAssertEqual(welcome.message, "Notifications blocked — you can enable them later in Settings")
    }

    func testATourNeverFinishedPicksUp() async {
        let store = store(["id": "u1", "onboarded_at": "2026-09-01T10:00:00Z", "tour_done": false, "whats_new_seen": .null])
        let welcome = WelcomeModel(data: store.data)
        await welcome.greet()
        XCTAssertFalse(welcome.wizard)
        XCTAssertEqual(welcome.tourRequest, "/")
        XCTAssertNil(welcome.story)
    }

    func testWhatsNewShowsOnceAndIsMarkedSeenAsItOpens() async throws {
        let newest = try XCTUnwrap(SettingsFigures.whatsNew().first)
        let store = store(["id": "u1", "onboarded_at": "2025-03-02T10:00:00Z", "tour_done": true, "whats_new_seen": .null])
        let welcome = WelcomeModel(data: store.data)
        await welcome.greet()
        XCTAssertEqual(welcome.story?.id, newest.id)
        XCTAssertEqual(welcome.story?.pages.first?.title, newest.pages.first?.title)
        XCTAssertEqual(store.settingsWrites.last?.args, ["whats_new_seen": .string(newest.id)])
    }

    func testWhatsNewStaysAwayForANewAccountAndWhenTheColumnIsUnknown() async {
        let fresh = store(["id": "u1", "onboarded_at": "2099-01-01T10:00:00Z", "tour_done": true, "whats_new_seen": .null])
        let first = WelcomeModel(data: fresh.data)
        await first.greet()
        XCTAssertNil(first.story)
        XCTAssertEqual(fresh.settingsWrites.last?.name, "updateProfile") // marked seen silently
        let unknown = store(["id": "u1", "onboarded_at": "2025-03-02T10:00:00Z", "tour_done": true])
        let second = WelcomeModel(data: unknown.data)
        await second.greet()
        XCTAssertNil(second.story)
        XCTAssertFalse(unknown.settingsWrites.contains { $0.name == "updateProfile" })
    }
}

@MainActor
final class TourModelTests: XCTestCase {
    func testAPhonesStopsInTheWebsOrderThenSeen() async {
        let store = FakeStore()
        store.profileResult = .success(["tour_done": false])
        let tour = TourModel(data: store.data)
        await tour.start(returnTo: "/settings")
        XCTAssertTrue(tour.running)
        XCTAssertEqual(tour.stops.first?.id, "period")
        XCTAssertEqual(tour.stops.last?.id, "done")
        XCTAssertEqual(tour.stops.filter { $0.id == "more" }.first?.title, "More")
        XCTAssertEqual(tour.counter, "Step 1 of \(tour.stops.count)")
        await tour.next()
        XCTAssertEqual(tour.current?.id, "overview")
        tour.back()
        XCTAssertEqual(tour.current?.id, "period")
        await tour.close()
        XCTAssertFalse(tour.running)
        XCTAssertEqual(tour.returnTo, "/settings")
        XCTAssertEqual(store.settingsWrites.last?.args, ["tour_done": true])
    }

    func testDoneOnTheLastStopEndsIt() async {
        let store = FakeStore()
        store.profileResult = .success(["tour_done": true])
        let tour = TourModel(data: store.data)
        await tour.start(returnTo: "/")
        for _ in tour.stops { await tour.next() }
        XCTAssertFalse(tour.running)
        // Already seen on the profile: nothing to write.
        XCTAssertTrue(store.settingsWrites.isEmpty)
    }

    func testEachStopHasItsPlaceInTheApp() {
        XCTAssertEqual(TourMark.of(TourStop(id: "groups", route: nil, target: "nav-groups", title: "", body: "")).mark,
                       .tab(.groups))
        XCTAssertEqual(TourMark.of(TourStop(id: "budgets", route: nil, target: "nav-budgets", title: "", body: "")).route, "/")
        XCTAssertEqual(TourMark.of(TourStop(id: "period", route: "/", target: "period", title: "", body: "")).mark,
                       .view("period"))
        XCTAssertEqual(TourMark.of(TourStop(id: "done", route: nil, target: nil, title: "", body: "")).mark, .centre)
    }
}

/// The waits Check your inbox asked for (its sleep, made instant).
private final class Waits: @unchecked Sendable {
    var list: [Double] = []
}

@MainActor
final class AccountFormsTests: XCTestCase {
    private let site = "https://dev.budgeer.com"

    func testSignUpChecksTheFieldsAndTheTickFirst() async {
        let access = FakeAccess()
        let model = SignUpModel(access: access, site: site)
        XCTAssertTrue(model.fieldErrors.isEmpty)
        model.email = "sam@"
        model.password = "short"
        await model.submit()
        XCTAssertTrue(access.signUps.isEmpty)
        XCTAssertNotNil(model.fieldErrors["email"])
        XCTAssertNotNil(model.fieldErrors["password"])
        XCTAssertEqual(model.consentError, "Please accept the Terms of Use and Privacy Notice")
        XCTAssertNil(model.passwordHint)
    }

    func testSignUpSendsTheConsentTheWebRecordsAndWaitsForTheEmail() async throws {
        let access = FakeAccess()
        let model = SignUpModel(access: access, site: site)
        model.email = " sam@example.com "
        model.password = "budgeer2026"
        model.accepted = true
        await model.submit()
        let sent = try XCTUnwrap(access.signUps.first)
        XCTAssertEqual(sent.email, "sam@example.com")
        XCTAssertEqual(sent.redirect.absoluteString, site)
        XCTAssertEqual(sent.metadata, try BudgeerCore.shared.json("legal", "signupConsentMetadata", []))
        XCTAssertNotNil(sent.metadata["accepted_privacy"]?.stringValue)
        XCTAssertEqual(model.pending, PendingSignUp(email: "sam@example.com", password: "budgeer2026"))
    }

    func testARefusedSignUpSaysWhy() async {
        let access = FakeAccess()
        access.signUpError = SignInError.rejected(code: "user_already_exists", message: "User already registered")
        let model = SignUpModel(access: access, site: site)
        model.email = "sam@example.com"
        model.password = "budgeer2026"
        model.accepted = true
        await model.submit()
        XCTAssertEqual(model.serverError, BudgeerCore.shared.text("common:errors.auth.accountExists"))
        XCTAssertNil(model.pending)
    }

    func testGoogleSignUpNeedsTheTickToo() async {
        let auth = FakeAuthService()
        let session = SessionStore(auth: auth)
        let model = SignUpModel(access: FakeAccess(), site: site)
        await model.signUpWithGoogle(session: session)
        XCTAssertTrue(auth.signIns.isEmpty)
        XCTAssertNotNil(model.consentError)
        model.accepted = true
        await model.signUpWithGoogle(session: session)
        XCTAssertEqual(auth.signIns, [.google])
    }

    func testCheckYourInboxSignsInOnceTheLinkIsOpened() async {
        let auth = FakeAuthService(signInResult: .failure(SignInError.rejected(code: "email_not_confirmed", message: "")))
        let session = SessionStore(auth: auth)
        let waits = Waits()
        let model = VerifyEmailModel(pending: PendingSignUp(email: "sam@example.com", password: "budgeer2026"),
                                     access: FakeAccess(), site: site, sleep: { ms in
                                         waits.list.append(ms)
                                         if waits.list.count == 3 { auth.signInResult = .success(.sample) }
                                     })
        await model.wait(session: session)
        XCTAssertEqual(model.status, .done)
        XCTAssertEqual(waits.list, [6000, 6000, 6000])
        XCTAssertEqual(auth.signIns.count, 3)
    }

    func testCheckYourInboxGivesUpOnAnyOtherRefusal() async {
        let auth = FakeAuthService(signInResult: .failure(SignInError.rejected(code: "over_request_rate_limit", message: "")))
        let model = VerifyEmailModel(pending: PendingSignUp(email: "sam@example.com", password: "x"), access: FakeAccess(),
                                     site: site, sleep: { _ in })
        await model.wait(session: SessionStore(auth: auth))
        XCTAssertEqual(model.status, .gaveUp)
    }

    func testResendThenAMinutesWait() async {
        let access = FakeAccess()
        let model = VerifyEmailModel(pending: PendingSignUp(email: "sam@example.com", password: "x"), access: access,
                                     site: site, sleep: { _ in })
        await model.resend()
        XCTAssertEqual(access.resent, ["sam@example.com"])
        XCTAssertEqual(model.cooldown, 60)
        XCTAssertEqual(model.message, "Confirmation email resent")
        await model.resend()
        XCTAssertEqual(access.resent.count, 1)
        model.tick()
        XCTAssertEqual(model.cooldown, 59)
    }

    func testForgotPasswordSendsTheLinkToTheWebsitesResetPage() async throws {
        let access = FakeAccess()
        let model = ForgotPasswordModel(access: access, site: site)
        model.email = "sam@"
        XCTAssertFalse(model.canSend)
        model.email = " sam@example.com "
        XCTAssertTrue(model.canSend)
        await model.send()
        XCTAssertTrue(model.sent)
        let reset = try XCTUnwrap(access.resets.first)
        XCTAssertEqual(reset.email, "sam@example.com")
        XCTAssertEqual(reset.redirect.absoluteString, "https://dev.budgeer.com/reset-password")
    }
}
