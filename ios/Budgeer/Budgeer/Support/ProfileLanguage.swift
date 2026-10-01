// Signed in, the language follows the account, as on the web
// (shared/lib/i18n/ProfileLanguage.jsx and Settings › Language): the
// profile's language (profiles.language; null = follow the device) wins over
// this device's, a language picked here while the profile has none is saved
// up to it, and a choice made in Settings › Language is saved to it for the
// other devices. The shared demo account keeps the language on this device
// only: one visitor's choice mustn't follow the next. The rules are the
// core's (language.reconcileLanguage, language.profileValue,
// demoAccount.isDemoAccount); this reads, writes and keeps the order.
//
// The order matters, as on the web, where only a new profile *value*
// reconciles: a profile read that answers the same language as last time
// changes nothing, and once a choice is made here, reads that still answer
// the old language (one started before the save, realtime catching up) are
// passed over until the profile says what was saved. Without that, choosing
// "Follow my device" while the profile held Greek put Greek straight back.
import Foundation
import BudgeerCore

@MainActor
final class ProfileLanguage {
    private let language: AppLanguage
    private let profiles: ProfileRepository
    private let core: BudgeerCore
    /// The profile's language as last lined up with (nil: not read yet).
    private var seen: String??
    /// A choice made here, on its way to the profile: reads that don't say it yet are old.
    private var pending: String??
    /// Bumped by each choice: a read that began before it is old by then.
    private var choices = 0

    init(language: AppLanguage, profiles: ProfileRepository, core: BudgeerCore = .shared) {
        self.language = language
        self.profiles = profiles
        self.core = core
    }

    /// Whether this profile keeps the language: it has the column and is not
    /// the demo account.
    static func synced(_ profile: JSONValue, core: BudgeerCore = .shared) -> Bool {
        guard profile["language"] != nil else { return false }
        let demo: Bool = (try? core.call("demoAccount", "isDemoAccount", [profile])) ?? true
        return !demo
    }

    /// When the profile loads or changes: reconcile with a new value, and
    /// save what the core says to push.
    func sync() async {
        let started = choices
        guard let profile = try? await profiles.profile(), ProfileLanguage.synced(profile, core: core) else { return }
        guard started == choices else { return }
        let value = profile["language"]?.stringValue
        if case .some(let waiting) = pending {
            if value == waiting {
                pending = nil
                seen = .some(value)
            }
            return
        }
        if case .some(let last) = seen, last == value { return }
        seen = .some(value)
        guard let push = language.reconcile(profileLanguage: value) else { return }
        if (try? await profiles.saveLanguage(push)) != nil { seen = .some(push) }
    }

    /// A choice in Settings › Language: applied on this device at once, then
    /// saved to the profile (language.profileValue). A save that fails keeps
    /// the choice here; the profile's old value doesn't undo it.
    func choose(_ preference: String) async {
        language.preference = preference
        choices += 1
        guard let profile = try? await profiles.profile(), ProfileLanguage.synced(profile, core: core) else { return }
        let value = language.profileValue
        pending = .some(value)
        do {
            try await profiles.saveLanguage(value)
        } catch {
            pending = nil
            seen = .some(profile["language"]?.stringValue)
        }
    }
}
