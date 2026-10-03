// Settings › Your data: Export gathers everything into the web's document
// (backupMath.buildBackup), refuses a short read, checks a password as the
// web does and names the file as the web names it; Restore reads the web's
// files (plain, and sealed by the website's WebCrypto: Fixtures/
// backup-sealed.json), refuses what isn't a backup, says what's in one and
// merges it in as backup.js does, with the web's summary. Sealing on the
// phone and opening the result again is CryptoKit's (on a Mac).
import XCTest
import BudgeerCore
@testable import Budgeer

@MainActor
final class BackupTests: XCTestCase {
    /// An account with a little of everything a backup carries.
    private func store() -> FakeStore {
        let store = FakeStore()
        store.allCategoriesResult = .success(TestData.categories)
        store.importRuleRows = [["id": "r1", "pattern": "LIDL", "category_id": "c-food", "created_at": .null]]
        store.accountRows = [["id": "a1", "name": "Current", "type": "asset", "balance_minor": 120000, "currency": "EUR"]]
        store.goalRows = [["id": "g1", "name": "Holiday", "target_minor": 100000, "saved_minor": 2500, "currency": "EUR",
                           "target_date": .null]]
        store.budgetsByPeriod = ["2026-09-01": [["category_id": "c-food", "amount_minor": 40000, "currency": "EUR",
                                                 "period_start": "2026-09-01"]]]
        store.rowsResult = .success([
            ["id": "t1", "kind": "expense", "category_id": "c-food", "amount_minor": 450, "currency": "EUR", "exchange_rate": 1,
             "description": "Lunch", "notes": .null, "spent_at": "2026-09-01"],
            ["id": "t2", "kind": "income", "category_id": "c-pay", "amount_minor": 300000, "currency": "EUR", "exchange_rate": 1,
             "description": "Salary", "notes": .null, "spent_at": "2026-09-25"],
        ])
        return store
    }

    private func exporter(_ store: FakeStore, sealer: BackupSealing = BackupSeal()) -> ExportBackupModel {
        let now = TestData.now
        return ExportBackupModel(data: store.data, userId: "u-1", sealer: sealer, now: { now })
    }

    private func restorer(_ store: FakeStore, sealer: BackupSealing = BackupSeal()) -> RestoreBackupModel {
        let now = TestData.now
        return RestoreBackupModel(data: store.data, userId: "u-1", email: "sam@example.com", sealer: sealer, now: { now })
    }

    func testExportWritesTheWebsDocumentUnderTheWebsName() async throws {
        let model = exporter(store())
        let made = await model.export()
        XCTAssertTrue(made, model.failed ?? "")
        let file = try XCTUnwrap(model.file)
        XCTAssertEqual(file.lastPathComponent, "budgeer-backup-2026-09-15.json")
        XCTAssertFalse(model.sealed)
        let read = try BudgeerCore.shared.json("backupMath", "readBackup", [String(decoding: try Data(contentsOf: file), as: UTF8.self)])
        let data = try XCTUnwrap(read["backup"]?["data"])
        XCTAssertEqual(data["transactions"]?.arrayValue?.count, 2)
        XCTAssertEqual(data["categories"]?.arrayValue?.count, 4)
        XCTAssertEqual(data["categoryRules"], [["pattern": "LIDL", "category": "c1"]])
        XCTAssertEqual(data["budgets"]?.arrayValue?.count, 1)
        XCTAssertEqual(data["profile"]?["display_name"], "Sam Morgan")
        XCTAssertEqual(read["backup"]?["exportedAt"], "2026-09-15T10:00:00.000Z")
    }

    func testAShortReadIsNeverABackup() async {
        let store = store()
        store.transactionCount = 3
        let model = exporter(store)
        let made = await model.export()
        XCTAssertFalse(made)
        XCTAssertNil(model.file)
        XCTAssertEqual(model.failed, "Couldn’t read all of your entries — please try again.")
    }

