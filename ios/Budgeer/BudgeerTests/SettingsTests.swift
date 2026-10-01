// Settings over fakes: Account (the profile, the currency lock, Getting
// paid as the web tidies it, the photo), the switches (Monthly spending,
// the messages, the AI helpers; a refused write puts them back), Security
// (the sign-in methods, the password, the fresh-sign-in rule, deleting the
// account) and Privacy (the consent history, the data file, a request).
// Every rule is the core's; these check the models call it and write
// through the web's RPCs.
import XCTest
import BudgeerCore
@testable import Budgeer

@MainActor
final class SettingsModelTests: XCTestCase {
    override func tearDown() {
        try? BudgeerCore.shared.setLanguage("en")
        super.tearDown()
    }

    private static let profile: JSONValue = [
        "id": "u1", "display_name": "Sam Morgan", "base_currency": "EUR", "avatar_url": .null, "is_demo": false,
        "yearly_separate": false, "salary_shift_from_day": .null, "salary_category_id": .null,
        "notify_email": true, "notify_digest": false, "ai_quick_entry": false, "ai_import_categories": false,
        "ai_month_summary": true, "ai_plan_whatif": false,
    ]

    private func store() -> FakeStore {
        let store = FakeStore()
        store.profileResult = .success(SettingsModelTests.profile)
        store.categoriesResult = .success(TestData.categories)
        return store
    }

    // MARK: Account

    func testAccountSavesTheNameAndCurrencyUntilTheCurrencyIsFixed() async {
        let store = store()
        store.myPayment = ["payment_iban": "BE68539007547034", "payment_revolut": .null, "payment_paypal": "SamM"]
        let model = AccountModel(data: store.data)
        await model.load()
        XCTAssertEqual(model.name, "Sam Morgan")
        XCTAssertEqual(model.iban, "BE68539007547034")
        XCTAssertEqual(model.paypal, "SamM")
        XCTAssertEqual(model.avatar?.initials, "SM")
        XCTAssertTrue(model.currencyOptions.contains("USD"))
        model.name = "Sam M."
        model.currency = "USD"
        await model.saveProfile()
        XCTAssertEqual(store.writes("updateProfile").last, ["display_name": "Sam M.", "base_currency": "USD"])
        XCTAssertEqual(model.message, "Profile saved")
        XCTAssertEqual(model.savedName, "Sam M.")

        store.currencyLocked = true
        await model.load()
        XCTAssertTrue(model.currencyLocked)
        model.name = ""
        await model.saveProfile()
        XCTAssertEqual(store.writes("updateProfile").last, ["display_name": .null])
    }

    func testGettingPaidIsTidiedAndABadPayPalNameIsRefused() async {
        let store = store()
        let model = AccountModel(data: store.data)
        await model.load()
        model.iban = "be68 5390 0754 7034"
        model.revolut = "@sam"
        model.paypal = "paypal.me/SamM"
        await model.savePayment()
        XCTAssertEqual(store.writes("savePaymentInfo"), [["iban": "BE68539007547034", "revolut": "sam", "paypal": "SamM"]])
        XCTAssertEqual(model.paypal, "SamM")
        XCTAssertEqual(model.message, "Payment details saved")
        model.paypal = "sam morgan"
        await model.savePayment()
        XCTAssertEqual(store.writes("savePaymentInfo").count, 1)
        XCTAssertTrue(model.warning)
        XCTAssertEqual(model.message, "A PayPal.me name is up to 20 letters and numbers.")
    }

    func testANewPhotoIsUploadedAndShown() async {
        let store = store()
        let model = AccountModel(data: store.data)
        await model.load()
        XCTAssertFalse(model.isDemo)
        await model.uploadPhoto(Data([1, 2, 3]))
        XCTAssertEqual(store.writes("uploadAvatar"), [["contentType": "image/jpeg", "ext": "jpg"]])
        XCTAssertEqual(model.avatar?.src, "https://example.supabase.co/storage/v1/object/public/avatars/u/avatar.jpg?t=3")
        XCTAssertEqual(model.message, "Photo updated")
    }

    // MARK: Switches

