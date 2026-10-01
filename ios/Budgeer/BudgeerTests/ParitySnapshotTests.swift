// Pictures (light, dark, Greek) of the screens that bring the app level
// with the website: a category's page (with its budget being edited, and
// the uncategorised bucket), the setup wizard's four steps, the What's new
// story, a tour stop over Home, Sign up (and its checks), Check your inbox,
// Forgot password (and the link sent), and Help & FAQ (and an answer open).
// Same frame and helpers as SnapshotTests.
import SwiftUI
import XCTest
import BudgeerCore
@testable import Budgeer

@MainActor
extension SnapshotTests {
    func testCategoryPageSnapshots() async throws {
        let fixture = try CategoryFixture.load()
        let now = fixture.now
        for (lang, dark) in SnapshotTests.variants {
            _ = language(lang)
            for (view, name) in [("groceries", "category"), ("none", "category-none")] {
                let store = fixture.store(view)
                let page = CategoryPageModel(categoryId: fixture.view(view).categoryId, data: store.data, core: .shared,
                                             now: { now })
                await page.load()
                try await shots(framed(.home) { NavigationStack { CategoryPageView(model: page, open: { _ in }) } },
                                name: name, lang: lang, dark: dark, long: 1400)
                if view == "groceries" {
                    page.toggleEdit()
                    try await shots(framed(.home) { NavigationStack { CategoryPageView(model: page, open: { _ in }) } },
                                    name: "category-edit", lang: lang, dark: dark)
                }
            }
        }
    }

    func testWelcomeSnapshots() async throws {
        for (lang, dark) in SnapshotTests.variants {
            _ = language(lang)
            let store = FakeStore()
            store.profileResult = .success(["id": "u1", "display_name": "Sam Morgan", "base_currency": "EUR",
                                            "onboarded_at": .null, "tour_done": false])
            let welcome = WelcomeModel(data: store.data, now: { TestData.now })
            await welcome.greet()
            try await shots(OnboardingView(model: welcome), name: "onboarding-welcome", lang: lang, dark: dark)
            await welcome.saveBasics()
            welcome.groupName = "Corfu trip"
            try await shots(OnboardingView(model: welcome), name: "onboarding-group", lang: lang, dark: dark)
            await welcome.saveGroup()
            try await shots(OnboardingView(model: welcome), name: "onboarding-loop", lang: lang, dark: dark)
            welcome.continueToTour()
            try await shots(OnboardingView(model: welcome), name: "onboarding-tour", lang: lang, dark: dark)

            // What's new for an account from before the newest release.
            let older = FakeStore()
            older.profileResult = .success(["id": "u1", "onboarded_at": "2025-03-02T10:00:00Z", "tour_done": true,
                                            "whats_new_seen": .null])
            let story = WelcomeModel(data: older.data)
            await story.greet()
            let shown = try XCTUnwrap(story.story)
            try await shots(WhatsNewStoryView(story: shown) { _ in }, name: "whatsnew-story", lang: lang, dark: dark)
        }
    }

    func testTourSnapshots() async throws {
        let fixture = try HomeFixture.load()
        for (lang, dark) in SnapshotTests.variants {
            let home = try await homeModel(fixture, lang: lang)
            let store = FakeStore()
            store.profileResult = .success(["tour_done": false])
            let tour = TourModel(data: store.data)
            await tour.start(returnTo: "/")
            let targets = TourTargets()
            let router = AppRouter()
            let page = framed(.home) { NavigationStack { HomeView(model: home, chrome: SnapshotTests.chrome) } }
                .environment(targets)
                .overlay { TourOverlay(tour: tour, targets: targets, router: router) }
            // The first stop (the month and its figures), then More in the tab bar.
            try await shots(page, name: "tour-home", lang: lang, dark: dark, settle: 2.4)
            while tour.current?.id != "more", tour.running { await tour.next() }
            try await shots(page, name: "tour-more", lang: lang, dark: dark, settle: 1.6)
        }
    }

    func testAccountPagesSnapshots() async throws {
        let site = "https://dev.budgeer.com"
        for (lang, dark) in SnapshotTests.variants {
            _ = language(lang)
            let session = SessionStore(auth: FakeAuthService())
            let access = FakeAccess()
            let signUp = SignUpModel(access: access, site: site)
            try await shots(NavigationStack { SignUpView(model: signUp, session: session, access: access, site: site) { _ in } },
                            name: "signup", lang: lang, dark: dark)
            signUp.email = "sam@"
            signUp.password = "short"
            await signUp.submit()
            try await shots(NavigationStack { SignUpView(model: signUp, session: session, access: access, site: site) { _ in } },
                            name: "signup-checks", lang: lang, dark: dark)
            let verify = VerifyEmailModel(pending: PendingSignUp(email: "sam@example.com", password: "budgeer2026"),
                                          access: access, site: site, sleep: { _ in try? await Task.sleep(nanoseconds: 60_000_000_000) })
            try await shots(NavigationStack { VerifyEmailView(model: verify, session: session, changeEmail: {}, logIn: {}) },
                            name: "verify-email", lang: lang, dark: dark)
            let forgot = ForgotPasswordModel(access: access, site: site)
            forgot.email = "sam@example.com"
            try await shots(NavigationStack { ForgotPasswordView(model: forgot) {} }, name: "forgot", lang: lang, dark: dark)
            await forgot.send()
            try await shots(NavigationStack { ForgotPasswordView(model: forgot) {} }, name: "forgot-sent", lang: lang, dark: dark)
        }
    }

    func testHelpSnapshots() async throws {
        for (lang, dark) in SnapshotTests.variants {
            _ = language(lang)
            try await shots(framed(.more) { NavigationStack { HelpView(site: "https://dev.budgeer.com") } },
                            name: "help", lang: lang, dark: dark, long: 2400)
            try await shots(framed(.more) { NavigationStack { HelpView(site: "https://dev.budgeer.com", anchor: "category-page") } },
                            name: "help-answer", lang: lang, dark: dark)
        }
    }
}
