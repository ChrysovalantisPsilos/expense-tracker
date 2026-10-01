// Settings › Categories, after the web's Categories page: your expense and
// income categories (categoryMath.sortCategories: active A–Z, then
// archived), each with its badge, "New" for two days on the new default
// ones, and Archived or "Savings, not income" under it; archive or
// unarchive in place, and delete after choosing where its entries go
// (moveTargets, delete_category). Adding and editing are CategoryEditorModel.
// The reads and writes are the web's (categories.js); every rule is the core's.
import Foundation
import Observation
import BudgeerCore

/// One category in the list, as the core shows it.
struct CategoryItem: Identifiable, Equatable {
    let id: String
    let name: String
    let kind: String
    let look: CategoryLook
    let archived: Bool
    let savings: Bool
    /// The new default categories' "New" tag (isNewCategory).
    let isNew: Bool
}

/// Deleting a category: how many entries use it (nil while counting) and
/// where they can go (moveTargets).
struct CategoryDeletion: Identifiable, Equatable {
    let item: CategoryItem
    var count: Int?
    let targets: [(id: String, name: String)]
    var moveTo = ""
    var id: String { item.id }

    static func == (lhs: CategoryDeletion, rhs: CategoryDeletion) -> Bool {
        lhs.item == rhs.item && lhs.count == rhs.count && lhs.moveTo == rhs.moveTo
            && lhs.targets.map(\.id) == rhs.targets.map(\.id)
    }
}

@MainActor
@Observable
final class CategoriesModel {
    enum State: Equatable {
        case loading
        case loaded
        case failed(String)
    }

    private(set) var state: State = .loading
    /// The Expenses / Income switch ('expense' or 'income').
    var kind = "expense"
    private(set) var rows: JSONValue = []
    private(set) var message: String?
    private(set) var warning = false
    /// The delete being confirmed.
    var deleting: CategoryDeletion?
    private(set) var busy = false

    private let data: DataLayer
    private let core: BudgeerCore
    private let now: @Sendable () -> Date

    init(data: DataLayer, core: BudgeerCore = .shared, now: @escaping @Sendable () -> Date = { Date() }) {
        self.data = data
        self.core = core
        self.now = now
    }

    func load() async {
        do {
            rows = try await data.categories.allCategories()
            state = .loaded
        } catch {
            if case .loaded = state { return }
            state = .failed(UserMessage.of(error, core: core))
        }
    }

    /// The list for the kind picked.
    var items: [CategoryItem] { list(kind) }

    func list(_ kind: String) -> [CategoryItem] {
        let sorted = (try? core.json("categoryMath", "sortCategories", [rows, JSONValue.string(kind)]))?.arrayValue ?? []
        let ms = JSONValue.double((now().timeIntervalSince1970 * 1000).rounded())
        return sorted.compactMap { row in item(row, ms: ms) }
    }

    /// One category row as the list shows it.
    func item(_ row: JSONValue, ms: JSONValue? = nil) -> CategoryItem? {
        guard let id = row["id"]?.stringValue else { return nil }
        let kind = row["kind"]?.stringValue ?? "expense"
        let stamp = ms ?? JSONValue.double((now().timeIntervalSince1970 * 1000).rounded())
        return CategoryItem(
            id: id,
            name: (try? core.call("categoryName", "categoryDisplayName", [row])) ?? "",
            kind: kind,
            look: (try? CategoryLook.of(row, kind: kind, core: core)) ?? CategoryLook(key: "other", tone: "accent", tint: nil),
            archived: row["is_archived"]?.boolValue == true,
            savings: row["is_savings"]?.boolValue == true,
            isNew: (try? core.call("categoryMath", "isNewCategory", [row, stamp])) ?? false)
    }

    func row(_ id: String) -> JSONValue? {
        rows.arrayValue?.first { $0["id"]?.stringValue == id }
    }