    func testThePasswordsChecksAreTheWebs() async {
        let model = exporter(store())
        model.password = "short"
        XCTAssertNotNil(model.passwordError)
        model.password = "correct horse 42"
        XCTAssertNil(model.passwordError)
        XCTAssertTrue(model.mismatch)
        let made = await model.export()
        XCTAssertFalse(made)
        XCTAssertTrue(model.touched)
        XCTAssertEqual(model.passwordNote.problem, false)
        model.password = "letters"
        XCTAssertTrue(model.passwordNote.problem)
    }

    func testRestoreSaysWhatsInTheBackupThenMergesItIn() async throws {
        let store = FakeStore()
        let model = restorer(store)
        await model.read(text: String(decoding: try fixtureData("backup-plain"), as: UTF8.self))
        XCTAssertEqual(model.step, .review)
        XCTAssertEqual(model.title, "Restore this backup?")
        XCTAssertTrue(model.made?.hasPrefix("Backup made ") == true, model.made ?? "")
        XCTAssertNil(model.currencyNote, "the same main currency")
        XCTAssertEqual(model.contents.map(\.count), [2, 1, 2, 1, 1, 1, 1, 1, 0])
        XCTAssertNotNil(model.groupShares)

        await model.restore()
        XCTAssertEqual(model.step, .done, model.stopped ?? "")
        XCTAssertEqual(store.importWrites.first { $0.name == "createCategories" }?.args.arrayValue?.count, 2)
        XCTAssertEqual(store.importWrites.filter { $0.name == "saveRule" }.map(\.args), [["pattern": "LIDL", "category_id": "new-1"]])
        let saved = store.importWrites.filter { $0.name == "saveTransactions" }.flatMap { $0.args.arrayValue ?? [] }
        XCTAssertEqual(saved.count, 3)
        XCTAssertTrue(saved.contains { $0["notes"] == "Group: Lisbon trip" })
        XCTAssertEqual(store.importWrites.filter { $0.name == "saveBudget" }.count, 1)
        XCTAssertEqual(store.savedRules.count, 1)
        XCTAssertEqual(store.savingsWrites.map(\.name), ["saveAccount", "saveGoal"])
        XCTAssertEqual(store.writes("savePaymentInfo"), [["iban": .null, "revolut": "alexdemo", "paypal": .null]])
        let summary = try XCTUnwrap(model.summary)
        XCTAssertTrue(summary.added.hasPrefix("Added 2 expenses, 1 income entry, 2 categories"), summary.added)
        XCTAssertEqual(summary.kept,
                       "Kept your current display name and push notifications — the backup’s differ. You can change them in Settings.")
    }

    func testWhatIsntABackupSaysSo() async {
        let model = restorer(FakeStore())
        await model.read(text: "{\"hello\": 1}")
        XCTAssertEqual(model.step, .error)
        XCTAssertEqual(model.error, "This file isn’t a Budgeer backup.")
        model.chooseAnother()
        await model.read(text: "{\"format\": \"budgeer-backup\", \"version\": 99}")
        XCTAssertTrue(model.error?.hasPrefix("This backup was made by a newer version of Budgeer.") == true)
    }

    #if canImport(CryptoKit)
    /// The website's sealed file opens here, and a file sealed here opens again.
    func testSealedFilesOpenEitherWay() async throws {
        let model = restorer(FakeStore())
        await model.read(text: String(decoding: try fixtureData("backup-sealed"), as: UTF8.self))
        XCTAssertEqual(model.step, .password)
        model.password = "wrong horse 42"
        await model.unlock()
        XCTAssertEqual(model.passwordError, "Wrong password or damaged file.")
        model.password = "correct horse 42"
        await model.unlock()
        XCTAssertEqual(model.step, .review)
        XCTAssertEqual(model.contents.first?.count, 2)

        let export = exporter(store())
        export.password = "another horse 7"
        export.confirm = "another horse 7"
        let made = await export.export()
        XCTAssertTrue(made, export.failed ?? "")
        XCTAssertTrue(export.sealed)
        let again = restorer(FakeStore())
        await again.read(text: String(decoding: try Data(contentsOf: try XCTUnwrap(export.file)), as: UTF8.self))
        XCTAssertEqual(again.step, .password)
        again.password = "another horse 7"
        await again.unlock()
        XCTAssertEqual(again.step, .review)
        XCTAssertEqual(again.contents.first?.count, 1)
    }
    #endif

