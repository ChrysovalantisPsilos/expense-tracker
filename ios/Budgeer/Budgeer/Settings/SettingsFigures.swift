// What Settings' plain pages show, each one core call: where people reach
// Budgeer (contact.contactLinks), the appearance choices
// (themePref.appearancePrefs), What's new (whatsNewMath.whatsNewList) and
// a sentence's rich parts (translate.parseRich).
import Foundation
import BudgeerCore

/// contact.contactLinks: the support and privacy addresses and the status page.
struct ContactLinks: Decodable, Equatable {
    let support: String
    let privacy: String
    let status: String
}

/// One release of What's new: its day and each page's title and body.
struct WhatsNewRelease: Decodable, Equatable, Identifiable {
    struct Page: Decodable, Equatable {
        let title: String
        let body: String
    }
    let id: String
    let date: String
    let pages: [Page]
}

enum SettingsFigures {
    static func contact(core: BudgeerCore = .shared) -> ContactLinks? {
        guard let links: ContactLinks = try? core.call("contact", "contactLinks", []) else { return nil }
        return links
    }

    /// 'light', 'dark', 'system'.
    static func appearancePrefs(core: BudgeerCore = .shared) -> [String] {
        (try? core.call("themePref", "appearancePrefs", [])) ?? []
    }

    /// Every release with pages, newest first, in the app's language.
    static func whatsNew(core: BudgeerCore = .shared) -> [WhatsNewRelease] {
        (try? core.call("whatsNewMath", "whatsNewList", [])) ?? []
    }

    /// A sentence with tags (<email/>, <privacy>…</privacy>) as its parts.
    static func rich(_ text: String, core: BudgeerCore = .shared) -> JSONValue {
        (try? core.json("translate", "parseRich", [text])) ?? [.string(text)]
    }
}
