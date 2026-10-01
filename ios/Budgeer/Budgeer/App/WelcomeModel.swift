// What greets a signed-in account, as the web's App does: the default
// categories seeded on a first sign-in (useEnsureDefaultCategories), the
// setup wizard for a new account (OnboardingWizard: profiles.onboarded_at),
// the app tour picking up when it was never finished (profiles.tour_done),
// or else the once-per-release What's new story (WhatsNewPrompt:
// profiles.whats_new_seen, marked seen when it opens). Every rule and word
// is the core's (onboardingMath, whatsNewMath); the writes are the web's
// (updateProfile, create_group, seed_default_categories).
import Foundation
import Observation
import BudgeerCore

/// The What's new story (whatsNewMath.storyFor): one change per page.
struct WhatsNewStory: Decodable, Equatable, Identifiable {
    struct Action: Decodable, Equatable {
        /// The web address the page opens (AppPaths).
        let to: String
        let label: String
    }
    struct Page: Decodable, Equatable, Identifiable {
        let id: String
        let title: String
        let body: String
        let chips: [String]
        /// The ring picture: 'update', 'start' or 'split'.
        let variant: String
        let action: Action?
    }
    let id: String
    /// "2 Oct", the counter's day.
    let day: String
    let pages: [Page]
}

/// The push opt-in the wizard's "Stay in the loop" step offers: what turning
/// it on did ('subscribed', 'denied', 'unsupported' or 'error', as the
/// web's enablePush answers): PushModel.optIn, as Settings' push switch.
typealias PushOptIn = @MainActor () async -> String

@MainActor
@Observable
final class WelcomeModel {
    /// The setup wizard is up.
    private(set) var wizard = false
    /// The What's new story to show, if any.
    var story: WhatsNewStory?
    /// The tour should start (the wizard's last step, or a tour never finished).
    var tourRequest: String?

    // The wizard's state (OnboardingWizard).
    private(set) var step = 0
    var name = ""
    var currency = "EUR"
    var groupName = ""
    private(set) var busy = false
    /// What the last step said (a group made, or why a save failed).
    private(set) var message: String?
    private(set) var warning = false
    /// The group made on the way ("/groups/<id>"), where things end up.
    private(set) var groupPath: String?
    /// The push step's button: done (set, blocked or unavailable).
    private(set) var pushDone = false
    /// Where the wizard ends up after it closes without the tour.
    var openAfter: String?

    /// The push opt-in, when this build has one (nil: the button is off, as
    /// on a browser without push).
    var pushOptIn: PushOptIn?

    private var profile: JSONValue = [:]
    private var greeted = false
    private let data: DataLayer
    private let core: BudgeerCore
    private let now: @Sendable () -> Date

    init(data: DataLayer, core: BudgeerCore = .shared, now: @escaping @Sendable () -> Date = { Date() }) {
        self.data = data
        self.core = core
        self.now = now
    }

    /// The wizard's bar, filled to the step shown (0…1; onboardingMath.wizardProgress).
    var progress: Double { ((try? core.call("onboardingMath", "wizardProgress", [step]) as Double) ?? 0) / 100 }

    /// The currency picker's codes (CurrencySelect: currency.currencyCodes).
    var currencyOptions: [String] {
        (try? core.call("currency", "currencyCodes", [JSONValue.string(currency)])) ?? [currency]
    }

    /// Once per signed-in session: the categories, then the wizard, the tour
    /// or What's new (never two at once), each a read after the other.
    func greet() async {
        guard !greeted else { return }
        greeted = true
        // Best effort, as on the web: no defaults yet just means the next launch tries again.
        try? await data.categories.ensureDefaultCategories()
        guard let read = try? await data.profile.profile() else { greeted = false; return }
        profile = read
        if (try? core.call("onboardingMath", "needsOnboarding", [profile]) as Bool) == true {
            name = profile["display_name"]?.stringValue ?? ""
            currency = profile["base_currency"]?.stringValue ?? "EUR"
            step = 0
            wizard = true
            return
        }
        if (try? core.call("onboardingMath", "tourPending", [profile]) as Bool) == true {
            tourRequest = "/"
            return
        }
        await whatsNew()
    }

    /// whatsNewMath.storyFor over the profile's seen id (absent: unknown, so
    /// nothing shows), remembered as seen as it opens.
    private func whatsNew() async {
        var options: JSONValue = ["onboardedAt": profile["onboarded_at"] ?? .null]
        if let seen = profile["whats_new_seen"] { options = options.with("seenId", seen) }
        guard let picked = try? core.json("whatsNewMath", "storyFor", [options]) else { return }
        if let seen = picked["markSeen"]?.stringValue {
            try? await data.profile.updateProfile(["whats_new_seen": .string(seen)])
        }
        if let shown = picked["story"], !shown.isNull, let story = try? shown.decode(WhatsNewStory.self) {
            self.story = story
        }
    }

    // MARK: The wizard

    func back() {
        if step > 0 { step -= 1 }
        message = nil
    }

    /// Skip: the next step without saving (the first two steps).
    func skip() {
        step += 1
        message = nil
    }

    /// Welcome's Continue: the name and the currency (basicsFields).
    func saveBasics() async {
        busy = true
        defer { busy = false }
        do {
            let fields = try core.json("onboardingMath", "basicsFields", [name, currency])
            try await data.profile.updateProfile(fields)
            message = nil
            step = 1
        } catch {
            fail(core.text("onboarding:wizard.welcome.failed"))
        }
    }

    /// The group step's Continue: a group when one was named.
    func saveGroup() async {
        busy = true
        defer { busy = false }
        let trimmed = groupName.trimmingCharacters(in: .whitespacesAndNewlines)
        do {
            if !trimmed.isEmpty {
                let id = try await data.groups.createGroup(name: trimmed, currency: currency)
                groupPath = "/groups/\(id)"
                groupName = ""
                warning = false
                message = core.text("onboarding:wizard.group.created", ["name": .string(trimmed)])
            } else {
                message = nil
            }
            step = 2
        } catch {
            fail(core.text("common:errors.notSaved"))
        }
    }

    /// "Enable notifications": the app's opt-in, and what it said (the web's words).
    func turnOnPush() async {
        guard let pushOptIn else { return }
        let status = await pushOptIn()
        pushDone = true
        warning = false
        switch status {
        case "denied": message = core.text("onboarding:wizard.loop.blocked")
        case "unsupported": message = core.text("onboarding:wizard.loop.iphone")
        case "subscribed": message = core.text("onboarding:wizard.loop.on")
        default: message = nil
        }
    }

    /// The loop step's Continue.
    func continueToTour() {
        step = 3
        message = nil
    }

    /// Closing or finishing: onboarded_at stamped (finishFields; the tour
    /// marked seen too unless it follows), then the tour or the group made.
    /// A failed write is not fatal, as on the web.
    func finish(tour: Bool) async {
        busy = true
        defer { busy = false }
        if let fields = try? core.json("onboardingMath", "finishFields", [instant(), tour]) {
            try? await data.profile.updateProfile(fields)
        }
        wizard = false
        if tour {
            tourRequest = groupPath ?? "/"
        } else {
            openAfter = groupPath
        }
    }

    /// Now as the web's toISOString.
    private func instant() -> String {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return formatter.string(from: now())
    }

    private func fail(_ text: String) {
        warning = true
        message = text
    }
}