    /// A category's editor (nil id: a new one of `kind`).
    func editor(id: String?, kind: String) -> CategoryEditorModel {
        CategoryEditorModel(category: id.flatMap { row($0) }, kind: kind, all: rows, data: data, core: core)
    }

    // MARK: Archive

    func toggleArchive(_ item: CategoryItem) async {
        busy = true
        defer { busy = false }
        do {
            let fields = try core.json("categoryName", "categoryUpdateRow", [["is_archived": .bool(!item.archived)] as JSONValue])
            try await data.categories.updateCategory(id: item.id, fields: fields)
            say(core.text(item.archived ? "categories:toasts.unarchived" : "categories:toasts.archived",
                          ["name": .string(item.name)]))
            await load()
        } catch {
            say(UserMessage.of(error, fallback: core.text("categories:toasts.notUpdated"), core: core), warning: true)
        }
    }

    // MARK: Delete

    /// The delete confirm for `item`: its targets now, its entries counted.
    func startDelete(_ item: CategoryItem) async {
        guard let row = row(item.id) else { return }
        let targets = (try? core.json("categoryMath", "moveTargets", [rows, row]))?.arrayValue ?? []
        deleting = CategoryDeletion(item: item, count: nil, targets: targets.compactMap { target in
            guard let id = target["id"]?.stringValue else { return nil }
            return (id, (try? core.call("categoryName", "categoryDisplayName", [target])) ?? "")
        })
        // A failed count still lets you choose (-1: unknown).
        let count = (try? await data.categories.countCategoryUse(id: item.id)) ?? -1
        if deleting?.id == item.id { deleting?.count = count }
    }

    /// "Move its 3 entries to" (or "Move its entries to" when the count is unknown).
    func moveLabel(_ deletion: CategoryDeletion) -> String {
        guard let count = deletion.count, count >= 0 else { return core.text("categories:deleteDialog.moveTo") }
        return core.text("categories:deleteDialog.moveCount", ["count": .int(count)])
    }

    @discardableResult
    func confirmDelete() async -> Bool {
        guard let deletion = deleting else { return false }
        busy = true
        defer { busy = false }
        do {
            let target = deletion.moveTo.isEmpty ? nil : deletion.moveTo
            let moved = try await data.categories.deleteCategory(id: deletion.item.id, moveTo: target)
            var words = core.text("categories:toasts.deleted", ["name": .string(deletion.item.name)])
            if moved > 0, let name = deletion.targets.first(where: { $0.id == target })?.name {
                words += " " + core.text("categories:toasts.moved", ["count": .int(moved), "target": .string(name)])
            }
            deleting = nil
            say(words)
            await load()
            return true
        } catch {
            say(UserMessage.of(error, core: core), warning: true)
            return false
        }
    }

    func say(_ text: String, warning: Bool = false) {
        message = text
        self.warning = warning
    }
}

/// Adding or editing one category, after the web's CategoryFields and its
/// pages: the name (categoryNameError: 1–60 characters, none of yours of
/// the same kind), the icon and colour (categoryStyle.categoryPicker), and
/// "Counts as savings" on an income category; Save writes what changed
/// (categoryPatch) or the new row (newCategoryRow). Archive is here too.
@MainActor
@Observable
final class CategoryEditorModel {
    /// The category edited, nil for a new one.
    let category: JSONValue?
    let kind: String
    var name: String
    var icon: String
    var color: String?
    var savings: Bool
    /// The name's error shows once a name was typed and left, or Save tried.
    var touched = false
    private(set) var busy = false
    private(set) var message: String?

    private let others: JSONValue
    private let data: DataLayer
    private let core: BudgeerCore