    func testMonthlySpendingAndTheSalaryShift() async {
        let store = store()
        let model = PreferencesModel(data: store.data)
        await model.load()
        XCTAssertTrue(model.countYearly)
        await model.setCountYearly(false)
        XCTAssertEqual(store.writes("updateProfile").last, ["yearly_separate": true])
        XCTAssertFalse(model.countYearly)

        XCTAssertEqual(model.salary?.on, false)
        XCTAssertEqual(model.salary?.disabled, false)
        XCTAssertEqual(model.salary?.days.count, 31)
        // On: day 25 and the category called Salary (salaryShiftPatch).
        await model.setSalaryShift(true)
        XCTAssertEqual(store.writes("updateProfile").last, ["salary_shift_from_day": 25, "salary_category_id": "c-pay"])
        XCTAssertEqual(model.salaryDay, 25)
        XCTAssertEqual(model.salaryCategory, "c-pay")
        await model.setSalaryDay(30)
        XCTAssertEqual(model.salary?.shortMonths, true)
        await model.setSalaryShift(false)
        XCTAssertEqual(store.writes("updateProfile").last, ["salary_shift_from_day": .null])
    }

    func testTheSalaryShiftNeedsAnIncomeCategory() async {
        let store = store()
        store.categoriesResult = .success([])
        let model = PreferencesModel(data: store.data)
        await model.load()
        XCTAssertEqual(model.salary?.disabled, true)
        XCTAssertEqual(model.salary?.hint, "settings:spending.salary.needsIncome")
    }

    func testARefusedSwitchGoesBack() async {
        let store = store()
        let model = PreferencesModel(data: store.data)
        await model.load()
        store.writeError = FakeError(description: "offline")
        await model.setEmail(false)
        XCTAssertTrue(model.emailOn)
        XCTAssertNotNil(model.message)
    }

    func testTheMessagesAndTheAiHelpers() async {
        let store = store()
        let model = PreferencesModel(data: store.data)
        await model.load()
        XCTAssertTrue(model.emailOn)
        XCTAssertFalse(model.digestOn)
        await model.setDigest(true)
        XCTAssertEqual(store.writes("updateProfile").last, ["notify_digest": true])
        XCTAssertEqual(model.aiSwitches, ["quickEntry", "importCategories", "monthSummary", "planWhatIf"])
        XCTAssertTrue(model.aiOn("monthSummary"))
        XCTAssertFalse(model.aiOn("quickEntry"))
        await model.setAi("quickEntry", true)
        XCTAssertEqual(store.writes("updateProfile").last, ["ai_quick_entry": true])
        XCTAssertTrue(model.aiOn("quickEntry"))
    }

    func testTheDemoAccountKeepsItsMessagesOff() async {
        let store = store()
        store.profileResult = .success(SettingsModelTests.profile.with("is_demo", true))
        let model = PreferencesModel(data: store.data)
        await model.load()
        XCTAssertTrue(model.isDemo)
    }

    // MARK: Security

    private func security(_ store: FakeStore, _ fake: FakeSecurity, signedOut: @escaping @MainActor () -> Void = {}) -> SecurityModel {
        let now = TestData.now
        return SecurityModel(data: store.data, security: fake, signOut: { signedOut() }, core: .shared, now: { now })
    }

    func testTheSignInMethodsOfAPasswordAccount() async {
        let fake = FakeSecurity()
        let model = security(store(), fake)
        await model.load()
        XCTAssertEqual(model.methods.map(\.key), ["password", "google", "apple"])
        XCTAssertEqual(model.methods.first?.detail, "sam@example.com")
        XCTAssertEqual(model.methods.map(\.connected), [true, false, false])
        XCTAssertTrue(model.hasPassword)
        XCTAssertNil(model.reauthText) // signed in a minute ago
        XCTAssertNotNil(model.blocks["google"]) // nothing to disconnect
        XCTAssertNotNil(model.blocks["apple"])
    }

    func testChangingThePassword() async {
        let fake = FakeSecurity()
        let model = security(store(), fake)
        await model.load()
        model.current = "old-pass-1"
        model.next = "new-pass-12"
        model.confirm = "new-pass-13"
        await model.changePassword()
        XCTAssertEqual(model.message, "New passwords don’t match.")
        XCTAssertTrue(fake.calls.isEmpty)
        model.confirm = "new-pass-12"
        await model.changePassword()
        XCTAssertEqual(fake.calls, ["change:old-pass-1>new-pass-12"])
        XCTAssertEqual(model.current, "")
        XCTAssertFalse(model.warning)

        fake.changeError = CurrentPasswordInvalid()
        model.current = "wrong"
        model.next = "new-pass-12"
        model.confirm = "new-pass-12"
        await model.changePassword()
        XCTAssertEqual(model.message, BudgeerCore.shared.text("common:errors.auth.currentPasswordInvalid"))
    }

