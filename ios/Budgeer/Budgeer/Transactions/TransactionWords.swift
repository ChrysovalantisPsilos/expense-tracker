// DeleteTransactionDialog's words, through the core: "Delete this
// expense?", "Lunch · €12.00. This can't be undone."
import Foundation
import BudgeerCore

enum TransactionWords {
    static func deleteTitle(_ row: JSONValue, core: BudgeerCore = .shared) -> String {
        core.text("transactions:deleteDialog.title.\(row["kind"]?.stringValue == "income" ? "income" : "expense")")
    }

    static func deleteBody(_ row: JSONValue, core: BudgeerCore = .shared) -> String {
        let name: String = (try? core.call("categoryName", "entryName",
                                           [row, core.text("transactions:deleteDialog.thisEntry")])) ?? ""
        let amount = core.formatMoney(row["amount_minor"] ?? 0, row["currency"]?.stringValue ?? "EUR")
        return core.text("transactions:deleteDialog.body", ["name": .string(name), "amount": .string(amount)])
    }
}