    init(category: JSONValue?, kind: String, all: JSONValue, data: DataLayer, core: BudgeerCore = .shared) {
        self.category = category
        self.kind = category?["kind"]?.stringValue ?? kind
        self.data = data
        self.core = core
        let base: JSONValue = category ?? ["kind": .string(kind)]
        others = (try? core.json("categoryMath", "sameKindOthers", [all, base])) ?? []
        let draft = (try? core.json("categoryMath", "categoryDraft", [category ?? .null])) ?? [:]
        name = draft["name"]?.stringValue ?? ""
        icon = draft["icon"]?.stringValue ?? "other"
        color = draft["color"]?.stringValue
        savings = draft["savings"]?.boolValue == true
    }

    var isNew: Bool { category == nil }
    var archived: Bool { category?["is_archived"]?.boolValue == true }

    /// Why the name can't be saved, nil when it can.
    var nameError: String? {
        (try? core.json("categoryMath", "categoryNameError", [JSONValue.string(name), others]))?.stringValue
    }

    /// The badge as it will look.
    var look: CategoryLook {
        let draft: JSONValue = ["name": .string(name), "icon": .string(icon), "color": color.json]
        return (try? CategoryLook.of(draft, kind: kind, core: core)) ?? CategoryLook(key: icon, tone: "accent", tint: nil)
    }

    /// The icon groups and the colours to pick from.
    var picker: CategoryPicker? {
        guard let picker: CategoryPicker = try? core.call("categoryStyle", "categoryPicker", []) else { return nil }
        return picker
    }

    /// The page's title: "New expense category" or "Edit Groceries".
    var title: String {
        if let category {
            let shown: String = (try? core.call("categoryName", "categoryDisplayName", [category])) ?? ""
            return core.text("categories:page.editTitle", ["name": .string(shown)])
        }
        return core.text(kind == "income" ? "categories:newPage.title.income" : "categories:newPage.title.expense")
    }

    private var values: JSONValue {
        ["name": .string(name), "icon": .string(icon), "color": color.json, "savings": .bool(savings)]
    }

    /// Save: the new row, or what changed. Returns whether to go back.
    @discardableResult
    func save() async -> Bool {
        touched = true
        guard nameError == nil else { return false }
        busy = true
        defer { busy = false }
        do {
            if let category, let id = category["id"]?.stringValue {
                let patch = try core.json("categoryMath", "categoryPatch", [category, values])
                if patch.isNull {
                    message = core.text("categories:toasts.nothingToSave")
                    return true
                }
                let fields = try core.json("categoryName", "categoryUpdateRow", [patch])
                try await data.categories.updateCategory(id: id, fields: fields)
                message = core.text("categories:toasts.saved")
            } else {
                let row = try core.json("categoryName", "newCategoryRow", [values.with("kind", .string(kind))])
                try await data.categories.createCategory(row)
                message = core.text("categories:toasts.added", ["name": .string(name.trimmingCharacters(in: .whitespaces))])
            }
            return true
        } catch {
            message = UserMessage.of(error, core: core)
            return false
        }
    }

    /// Archive or unarchive (it stays on past entries, out of the pickers).
    @discardableResult
    func toggleArchive() async -> Bool {
        guard let category, let id = category["id"]?.stringValue else { return false }
        busy = true
        defer { busy = false }
        do {
            let fields = try core.json("categoryName", "categoryUpdateRow", [["is_archived": .bool(!archived)] as JSONValue])
            try await data.categories.updateCategory(id: id, fields: fields)
            return true
        } catch {
            message = UserMessage.of(error, fallback: core.text("categories:toasts.notUpdated"), core: core)
            return false
        }
    }
}

/// categoryStyle.categoryPicker: the icon groups (each icon named) and the colours.
struct CategoryPicker: Decodable, Equatable {
    struct Icon: Decodable, Equatable, Identifiable {
        let key: String
        let label: String
        var id: String { key }
    }
    struct IconGroup: Decodable, Equatable, Identifiable {
        let label: String
        let keys: [Icon]
        var id: String { label }
    }
    struct Colour: Decodable, Equatable, Identifiable {
        let key: String
        let hex: String
        let label: String
        var id: String { key }
    }
    let icons: [IconGroup]
    let colours: [Colour]
}
