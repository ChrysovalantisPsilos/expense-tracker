// "Scan a receipt" on Add, after the web's ReceiptScanner: the phone reads
// the photo (ReceiptReader, Apple's Vision, on the device), the words go
// through the web's own reading (receiptRead: receiptText, readReceipt), the
// user checks and corrects what was read (receiptFields, receiptNothingRead),
// and "Use these" hands the result (receiptResult) to the form, which fills
// itself as the web's does (EntryFormModel.useReceipt, receiptFill). Nothing
// is uploaded or kept: the photo stays in memory until the sheet goes.
import Foundation
import Observation
import BudgeerCore

@MainActor
@Observable
final class ReceiptModel {
    enum Stage: Equatable {
        /// Nothing scanned (or the scan was removed).
        case idle
        /// The phone is reading the photo.
        case reading
        /// What was read, to check and correct.
        case check
        /// Used: the form holds what it read.
        case done
    }

    private(set) var stage: Stage = .idle
    var merchant = ""
    private(set) var total = ""
    var currency = ""
    var date = ""
    /// Why the last photo couldn't be read.
    private(set) var problem: String?

    private let core: BudgeerCore

    init(core: BudgeerCore = .shared) {
        self.core = core
    }

    /// A photo was picked: it's being read.
    func started() {
        stage = .reading
        problem = nil
    }

    /// The recognised words ([{ text, x, y, w, h }], Vision's boxes) → the check.
    func read(boxes: JSONValue) {
        do {
            let text: String = try core.call("receiptRead", "receiptText", [boxes])
            let read = try core.json("receiptRead", "readReceipt", [text])
            let fields = try core.json("receiptRead", "receiptFields", [read])
            merchant = fields["merchant"]?.stringValue ?? ""
            total = fields["total"]?.stringValue ?? ""
            currency = fields["currency"]?.stringValue ?? ""
            date = fields["date"]?.stringValue ?? ""
            stage = .check
        } catch {
            failed()
        }
    }

    /// The photo couldn't be opened (`opening`) or read: the web's words for each.
    func failed(opening: Bool = false) {
        stage = .idle
        problem = core.text(opening ? "common:receipt.openFailed" : "common:receipt.scanFailed")
    }

    /// The total as typed, cleaned the way the web's MoneyInput cleans it.
    func setTotal(_ text: String) {
        total = (try? core.call("moneyParse", "sanitizeAmountInput", [text, currency.isEmpty ? "EUR" : currency])) ?? text
    }

    private var fields: JSONValue {
        ["merchant": .string(merchant), "total": .string(total), "currency": .string(currency), "date": .string(date)]
    }

    /// The check's line: little was read, or correct what was misread.
    var note: String {
        let nothing: Bool = (try? core.call("receiptRead", "receiptNothingRead", [fields])) ?? false
        return core.text(nothing ? "ios:native.receipt.nothingRead" : "common:receipt.correct")
    }

    /// The currencies the check offers ("" is none read).
    var currencyOptions: [String] {
        [""] + ((try? core.call("currency", "currencyCodes", [JSONValue.string(currency)])) ?? [])
    }

    /// "Use these": the scan the form takes (receiptResult); the receipt is done.
    func use() -> JSONValue? {
        guard stage == .check, let scan = try? core.json("receiptRead", "receiptResult", [fields]) else { return nil }
        stage = .done
        return scan
    }

    /// Cancel the check, or remove a used receipt (the form keeps what it filled, as on the web).
    func clear() {
        stage = .idle
        problem = nil
    }
}