    func testConnectingAndDisconnectingGoogleNeedAFreshSignIn() async throws {
        let fake = FakeSecurity()
        let model = security(store(), fake)
        await model.load()
        let url = await model.googleLinkURL()
        XCTAssertNotNil(url)
        await model.finishLink(try XCTUnwrap(url))
        XCTAssertEqual(model.methods[1].connected, true)
        XCTAssertNil(model.blocks["google"])
        await model.disconnect("google")
        XCTAssertEqual(fake.calls, ["linkURL", "finishLink", "unlink:google"])
        XCTAssertEqual(model.methods[1].connected, false)

        // An hour-old sign-in: Log in again first.
        fake.claims = ["iat": .int(Int(TestData.now.timeIntervalSince1970) - 3600)]
        await model.load()
        XCTAssertNotNil(model.reauthText)
        let refused = await model.googleLinkURL()
        XCTAssertNil(refused)
        let mayConnect = await model.mayConnect()
        XCTAssertFalse(mayConnect)
        XCTAssertEqual(fake.calls.count, 3)
    }

    func testConnectingAndDisconnectingApple() async {
        let fake = FakeSecurity()
        let model = security(store(), fake)
        await model.load()
        let mayConnect = await model.mayConnect()
        XCTAssertTrue(mayConnect)
        await model.connectApple(AppleCredential(idToken: "tok", nonce: "n"))
        XCTAssertEqual(model.methods.map(\.connected), [true, false, true])
        XCTAssertEqual(model.methods[2].detail, "x7k2@privaterelay.appleid.com")
        XCTAssertEqual(model.message, BudgeerCore.shared.text("settings:signIn.apple.linkedBody"))
        XCTAssertNil(model.blocks["apple"])
        await model.disconnect("apple")
        XCTAssertEqual(fake.calls, ["linkApple:tok", "unlink:apple"])
        XCTAssertEqual(model.message, BudgeerCore.shared.text("settings:signIn.apple.disconnected"))
        XCTAssertEqual(model.methods[2].connected, false)
    }

    func testAnAppleOnlyAccountKeepsApple() async {
        let fake = FakeSecurity()
        fake.user = ["email": "x7k2@privaterelay.appleid.com", "app_metadata": ["providers": ["apple"]], "user_metadata": [:]]
        fake.identityRows = [["provider": "apple", "identity_id": "i-a", "identity_data": ["email": "x7k2@privaterelay.appleid.com"]]]
        let model = security(store(), fake)
        await model.load()
        XCTAssertFalse(model.hasPassword)
        XCTAssertEqual(model.blocks["apple"], BudgeerCore.shared.text("settings:signIn.apple.onlyWay"))
    }

    func testAGoogleOnlyAccountSetsAFirstPassword() async {
        let fake = FakeSecurity()
        fake.user = ["email": "sam@example.com", "app_metadata": ["providers": ["google"]], "user_metadata": [:]]
        fake.identityRows = [["provider": "google", "identity_id": "i-g", "identity_data": ["email": "sam@gmail.com"]]]
        let model = security(store(), fake)
        await model.load()
        XCTAssertFalse(model.hasPassword)
        XCTAssertEqual(model.methods.first?.connected, false)
        model.settingFirst = true
        model.next = "first-pass-1"
        model.confirm = "first-pass-1"
        await model.setFirstPassword()
        XCTAssertEqual(fake.calls, ["first:first-pass-1"])
        XCTAssertFalse(model.settingFirst)
        XCTAssertTrue(model.hasPassword)
    }

    func testDeletingAPasswordAccount() async {
        let store = store()
        var signedOut = 0
        let model = security(store, FakeSecurity()) { signedOut += 1 }
        await model.load()
        XCTAssertEqual(model.deleteCheck?.password, true)
        XCTAssertEqual(model.deleteCheck?.canSubmit, false)
        XCTAssertEqual(model.deletionScope.deleted.count, 4)
        XCTAssertEqual(model.deletionScope.stays.count, 1)
        model.deleteValue = "my-password"
        let deleted = await model.deleteAccount()
        XCTAssertTrue(deleted)
        XCTAssertEqual(store.writes("deleteAccount"), [["password": "my-password"]])
        XCTAssertEqual(signedOut, 1)
    }

