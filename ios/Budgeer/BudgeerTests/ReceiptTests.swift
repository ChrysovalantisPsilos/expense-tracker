// Scan a receipt on Add: the words the phone read (Vision's boxes) go
// through the web's receipt reading, the check shows what was read for
// correcting, and Use these fills the form as the web's TransactionForm
// does (receiptFill). Offered on a new expense only, as on the web.
import XCTest
import BudgeerCore
@testable import Budgeer

@MainActor
final class ReceiptTests: XCTestCase {
    override func setUpWithError() throws {
        try super.setUpWithError()
        try BudgeerCore.shared.setLanguage("en")
    }

    /// A café receipt as Vision gives it: the label and its amount as two boxes on one line.
    static let boxes: JSONValue = [
        ["text": "THE BEAN HOUSE", "x": 0.2, "y": 0.9, "w": 0.6, "h": 0.05],
        ["text": "Flat white", "x": 0.1, "y": 0.7, "w": 0.3, "h": 0.04],
        ["text": "£3.40", "x": 0.7, "y": 0.7, "w": 0.15, "h": 0.04],
        ["text": "13.30", "x": 0.7, "y": 0.395, "w": 0.2, "h": 0.04],
        ["text": "TOTAL", "x": 0.1, "y": 0.4, "w": 0.2, "h": 0.04],
        ["text": "14/09/2026 12:41", "x": 0.1, "y": 0.2, "w": 0.4, "h": 0.03],
    ]

    private func model(kind: String = "expense", mode: EntryFormModel.Mode = .add) async -> (EntryFormModel, FakeStore) {
        let store = FakeStore()
        store.categoriesResult = .success(TestData.categories)
        store.rates = ["GBP>EUR": 1.17]
        let now = TestData.now
        let model = EntryFormModel(mode: mode, kind: kind, data: store.data, core: .shared, now: { now })
        await model.load()
        return (model, store)
    }

    func testAReceiptIsReadCheckedAndFillsTheForm() async {
        let (form, _) = await model()
        XCTAssertTrue(form.offersReceipt)
        let receipt = form.receipt
        receipt.started()
        XCTAssertEqual(receipt.stage, .reading)
        receipt.read(boxes: ReceiptTests.boxes)
        XCTAssertEqual(receipt.stage, .check)
        XCTAssertEqual(receipt.merchant, "THE BEAN HOUSE")
        XCTAssertEqual(receipt.total, "13.3")
        XCTAssertEqual(receipt.currency, "GBP")
        XCTAssertEqual(receipt.date, "2026-09-14")
        XCTAssertEqual(receipt.note, "Correct anything that was misread, then use these details.")
        // Corrected by hand, cleaned as the web's MoneyInput cleans it.
        receipt.setTotal("13,35")
        XCTAssertEqual(receipt.total, "13.35")
        receipt.merchant = " Bean House "
        form.useReceipt()
        XCTAssertEqual(receipt.stage, .done)
        XCTAssertEqual(form.amount, "13.35")
        XCTAssertEqual(form.currency, "GBP")
        XCTAssertEqual(form.date, "2026-09-14")
        XCTAssertEqual(form.description, "Bean House")
        // Removing the receipt keeps what it filled, as on the web.
        receipt.clear()
        XCTAssertEqual(receipt.stage, .idle)
        XCTAssertEqual(form.amount, "13.35")
    }

    func testADescriptionTypedAlreadyStaysAndAnUnknownCurrencyIsTheForms() async {
        let (form, _) = await model()
        form.setDescription("Coffee with Ana")
        form.receipt.read(boxes: [
            ["text": "CAFE", "x": 0.1, "y": 0.9, "w": 0.3, "h": 0.05],
            ["text": "TOTAL CHF 12.00", "x": 0.1, "y": 0.5, "w": 0.6, "h": 0.04],
        ])
        form.receipt.currency = "XYZ"
        form.useReceipt()
        XCTAssertEqual(form.description, "Coffee with Ana")
        XCTAssertEqual(form.currency, "EUR")
        XCTAssertEqual(form.amount, "12.00")
        XCTAssertEqual(form.date, "2026-09-15") // none read: today stays
    }

    func testLittleReadSaysSoAndAFailureIsTheWebsWords() async {
        let (form, _) = await model()
        form.receipt.read(boxes: [["text": "~~~", "x": 0.1, "y": 0.5, "w": 0.2, "h": 0.04]])
        XCTAssertEqual(form.receipt.stage, .check)
        XCTAssertEqual(form.receipt.note,
                       "Couldn’t read much from this photo — fill in what you can, or try another photo.")
        form.receipt.clear()
        form.receipt.failed()
        XCTAssertEqual(form.receipt.problem, "Scan failed")
        form.receipt.failed(opening: true)
        XCTAssertEqual(form.receipt.problem, "That photo couldn’t be opened — try another one.")
        XCTAssertEqual(form.receipt.stage, .idle)
    }

    func testOnlyANewExpenseOffersAReceipt() async {
        let (income, _) = await model(kind: "income")
        XCTAssertFalse(income.offersReceipt)
        let (rule, _) = await model(mode: .rule)
        XCTAssertFalse(rule.offersReceipt)
    }
}
