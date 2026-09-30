// The app's strings are the web's dictionaries (src/locales/{en,el}),
// generated into Resources/Generated/<lang>.lproj/Localizable.strings by
// mobile-core/strings.mjs, and looked up by the same "ns:path.to.key" the
// web's t() takes. English is the fallback for a key a language lacks (the
// generator refuses to build when one is missing, so that never happens in
// a shipped build; the fallback covers a stale local build).
//
// A string with {{placeholders}} or plural forms is not filled in here: the
// app asks the core (AppLanguage.t(key, vars) → i18n.t), which interpolates
// and picks the plural exactly as the web does.
import Foundation

enum L10n {
    /// The bundle holding the .lproj folders: the app's, or the one a test
    /// points at.
    nonisolated(unsafe) static var bundle: Bundle = .main

    private static let missing = "\u{1}missing\u{1}"

    /// `key` in `lang`, or in English when `lang` lacks it, or the key itself.
    static func string(_ key: String, lang: String) -> String {
        if let text = lookup(key, lang: lang) { return text }
        if lang != "en", let text = lookup(key, lang: "en") { return text }
        return key
    }

    private static func lookup(_ key: String, lang: String) -> String? {
        guard let path = bundle.path(forResource: lang, ofType: "lproj"), let pack = Bundle(path: path) else { return nil }
        let text = pack.localizedString(forKey: key, value: missing, table: nil)
        return text == missing ? nil : text
    }

    /// The languages the bundle carries (each an .lproj folder).
    static var languages: [String] {
        (bundle.paths(forResourcesOfType: "lproj", inDirectory: nil))
            .map { ($0 as NSString).lastPathComponent.replacingOccurrences(of: ".lproj", with: "") }
            .sorted()
    }
}