    func testDeletingAGoogleOnlyAccountNeedsAFreshSignInAndDelete() async {
        let store = store()
        let fake = FakeSecurity()
        fake.user = ["email": "sam@example.com", "app_metadata": ["providers": ["google"]], "user_metadata": [:]]
        fake.claims = ["iat": .int(Int(TestData.now.timeIntervalSince1970) - 3600)]
        let model = security(store, fake)
        await model.load()
        XCTAssertEqual(model.deleteCheck?.needsReauth, true)
        fake.claims = ["iat": .int(Int(TestData.now.timeIntervalSince1970) - 30)]
        await model.load()
        model.deleteValue = "delete"
        XCTAssertEqual(model.deleteCheck?.canSubmit, true)
        await model.deleteAccount()
        XCTAssertEqual(store.writes("deleteAccount"), [["password": .null]])
    }

    // MARK: Privacy

    func testTheConsentHistoryTheDataFileAndARequest() async throws {
        let store = store()
        store.consentRows = [
            ["id": "k1", "purpose": "weekly_digest", "version": .null, "granted": true, "source": "settings",
             "created_at": "2026-09-14T08:05:00Z"],
        ]
        let now = TestData.now
        let model = PrivacyModel(data: store.data, core: .shared, now: { now })
        await model.load()
        XCTAssertEqual(model.consents?.first?.text, "Weekly summary turned on in Settings")
        XCTAssertEqual(model.privacyEmail, "privacy@budgeer.com")
        XCTAssertEqual(model.requestKinds.first, "restrict")

        await model.download()
        let file = try XCTUnwrap(model.exportFile)
        XCTAssertEqual(file.lastPathComponent, "budgeer-my-data-2026-09-15.json")
        XCTAssertTrue(FileManager.default.fileExists(atPath: file.path))

        model.requestText = "short"
        let refused = await model.sendRequest()
        XCTAssertFalse(refused)
        XCTAssertEqual(model.message, "Tell us a little more (at least 10 characters).")
        model.kind = "object"
        model.requestText = "  Please stop the weekly email.  "
        let sent = await model.sendRequest()
        XCTAssertTrue(sent)
        XCTAssertEqual(store.writes("sendPrivacyRequest"), [["kind": "object", "message": "Please stop the weekly email."]])
        XCTAssertEqual(model.requestText, "")
    }
}

@MainActor
final class CategoriesModelTests: XCTestCase {
    override func tearDown() {
        try? BudgeerCore.shared.setLanguage("en")
        super.tearDown()
    }

    static let rows: JSONValue = [
        ["id": "c-food", "name": "Groceries", "kind": "expense", "icon": .null, "color": .null,
         "default_key": "groceries", "is_archived": false, "is_savings": false, "created_at": "2025-01-01T10:00:00Z"],
        ["id": "c-old", "name": "Arcade", "kind": "expense", "icon": "games", "color": "purple",
         "default_key": .null, "is_archived": true, "is_savings": false, "created_at": "2025-01-01T10:00:00Z"],
        ["id": "c-fun", "name": "Fun", "kind": "expense", "icon": .null, "color": "teal",
         "default_key": .null, "is_archived": false, "is_savings": false, "created_at": "2025-01-01T10:00:00Z"],
        ["id": "c-pay", "name": "Salary", "kind": "income", "icon": .null, "color": .null,
         "default_key": "salary", "is_archived": false, "is_savings": false, "created_at": "2025-01-01T10:00:00Z"],
        ["id": "c-bonus", "name": "Bonus", "kind": "income", "icon": "salary", "color": .null,
         "default_key": "bonus", "is_archived": false, "is_savings": false, "created_at": "2026-09-14T10:00:00Z"],
        ["id": "c-sav", "name": "Savings", "kind": "income", "icon": "savings", "color": .null,
         "default_key": "savings", "is_archived": false, "is_savings": true, "created_at": "2025-01-01T10:00:00Z"],
    ]

    static func store() -> FakeStore {
        let store = FakeStore()
        store.allCategoriesResult = .success(rows)
        return store
    }

