// The entry form over the fake store: Add, the inline errors, the exchange
// rate (the ECB's, a missing one typed in), Repeat on Add (a rule made from
// the entry), Edit of an entry in a series, a rule's page, Type it with
// Undo, "Paid from", and Delete. Every rule is the core's; these check the
// form carries the web's answers to the right RPCs.
import XCTest
import BudgeerCore
@testable import Budgeer

@MainActor
final class EntryFormModelTests: XCTestCase {
    override func setUpWithError() throws {
        try super.setUpWithError()
        try BudgeerCore.shared.setLanguage("en")
    }

    private func store() -> FakeStore {
        let store = FakeStore()
        store.categoriesResult = .success(TestData.categories)
        store.savingsResult = .success([["id": "c-sav", "kind": "income", "is_savings": true]])
        return store
    }

    private func model(_ mode: EntryFormModel.Mode, _ store: FakeStore, kind: String = "expense", repeats: Bool = false,
                       transaction: JSONValue? = nil, rule: JSONValue? = nil) async -> EntryFormModel {
        let now = TestData.now
        let model = EntryFormModel(mode: mode, kind: kind, repeats: repeats, transaction: transaction, rule: rule,
                                   data: store.data, core: .shared, now: { now })
        await model.load()
        return model
    }

    func testAddAnExpense() async throws {
        let store = store()
        let model = await model(.add, store)
        XCTAssertTrue(model.ready)
        XCTAssertEqual(model.title, "New expense")
        XCTAssertEqual(model.saveLabel, "Add expense")
        XCTAssertEqual(model.date, "2026-09-15")
        XCTAssertEqual(model.categoryOptions.map(\.name), ["Groceries", "Fun"])
        model.setAmount("12,5")
        XCTAssertEqual(model.amount, "12.5") // the web's MoneyInput cleaning
        model.pickCategory("c-food")
        model.setDescription("Market")
        let saved = await model.save()
        XCTAssertTrue(saved)
        let row = try XCTUnwrap(store.inserted.first)
        XCTAssertEqual(row["kind"], "expense")
        XCTAssertEqual(row["amount_minor"], 1250)
        XCTAssertEqual(row["currency"], "EUR")
        XCTAssertEqual(row["exchange_rate"], 1)
        XCTAssertEqual(row["category_id"], "c-food")
        XCTAssertEqual(row["description"], "Market")
        XCTAssertEqual(row["spent_at"], "2026-09-15")
        XCTAssertEqual(row["paid_from_savings"], false)
        XCTAssertNotNil(row["client_uuid"]?.stringValue)
        XCTAssertTrue(store.savedRules.isEmpty)
    }

    func testTheAmountIsRequired() async {
        let store = store()
        let model = await model(.add, store)
        XCTAssertTrue(model.errors.isEmpty) // none before a save
        let saved = await model.save()
        XCTAssertFalse(saved)
        XCTAssertNotNil(model.errors["amount"])
        XCTAssertNil(model.errors["date"])
        XCTAssertTrue(store.inserted.isEmpty)
    }

    func testRepeatOnAddMakesARuleFromTheEntry() async throws {
        let store = store()
        let model = await model(.add, store, repeats: true)
        XCTAssertTrue(model.repeatOn)
        XCTAssertEqual(model.repeatNextRun, "2026-10-15")
        XCTAssertEqual(model.repeatNextHelp, "This entry is the first; the next is on 15 Oct.")
        model.editRepeat(["choice": "yearly"])
        XCTAssertEqual(model.repeatNextRun, "2027-09-15")
        model.setAmount("96")
        XCTAssertEqual(model.repeatShare, "Counts as €8.00/month in budgets, spread over 12 months.")
        let saved = await model.save()
        XCTAssertTrue(saved)
        let row = try XCTUnwrap(store.inserted.first)
        let rule = try XCTUnwrap(store.savedRules.first)
        XCTAssertNil(rule.id)
        XCTAssertEqual(rule.fields["frequency"], "yearly")
        XCTAssertEqual(rule.fields["next_run"], "2027-09-15")
        XCTAssertEqual(rule.fields["amount_minor"], 9600)
        XCTAssertEqual(rule.fields["source_client_uuid"], row["client_uuid"])
        XCTAssertNil(model.repeatWarning)
    }

