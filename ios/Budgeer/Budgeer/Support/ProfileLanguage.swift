// Signed in, the language follows the account, as on the web
// (shared/lib/i18n/ProfileLanguage.jsx and Settings › Language): the
// profile's language (profiles.language; null = follow the device) wins over
// this device's, a language picked here while the profile has none is saved
// up to it, and a choice made in More is saved to it for the other devices.
// The shared demo account keeps the language on this device only: one
// visitor's choice mustn't follow the next. The rules are the core's
// (language.reconcileLanguage, language.profileValue,
// demoAccount.isDemoAccount); this only reads and writes.
import Foundation
import BudgeerCore

@MainActor
enum ProfileLanguage {
    /// Whether this profile keeps the language: it has the column and is not
    /// the demo account.
    static func synced(_ profile: JSONValue, core: BudgeerCore = .shared) -> Bool {
        guard profile["language"] != nil else { return false }
        let demo: Bool = (try? core.call("demoAccount", "isDemoAccount", [profile])) ?? true
        return !demo
    }

    /// When the profile loads or changes: reconcile, and save what the core
    /// says to push.
    static func sync(_ language: AppLanguage, profiles: ProfileRepository) async {
        guard let profile = try? await profiles.profile(), synced(profile) else { return }
        guard let push = language.reconcile(profileLanguage: profile["language"]?.stringValue) else { return }
        try? await profiles.saveLanguage(push)
    }

    /// After a choice in More (already applied on this device): the choice
    /// saved to the profile (language.profileValue).
    static func save(_ language: AppLanguage, profiles: ProfileRepository) async {
        guard let profile = try? await profiles.profile(), synced(profile) else { return }
        try? await profiles.saveLanguage(language.profileValue)
    }
}
