// An open entry form (a page pushed in the tab it was opened from): Add
// from "+", Edit from a row, or a recurring rule's page. It holds its model
// so the page keeps its state.
import Foundation

struct EntrySheet: Identifiable, Hashable {
    let id = UUID()
    let model: EntryFormModel

    static func == (lhs: EntrySheet, rhs: EntrySheet) -> Bool { lhs.id == rhs.id }
    func hash(into hasher: inout Hasher) { hasher.combine(id) }

    /// Add an expense or income (Repeat on for "add a recurring entry").
    @MainActor
    static func add(kind: String = "expense", repeats: Bool = false, data: DataLayer) -> EntrySheet {
        EntrySheet(model: EntryFormModel(mode: .add, kind: kind, repeats: repeats, data: data))
    }

    /// Edit a saved transaction (its rule is found when it repeats).
    @MainActor
    static func edit(_ row: JSONValue, data: DataLayer) -> EntrySheet {
        EntrySheet(model: EntryFormModel(mode: .edit, transaction: row, data: data))
    }

    /// A recurring rule's page.
    @MainActor
    static func rule(_ rule: JSONValue, data: DataLayer) -> EntrySheet {
        EntrySheet(model: EntryFormModel(mode: .rule, rule: rule, data: data))
    }
}