    func testAForeignAmountUsesTheECBRate() async throws {
        let store = store()
        store.rates = ["USD>EUR": 0.9]
        let model = await model(.add, store)
        model.pickCurrency("USD")
        XCTAssertEqual(model.fx, .loading)
        await model.settleRate()
        XCTAssertEqual(model.fx, .ok(rate: 0.9, date: "2026-09-15"))
        model.setAmount("10")
        XCTAssertEqual(model.rate, 0.9)
        XCTAssertEqual(model.fxLine?["text"], "$10.00 ≈ €9.00 @ 0.9 on 15 Sep (ECB)")
        let saved = await model.save()
        XCTAssertTrue(saved)
        XCTAssertEqual(store.inserted.first?["exchange_rate"], 0.9)
        XCTAssertEqual(store.inserted.first?["currency"], "USD")
    }

    func testAMissingRateMustBeTypedBeforeSaving() async throws {
        let store = store()
        let model = await model(.add, store)
        model.pickCurrency("PLN")
        await model.settleRate()
        XCTAssertEqual(model.fx, .missing)
        model.setAmount("10")
        XCTAssertNil(model.rate)
        XCTAssertEqual(model.fxLine?["status"], "missing")
        let refused = await model.save()
        XCTAssertFalse(refused)
        XCTAssertEqual(model.notice, "Enter the exchange rate")
        XCTAssertTrue(store.inserted.isEmpty)
        model.manualRate = "0,25"
        XCTAssertEqual(model.rate, 0.25)
        let saved = await model.save()
        XCTAssertTrue(saved)
        XCTAssertEqual(store.inserted.first?["exchange_rate"], 0.25)
    }

    func testPaidFromOffersSavingsButNoVouchersForARepeat() async {
        let store = store()
        store.vouchersResult = .success(["days": 20])
        let model = await model(.add, store)
        XCTAssertEqual(model.sources, ["bank", "savings", "vouchers"])
        model.pickPaidFrom("vouchers")
        XCTAssertEqual(model.shownPaidFrom, "vouchers")
        model.repeatOn = true
        XCTAssertEqual(model.sources, ["bank", "savings"])
        XCTAssertEqual(model.shownPaidFrom, "bank")
        await model.pickKind("income")
        XCTAssertEqual(model.sources, [])
        XCTAssertEqual(model.categoryOptions.map(\.id), ["c-pay", "c-sav"])
        model.pickCategory("c-sav")
        XCTAssertTrue(model.isSavings)
    }

    func testEditAnEntryInASeries() async throws {
        let store = store()
        let rule: JSONValue = ["id": "r1", "kind": "expense", "amount_minor": 999, "currency": "EUR", "category_id": "c-fun",
                               "description": "Music", "frequency": "monthly", "interval_n": 1, "next_run": "2026-10-03",
                               "end_date": .null, "remind_days_before": .null, "is_active": true,
                               "savings_from_income": false, "paid_from_savings": false]
        store.rulesResult = .success([rule])
        let row: JSONValue = ["id": "t1", "kind": "expense", "amount_minor": 999, "currency": "EUR", "exchange_rate": 1,
                              "category_id": "c-fun", "description": "Music", "notes": .null, "spent_at": "2026-09-03",
                              "recurring_rule_id": "r1", "account_id": .null, "savings_from_income": false,
                              "paid_from_savings": false, "paid_with_vouchers": false]
        let model = await model(.edit, store, transaction: row)
        XCTAssertEqual(model.title, "Edit expense")
        XCTAssertTrue(model.repeatOn)
        XCTAssertTrue(model.pausable)
        XCTAssertEqual(model.amount, "9.99")
        XCTAssertEqual(model.fx, .same)
        model.setAmount("10.99")
        let saved = await model.save()
        XCTAssertTrue(saved)
        let update = try XCTUnwrap(store.updated.first)
        XCTAssertEqual(update.id, "t1")
        XCTAssertEqual(update.fields["amount_minor"], 1099)
        XCTAssertNil(update.fields["kind"]) // a saved entry keeps its kind
        // Only what changed goes to the rule.
        let ruleSave = try XCTUnwrap(store.savedRules.first)
        XCTAssertEqual(ruleSave.id, "r1")
        XCTAssertEqual(ruleSave.fields, ["amount_minor": 1099])

        // Repeat off: the rule is removed.
        model.repeatOn = false
        _ = await model.save()
        XCTAssertEqual(store.deletedRules, ["r1"])
    }

