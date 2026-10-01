// Which language the app opens in: the device's first language only (what
// iOS Safari reports to the web), and, signed in, the profile's language
// first (ProfileLanguage over the fake store), as the web's
// reconcileLanguage decides it.
import XCTest
import BudgeerCore
@testable import Budgeer

@MainActor
final class AppLanguageTests: XCTestCase {
    private var defaults: UserDefaults!

    override func setUpWithError() throws {
        try super.setUpWithError()
        defaults = try XCTUnwrap(UserDefaults(suiteName: "AppLanguageTests"))
        defaults.removePersistentDomain(forName: "AppLanguageTests")
    }

    override func tearDownWithError() throws {
        defaults.removePersistentDomain(forName: "AppLanguageTests")
        try BudgeerCore.shared.setLanguage("en")
        try super.tearDownWithError()
    }

    private func language(_ preference: String? = nil, device: [String]) -> AppLanguage {
        AppLanguage(preference: preference, defaults: defaults, deviceLanguages: AppLanguage.reportedLanguages(device))
    }

    func testOnlyTheFirstPreferredLanguageIsTheDevicesLanguage() {
        XCTAssertEqual(AppLanguage.reportedLanguages(["en-BE", "el-GR", "nl-BE"]), ["en-BE"])
        XCTAssertEqual(AppLanguage.reportedLanguages(["el-GR", "en"]), ["el-GR"])
        XCTAssertEqual(AppLanguage.reportedLanguages([]), [])
    }

    func testAnEnglishDeviceWithGreekSecondShowsEnglish() {
        XCTAssertEqual(language(device: ["en-BE", "el-GR"]).current, "en")
        XCTAssertEqual(BudgeerCore.shared.language, "en")
    }

    func testAGreekDeviceShowsGreek() {
        XCTAssertEqual(language(device: ["el-GR", "en-BE"]).current, "el")
        XCTAssertEqual(BudgeerCore.shared.language, "el")
    }

    func testAnotherFirstLanguageShowsEnglishEvenWithGreekAfterIt() {
        XCTAssertEqual(language(device: ["fr-BE", "el-GR"]).current, "en")
    }

    func testTheProfilesLanguageWins() async {
        let lang = language(device: ["en-BE"])
        let store = FakeStore()
        store.profileResult = .success(["base_currency": "EUR", "language": "el", "is_demo": false])
        await ProfileLanguage.sync(lang, profiles: store)
        XCTAssertEqual(lang.preference, "el")
        XCTAssertEqual(lang.current, "el")
        XCTAssertEqual(defaults.string(forKey: AppLanguage.preferenceKey), "el")
        XCTAssertEqual(store.savedLanguages, [])
    }

    func testAProfileFollowingTheDeviceTakesThisDevicesChoice() async {
        let lang = language("el", device: ["en-BE"])
        let store = FakeStore()
        store.profileResult = .success(["base_currency": "EUR", "language": .null, "is_demo": false])
        await ProfileLanguage.sync(lang, profiles: store)
        XCTAssertEqual(lang.preference, "el")
        XCTAssertEqual(store.savedLanguages, ["el"])
    }

    func testFollowingTheDeviceEverywhereWritesNothing() async {
        let lang = language(device: ["en-BE", "el-GR"])
        let store = FakeStore()
        store.profileResult = .success(["base_currency": "EUR", "language": .null, "is_demo": false])
        await ProfileLanguage.sync(lang, profiles: store)
        XCTAssertEqual(lang.preference, AppLanguage.system)
        XCTAssertEqual(lang.current, "en")
        XCTAssertEqual(store.savedLanguages, [])
    }

    func testTheDemoAccountKeepsTheLanguageOnThisDevice() async {
        let lang = language("en", device: ["en-BE"])
        let store = FakeStore()
        store.profileResult = .success(["base_currency": "EUR", "language": "el", "is_demo": true])
        await ProfileLanguage.sync(lang, profiles: store)
        XCTAssertEqual(lang.preference, "en")
        await ProfileLanguage.save(lang, profiles: store)
        XCTAssertEqual(store.savedLanguages, [])
    }

    func testAChoiceIsSavedToTheProfile() async {
        let lang = language(device: ["en-BE"])
        let store = FakeStore()
        store.profileResult = .success(["base_currency": "EUR", "language": .null, "is_demo": false])
        lang.preference = "el"
        await ProfileLanguage.save(lang, profiles: store)
        lang.preference = AppLanguage.system
        await ProfileLanguage.save(lang, profiles: store)
        XCTAssertEqual(store.savedLanguages, ["el", nil])
    }
}
