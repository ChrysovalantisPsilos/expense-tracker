// The app's language: 'system' (follow the device, the default), 'en' or
// 'el', as the web's language preference (shared/lib/i18n/language.js). The
// choice is kept on the device and, signed in, on the profile
// (profiles.language; ProfileLanguage.swift). Which language a preference
// shows is the web's own rule, asked of the core (language.resolveLanguage
// over the device's language), and the core is told the result
// (setLanguage) so every figure and label it answers is worded in it.
//
// The device's language is the first of its preferred languages only, not
// the whole list: that is what iOS Safari reports to the web (its
// navigator.languages holds just the one language Safari runs in), so the
// app shows what budgeer.com shows on the same phone. The whole list would
// turn an English phone with Greek as a second language Greek, as the web's
// rule picks Greek when any listed language is. A language chosen for this
// app alone (iOS Settings › Budgeer › Language) comes first in that list,
// so it is honoured too. Bundle.main.preferredLocalizations is not used: it
// matches the list against the app's two languages, so a French phone with
// Greek second would get Greek where Safari gets English.
//
// Not actor-bound: the kit's button styles and field modifiers read it too,
// and the core it talks to serialises its own calls.
import Foundation
import Observation
import BudgeerCore

@Observable
final class AppLanguage: @unchecked Sendable {
    static let preferenceKey = "language"
    static let system = "system"
    static let languages = ["en", "el"]
    /// Each language's name in itself, as the web's Language page shows them.
    static let nativeNames = ["en": "English", "el": "Ελληνικά"]

    /// 'system', 'en' or 'el'. A computed face over the tracked storage:
    /// the choice is saved and applied on every set.
    var preference: String {
        get { stored }
        set {
            stored = newValue
            defaults.set(newValue, forKey: AppLanguage.preferenceKey)
            apply()
        }
    }
    private var stored: String
    /// The language on screen ('en' or 'el').
    private(set) var current: String = "en"

    private let defaults: UserDefaults
    private let core: BudgeerCore
    private let deviceLanguages: [String]

    init(preference: String? = nil, defaults: UserDefaults = .standard, core: BudgeerCore = .shared,
         deviceLanguages: [String] = AppLanguage.reportedLanguages()) {
        self.defaults = defaults
        self.core = core
        self.deviceLanguages = deviceLanguages
        stored = preference ?? defaults.string(forKey: AppLanguage.preferenceKey) ?? AppLanguage.system
        apply()
    }

    /// What the device reports as its language, as Safari does: the first
    /// of its preferred languages (see the note at the top).
    static func reportedLanguages(_ preferred: [String] = Locale.preferredLanguages) -> [String] {
        Array(preferred.prefix(1))
    }

    /// Signed in: line this device's preference up with the profile's
    /// language (language.reconcileLanguage, as the web's ProfileLanguage).
    /// The profile wins when it holds a language; with none there, a language
    /// picked on this device comes back, to be saved to the profile.
    /// nil = nothing to save.
    @discardableResult
    func reconcile(profileLanguage: String?) -> String? {
        guard let answer = try? core.json("language", "reconcileLanguage", [profileLanguage.json, preference])
        else { return nil }
        if let local = answer["local"]?.stringValue, local != preference {
            preference = local
        }
        return answer["push"]?.stringValue
    }

    /// The language the device asks for (language.deviceLanguage): "Now: English".
    var deviceLanguage: String {
        (try? core.call("language", "deviceLanguage", [deviceLanguages])) ?? "en"
    }

    /// profiles.language for the preference (language.profileValue): the
    /// language, or nil to follow the device.
    var profileValue: String? {
        (try? core.json("language", "profileValue", [preference]))?.stringValue
    }

    private func apply() {
        let resolved: String = (try? core.call("language", "resolveLanguage", [preference, deviceLanguages])) ?? "en"
        current = (try? core.setLanguage(resolved)) ?? "en"
    }

    /// A plain string by its "ns:key".
    func t(_ key: String) -> String {
        L10n.string(key, lang: current)
    }

    /// A string with {{placeholders}} (or plural forms), filled in by the
    /// core's i18n.t as the web does.
    func t(_ key: String, _ vars: [String: JSONValue]) -> String {
        (try? core.call("i18n", "t", [key, vars])) ?? L10n.string(key, lang: current)
    }
}