    // MARK: Start fresh

    private func freshModel(_ store: FakeStore, _ security: FakeSecurity) -> StartFreshModel {
        let now = TestData.now
        return StartFreshModel(data: store.data, security: security, signOut: {}, now: { now })
    }

    func testStartFreshWithAPasswordAsksForThePhraseAndThePasswordThenStartsOver() async {
        let store = FakeStore()
        let model = freshModel(store, FakeSecurity())
        var done = 0
        model.onDone = { done += 1 }
        await model.load()
        XCTAssertFalse(model.isDemo)
        XCTAssertEqual(model.phraseHint, "START FRESH")
        XCTAssertEqual(model.scope.wiped.count, 7)
        XCTAssertEqual(model.scope.kept.count, 3)
        XCTAssertEqual(model.check?.password, true)
        model.phrase = "start fresh"
        XCTAssertEqual(model.check?.canSubmit, false)
        model.password = "my-password"
        XCTAssertEqual(model.check?.canSubmit, true)
        let ran = await model.startFresh()
        XCTAssertTrue(ran)
        XCTAssertEqual(store.writes("startFresh"), [["password": "my-password"]])
        XCTAssertEqual(done, 1)
        XCTAssertEqual(model.phrase, "")
        XCTAssertEqual(model.password, "")
    }

    func testStartFreshWithoutAPasswordNeedsAFreshSignIn() async {
        let store = FakeStore()
        let fake = FakeSecurity()
        fake.user = ["email": "sam@example.com", "app_metadata": ["providers": ["google"]], "user_metadata": [:]]
        fake.claims = ["iat": .int(Int(TestData.now.timeIntervalSince1970) - 3600)]
        let model = freshModel(store, fake)
        await model.load()
        model.phrase = "START FRESH"
        XCTAssertEqual(model.check?.needsReauth, true)
        let refused = await model.startFresh()
        XCTAssertFalse(refused)
        XCTAssertTrue(store.writes("startFresh").isEmpty)
        fake.claims = ["iat": .int(Int(TestData.now.timeIntervalSince1970) - 30)]
        let ran = await model.startFresh()
        XCTAssertTrue(ran)
        XCTAssertEqual(store.writes("startFresh"), [["password": .null]])
    }

    func testAWrongPasswordOrARefusalSaysWhyAndKeepsTheSheet() async {
        let store = FakeStore()
        store.startFreshError = CurrentPasswordInvalid()
        let model = freshModel(store, FakeSecurity())
        var done = 0
        model.onDone = { done += 1 }
        await model.load()
        model.phrase = "START FRESH"
        model.password = "nope"
        let wrong = await model.startFresh()
        XCTAssertFalse(wrong)
        XCTAssertEqual(model.failed, "That password isn’t right.")
        store.startFreshError = ServerError(code: "P0001", message: "Too many fresh starts — please try again tomorrow.")
        model.password = "my-password"
        XCTAssertNil(model.failed)
        let limited = await model.startFresh()
        XCTAssertFalse(limited)
        XCTAssertEqual(model.failed, "Too many fresh starts — please try again tomorrow.")
        XCTAssertEqual(done, 0)
    }

    func testStartFreshIsHiddenOnTheDemoLogin() async {
        let store = FakeStore()
        store.profileResult = .success(["base_currency": "EUR", "is_demo": true])
        let model = freshModel(store, FakeSecurity())
        await model.load()
        XCTAssertTrue(model.isDemo)
    }
}
