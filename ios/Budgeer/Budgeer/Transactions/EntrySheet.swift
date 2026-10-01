// An open entry form (a sheet): Add from "+", Edit from a row, or a
// recurring rule's page. It holds its model so the sheet keeps its state.
import Foundation

@MainActor
struct EntrySheet: Identifiable {
    let id = UUID()
    let model: EntryFormModel

    /// Add an expense or income (Repeat on for "add a recurring entry").
    static func add(kind: String = "expense", repeats: Bool = false, data: DataLayer) -> EntrySheet {
        EntrySheet(model: EntryFormModel(mode: .add, kind: kind, repeats: repeats, data: data))
    }

    /// Edit a saved transaction (its rule is found when it repeats).
    static func edit(_ row: JSONValue, data: DataLayer) -> EntrySheet {
        EntrySheet(model: EntryFormModel(mode: .edit, transaction: row, data: data))
    }

    /// A recurring rule's page.
    static func rule(_ rule: JSONValue, data: DataLayer) -> EntrySheet {
        EntrySheet(model: EntryFormModel(mode: .rule, rule: rule, data: data))
    }
}