    static func model(_ store: FakeStore) -> CategoriesModel {
        let now = TestData.now
        return CategoriesModel(data: store.data, core: .shared, now: { now })
    }

    func testTheListByKindActiveFirst() async {
        let model = CategoriesModelTests.model(CategoriesModelTests.store())
        await model.load()
        XCTAssertEqual(model.items.map(\.id), ["c-fun", "c-food", "c-old"])
        XCTAssertTrue(model.items.last?.archived == true)
        model.kind = "income"
        XCTAssertEqual(model.items.map(\.id), ["c-bonus", "c-pay", "c-sav"])
        XCTAssertEqual(model.items.first?.isNew, true) // Bonus, added yesterday
        XCTAssertEqual(model.items.last?.savings, true)
    }

    func testArchiveAndDeleteMovingTheEntries() async throws {
        let store = CategoriesModelTests.store()
        store.categoryUse = 3
        store.movedOnDelete = 3
        let model = CategoriesModelTests.model(store)
        await model.load()
        let fun = try XCTUnwrap(model.items.first { $0.id == "c-fun" })
        await model.toggleArchive(fun)
        XCTAssertEqual(store.writes("updateCategory"), [["id": "c-fun", "fields": ["is_archived": true]]])
        XCTAssertEqual(model.message, "Fun archived")

        await model.startDelete(fun)
        XCTAssertEqual(model.deleting?.count, 3)
        XCTAssertEqual(model.deleting?.targets.map(\.id), ["c-food"]) // active, same kind, not itself
        XCTAssertEqual(model.moveLabel(try XCTUnwrap(model.deleting)), "Move its 3 entries to")
        model.deleting?.moveTo = "c-food"
        let deleted = await model.confirmDelete()
        XCTAssertTrue(deleted)
        XCTAssertEqual(store.writes("deleteCategory"), [["id": "c-fun", "moveTo": "c-food"]])
        XCTAssertNil(model.deleting)
        XCTAssertEqual(model.message, "Fun deleted 3 entries moved to Groceries.")
    }

    func testANewCategoryIsCheckedAndSavedTrimmed() async {
        let store = CategoriesModelTests.store()
        let list = CategoriesModelTests.model(store)
        await list.load()
        let editor = list.editor(id: nil, kind: "expense")
        XCTAssertEqual(editor.icon, "other")
        XCTAssertEqual(editor.title, "New expense category")
        editor.name = " fun "
        XCTAssertEqual(editor.nameError, "You already have a category with that name.")
        let refused = await editor.save()
        XCTAssertFalse(refused)
        XCTAssertTrue(store.writes("createCategory").isEmpty)
        editor.name = "  Pets "
        editor.icon = "gifts"
        editor.color = "pink"
        editor.savings = true // not on an expense category
        let saved = await editor.save()
        XCTAssertTrue(saved)
        XCTAssertEqual(store.writes("createCategory"),
                       [["name": "Pets", "kind": "expense", "icon": "gifts", "color": "pink", "is_savings": false]])
        XCTAssertEqual(editor.message, "Pets added")
        XCTAssertEqual(editor.picker?.icons.count, 4)
        XCTAssertEqual(editor.picker?.colours.count, 8)
    }

    func testEditingWritesOnlyWhatChanged() async {
        let store = CategoriesModelTests.store()
        let list = CategoriesModelTests.model(store)
        await list.load()
        let editor = list.editor(id: "c-sav", kind: "expense")
        XCTAssertEqual(editor.kind, "income")
        XCTAssertEqual(editor.name, "Savings")
        XCTAssertEqual(editor.icon, "savings")
        XCTAssertTrue(editor.savings)
        let nothing = await editor.save()
        XCTAssertTrue(nothing)
        XCTAssertEqual(editor.message, "Nothing to save")
        XCTAssertTrue(store.writes("updateCategory").isEmpty)
        editor.savings = false
        editor.color = "green"
        await editor.save()
        XCTAssertEqual(store.writes("updateCategory"), [["id": "c-sav", "fields": ["color": "green", "is_savings": false]]])
        // A category without a stored icon starts on the one its badge shows, so saving keeps its look.
        XCTAssertEqual(list.editor(id: "c-pay", kind: "income").icon, "salary")
    }
}
