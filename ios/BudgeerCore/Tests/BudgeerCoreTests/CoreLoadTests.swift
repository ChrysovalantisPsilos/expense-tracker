// The core loads into JavaScriptCore, answers typed calls, surfaces the
// web's errors as Swift errors, and switches its wording with setLanguage.
import XCTest
@testable import BudgeerCore

final class CoreLoadTests: XCTestCase {
    func testLoadsAndAnswersTypedCalls() throws {
        let core = try BudgeerCore()
        XCTAssertEqual(core.language, "en")
        XCTAssertEqual(try core.split.equally(1000, among: 3), [334, 333, 333])
        XCTAssertEqual(try core.money.format(123_456, currency: "JPY"), "¥123,456")
        XCTAssertEqual(try core.money.toMinor("18.50"), 1850)
        let label: String = try core.call("i18n", "t", ["recurring:choices.monthly"])
        XCTAssertEqual(label, "Monthly")
    }

    func testJavaScriptErrorsBecomeSwiftErrors() throws {
        let core = try BudgeerCore()
        XCTAssertThrowsError(try core.call("splitMath", "nope", []) as [Int]) { error in
            guard case BudgeerCoreError.noSuchFunction(let name) = error else { return XCTFail("\(error)") }
            XCTAssertEqual(name, "splitMath.nope")
        }
        XCTAssertThrowsError(try core.callJSON("nowhere", "fn", argsJSON: "[]")) { error in
            guard case BudgeerCoreError.javaScript(let message, _) = error else { return XCTFail("\(error)") }
            XCTAssertTrue(message.contains("no module \"nowhere\""), message)
        }
    }

    func testSetLanguageChangesTheWording() throws {
        let core = try BudgeerCore()
        XCTAssertEqual(try core.setLanguage("el"), "el")
        XCTAssertEqual(core.language, "el")
        let label: String = try core.call("i18n", "t", ["recurring:choices.monthly"])
        XCTAssertEqual(label, "Μηνιαία")
        XCTAssertEqual(try core.money.format(123_456), "1.234,56\u{00A0}€") // Intl's no-break space
        XCTAssertEqual(try core.setLanguage("fr"), "en", "an unknown language falls back to English")
        let back: String = try core.call("i18n", "t", ["recurring:choices.monthly"])
        XCTAssertEqual(back, "Monthly")
    }

    /// A statement's bytes go in as a Uint8Array; the engine has no
    /// TextDecoder, so the core's own reads a Greek Windows (cp1253) export.
    func testReadsAStatementFromItsBytes() throws {
        struct Table: Decodable {
            let ok: Bool
            let headers: [String]
            let rows: [[String]]
            let lines: [Int]
        }
        let core = try BudgeerCore()
        let text = "Date;Περιγραφή;Ποσό\n01/09/2026;Καφές Αθήνα;-3,50\n"
        let bytes = try XCTUnwrap(text.data(using: .windowsCP1253))
        let table: Table = try core.callBytes("sheetRead", "readStatement", bytes: bytes)
        XCTAssertTrue(table.ok)
        XCTAssertEqual(table.headers, ["Date", "Περιγραφή", "Ποσό"])
        XCTAssertEqual(table.rows, [["01/09/2026", "Καφές Αθήνα", "-3,50"]])
        XCTAssertEqual(table.lines, [2])
        XCTAssertThrowsError(try core.callBytes("sheetRead", "nope", bytes: bytes) as Table) { error in
            guard case BudgeerCoreError.noSuchFunction(let name) = error else { return XCTFail("\(error)") }
            XCTAssertEqual(name, "sheetRead.nope")
        }
    }

    func testDateAndUndefinedArgumentsTravel() throws {
        let core = try BudgeerCore()
        // periods.thisMonthPeriod(now): the month of a Date (2026-09-21 in UTC).
        // (A period also says whether the month is still open: a Bool among the strings.)
        struct Period: Decodable { let from: String; let to: String; let label: String }
        let period: Period = try core.call("periods", "thisMonthPeriod", [JSDate(Date(timeIntervalSince1970: 1_790_000_000))])
        XCTAssertEqual(period.from, "2026-09-01")
        XCTAssertEqual(period.to, "2026-09-30")
        XCTAssertEqual(period.label, "This month")
        // currency.minorFactor(undefined) takes the default currency.
        let factor: Int = try core.call("currency", "minorFactor", [JSUndefined()])
        XCTAssertEqual(factor, 100)
    }
}
