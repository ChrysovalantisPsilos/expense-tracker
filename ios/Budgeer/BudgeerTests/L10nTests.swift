// The generated strings (mobile-core/strings.mjs → Resources/Generated) as
// the app reads them: both languages present, the web's keys, English as
// the fallback, and placeholders filled by the core.
import XCTest
import BudgeerCore
@testable import Budgeer

final class L10nTests: XCTestCase {
    func testBothLanguagesAreBundled() {
        XCTAssertEqual(L10n.languages, ["el", "en"])
    }

    func testTheWebsKeys() {
        XCTAssertEqual(L10n.string("shell:nav.home", lang: "en"), "Home")
        XCTAssertEqual(L10n.string("shell:nav.home", lang: "el"), "Αρχική")
        XCTAssertEqual(L10n.string("dashboard:overview.spent", lang: "en"), "Spent")
        XCTAssertEqual(L10n.string("ios:native.seeAll", lang: "en"), "See all")
    }

    func testAMissingKeyFallsBackToEnglishThenToTheKey() {
        XCTAssertEqual(L10n.string("shell:nav.home", lang: "xx"), "Home")
        XCTAssertEqual(L10n.string("nope:missing.key", lang: "en"), "nope:missing.key")
    }

    func testAppLanguageFollowsTheDeviceAndTellsTheCore() throws {
        let defaults = try XCTUnwrap(UserDefaults(suiteName: "L10nTests"))
        defaults.removePersistentDomain(forName: "L10nTests")
        defer { try? BudgeerCore.shared.setLanguage("en") }

        let greekDevice = AppLanguage(preference: "system", defaults: defaults, deviceLanguages: ["el-GR", "en"])
        XCTAssertEqual(greekDevice.current, "el")
        XCTAssertEqual(BudgeerCore.shared.language, "el")
        XCTAssertEqual(greekDevice.t("shell:nav.home"), "Αρχική")
        XCTAssertEqual(greekDevice.t("ios:more.version", ["version": .string("0.1.0")]), "Έκδοση 0.1.0")

        greekDevice.preference = "en"
        XCTAssertEqual(greekDevice.current, "en")
        XCTAssertEqual(BudgeerCore.shared.language, "en")
        XCTAssertEqual(defaults.string(forKey: AppLanguage.preferenceKey), "en")
        XCTAssertEqual(greekDevice.t("ios:more.version", ["version": .string("0.1.0")]), "Version 0.1.0")

        let remembered = AppLanguage(defaults: defaults, deviceLanguages: ["el"])
        XCTAssertEqual(remembered.preference, "en")
        XCTAssertEqual(remembered.current, "en")
    }

    func testCapsLabelsDropTheTonosAsBrowsersDo() {
        XCTAssertEqual("Επόμενες χρεώσεις".capsLabel, "ΕΠΟΜΕΝΕΣ ΧΡΕΩΣΕΙΣ")
        XCTAssertEqual("Προϋπολογισμοί".capsLabel, "ΠΡΟΫΠΟΛΟΓΙΣΜΟΙ")
        XCTAssertEqual("Next charges".capsLabel, "NEXT CHARGES")
    }
}
