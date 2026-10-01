// Which language the app opens in: the device's first language only (what
// iOS Safari reports to the web), and, signed in, the profile's language
// first (ProfileLanguage over the fake store), as the web's
// reconcileLanguage decides it; a choice made here stays made.
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
        await ProfileLanguage(language: lang, profiles: store).sync()
        XCTAssertEqual(lang.preference, "el")
        XCTAssertEqual(lang.current, "el")
        XCTAssertEqual(defaults.string(forKey: AppLanguage.preferenceKey), "el")
        XCTAssertEqual(store.savedLanguages, [])
    }

    func testAProfileFollowingTheDeviceTakesThisDevicesChoice() async {
        let lang = language("el", device: ["en-BE"])
        let store = FakeStore()
        store.profileResult = .success(["base_currency": "EUR", "language": .null, "is_demo": false])
        await ProfileLanguage(language: lang, profiles: store).sync()
        XCTAssertEqual(lang.preference, "el")
        XCTAssertEqual(store.savedLanguages, ["el"])
    }

    func testFollowingTheDeviceEverywhereWritesNothing() async {
        let lang = language(device: ["en-BE", "el-GR"])
        let store = FakeStore()
        store.profileResult = .success(["base_currency": "EUR", "language": .null, "is_demo": false])
        await ProfileLanguage(language: lang, profiles: store).sync()
        XCTAssertEqual(lang.preference, AppLanguage.system)
        XCTAssertEqual(lang.current, "en")
        XCTAssertEqual(store.savedLanguages, [])
    }

    func testTheDemoAccountKeepsTheLanguageOnThisDevice() async {
        let lang = language("en", device: ["en-BE"])
        let store = FakeStore()
        store.profileResult = .success(["base_currency": "EUR", "language": "el", "is_demo": true])
        let sync = ProfileLanguage(language: lang, profiles: store)
        await sync.sync()
        XCTAssertEqual(lang.preference, "en")
        await sync.choose("el")
        XCTAssertEqual(lang.preference, "el")
        XCTAssertEqual(store.savedLanguages, [])
    }

    func testAChoiceIsSavedToTheProfile() async {
        let lang = language(device: ["en-BE"])
        let store = FakeStore()
        store.profileResult = .success(["base_currency": "EUR", "language": .null, "is_demo": false])
        let sync = ProfileLanguage(language: lang, profiles: store)
        await sync.choose("el")
        await sync.choose(AppLanguage.system)
        XCTAssertEqual(store.savedLanguages, ["el", nil])
    }

    /// The owner's report: Greek on the profile, then "Follow my device" on an
    /// English phone. The choice is saved as null, and a profile read that
    /// still answers Greek (begun before the save, realtime catching up)
    /// doesn't put Greek back; once the profile says null it's settled, and a
    /// later Greek from another device still wins.
    func testFollowMyDeviceAfterGreekStays() async {
        let lang = language(device: ["en-BE"])
        let store = FakeStore()
        store.profileResult = .success(["base_currency": "EUR", "language": "el", "is_demo": false])
        let sync = ProfileLanguage(language: lang, profiles: store)
        await sync.sync()
        XCTAssertEqual(lang.current, "el")

        await sync.choose(AppLanguage.system)
        XCTAssertEqual(store.savedLanguages, [nil])
        XCTAssertEqual(lang.preference, AppLanguage.system)
        XCTAssertEqual(lang.current, "en")

        // The fake doesn't update the profile on a save: this read is the old one.
        await sync.sync()
        XCTAssertEqual(lang.preference, AppLanguage.system)
        XCTAssertEqual(lang.current, "en")

        store.profileResult = .success(["base_currency": "EUR", "language": .null, "is_demo": false])
        await sync.sync()
        XCTAssertEqual(lang.preference, AppLanguage.system)
        XCTAssertEqual(store.savedLanguages, [nil])

        store.profileResult = .success(["base_currency": "EUR", "language": "el", "is_demo": false])
        await sync.sync()
        XCTAssertEqual(lang.preference, "el")
    }

    /// A save that fails keeps the choice on this device: the profile's old
    /// language, read again, doesn't undo it.
    func testAFailedSaveKeepsTheChoiceHere() async {
        let lang = language(device: ["en-BE"])
        let store = FakeStore()
        store.profileResult = .success(["base_currency": "EUR", "language": "el", "is_demo": false])
        let sync = ProfileLanguage(language: lang, profiles: store)
        await sync.sync()
        store.writeError = URLError(.notConnectedToInternet)
        await sync.choose(AppLanguage.system)
        await sync.sync()
        XCTAssertEqual(lang.preference, AppLanguage.system)
        XCTAssertEqual(lang.current, "en")
    }
}
