// The app's language: 'system' (follow the device, the default), 'en' or
// 'el', as the web's language preference (shared/lib/i18n/language.js). The
// choice is kept on the device; which language a preference shows is the
// web's own rule, asked of the core (language.resolveLanguage over the
// device's preferred languages), and the core is told the result
// (setLanguage) so every figure and label it answers is worded in it.
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

    /// 'system', 'en' or 'el'.
    var preference: String {
        didSet {
            defaults.set(preference, forKey: AppLanguage.preferenceKey)
            apply()
        }
    }
    /// The language on screen ('en' or 'el').
    private(set) var current: String = "en"

    private let defaults: UserDefaults
    private let core: BudgeerCore
    private let deviceLanguages: [String]

    init(preference: String? = nil, defaults: UserDefaults = .standard, core: BudgeerCore = .shared,
         deviceLanguages: [String] = Locale.preferredLanguages) {
        self.defaults = defaults
        self.core = core
        self.deviceLanguages = deviceLanguages
        self.preference = preference ?? defaults.string(forKey: AppLanguage.preferenceKey) ?? AppLanguage.system
        apply()
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