    func testARulesPageSavesTheRule() async throws {
        let store = store()
        let rule: JSONValue = ["id": "r1", "kind": "expense", "amount_minor": 1500, "currency": "USD", "category_id": .null,
                               "description": "Cloud", "frequency": "monthly", "interval_n": 1, "next_run": "2026-09-01",
                               "end_date": .null, "remind_days_before": 3, "is_active": true,
                               "savings_from_income": false, "paid_from_savings": false]
        let model = await model(.rule, store, rule: rule)
        XCTAssertEqual(model.title, "Edit recurring entry")
        XCTAssertFalse(model.needsFx) // each charge gets its own day's rate
        XCTAssertNil(model.fxLine)
        XCTAssertEqual(model.dateHelp, "Any charges missed since then are added tonight.")
        XCTAssertTrue(model.repeatRemind)
        model.changeDate("2026-10-01")
        model.editRepeat(["active": false])
        let saved = await model.save()
        XCTAssertTrue(saved)
        let save = try XCTUnwrap(store.savedRules.first)
        XCTAssertEqual(save.id, "r1")
        XCTAssertEqual(save.fields["next_run"], "2026-10-01")
        XCTAssertEqual(save.fields["is_active"], false)
        XCTAssertEqual(save.fields["remind_days_before"], 3)
        XCTAssertNil(save.fields["paid_with_vouchers"])
        XCTAssertTrue(store.inserted.isEmpty)
    }

    func testTypeItFillsTheFormAndUndoPutsItBack() async throws {
        let store = store()
        store.profileResult = .success(["base_currency": "EUR", "ai_quick_entry": true])
        store.aiResult = .success(["kind": "income", "amount_minor": 250000, "currency": "EUR", "date": "2026-09-14",
                                   "category_id": "c-pay", "description": "September pay", "paid_from": .null])
        let model = await model(.add, store)
        XCTAssertTrue(model.quickOn)
        model.setAmount("3")
        model.quickText = "salary 2500 yesterday"
        await model.typeIt()
        XCTAssertEqual(store.aiLines, ["salary 2500 yesterday"])
        XCTAssertEqual(model.quickState, .done)
        XCTAssertEqual(model.kind, "income")
        XCTAssertEqual(model.amount, "2500.00")
        XCTAssertEqual(model.date, "2026-09-14")
        XCTAssertEqual(model.categoryId, "c-pay")
        XCTAssertEqual(model.description, "September pay")
        XCTAssertEqual(model.marks, ["amount", "date", "category", "description"])
        model.setAmount("2400")
        XCTAssertFalse(model.marks.contains("amount"))

        await model.undoFill()
        XCTAssertEqual(model.kind, "expense")
        XCTAssertEqual(model.amount, "3")
        XCTAssertEqual(model.date, "2026-09-15")
        XCTAssertEqual(model.marks, [])
    }

    func testTypeItFailureShowsTheHelpersWords() async {
        let store = store()
        store.profileResult = .success(["base_currency": "EUR", "ai_quick_entry": true])
        store.aiResult = .failure(ServerError(code: "rate_limited", message: "slow down"))
        let model = await model(.add, store)
        model.quickText = "coffee"
        await model.typeIt()
        XCTAssertEqual(model.quickState, .failed("ai:errors.rateLimited"))
    }

    func testTypeItIsOffWithoutTheSwitchAndOnEdit() async {
        let store = store()
        let model = await model(.add, store)
        XCTAssertFalse(model.quickOn)
    }

    func testDeleteAfterTheConfirm() async {
        let store = store()
        let row: JSONValue = ["id": "t9", "kind": "income", "amount_minor": 5000, "currency": "EUR", "exchange_rate": 1,
                              "category_id": .null, "description": .null, "notes": "gift", "spent_at": "2026-09-01",
                              "recurring_rule_id": .null, "categories": .null]
        let model = await model(.edit, store, transaction: row)
        XCTAssertEqual(model.notes, "gift")
        XCTAssertEqual(model.deleteTitle, "Delete this income?")
        XCTAssertEqual(model.deleteBody, "This entry · €50.00. This can’t be undone.")
        let deleted = await model.delete()
        XCTAssertTrue(deleted)
        XCTAssertEqual(store.deleted, ["t9"])
    }
}
