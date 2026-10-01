// Settings › Import rules (the web's ImportRules): the "description contains
// → category" rules the import learns when you pick categories for new
// merchants. Each with its category, which way the money goes and when it
// was added (importRulesMath.ruleRows), searched and filtered by direction
// (filterRules), 15 to a page as on the web (paginate); a rule's page
// changes its text and category (ImportRuleEditor), Delete asks first. The
// reads and writes are the web's (importRules.js); every rule is the core's.
import Foundation
import Observation
import BudgeerCore

/// One rule as the list shows it.
struct ImportRuleItem: Identifiable, Equatable {
    let id: String
    let pattern: String
    /// "Groceries · Money out · Added 1 Sep".
    let meta: String
    let look: CategoryLook
}

@MainActor
@Observable
final class ImportRulesModel {
    enum State: Equatable {
        case loading
        case loaded
        case failed(String)
    }

    /// The web's PAGE_SIZE.
    static let pageSize = 15

    private(set) var state: State = .loading
    private(set) var query = ""
    /// 'all', 'expense' or 'income' (importRulesMath.RULE_FILTERS).
    private(set) var filter = "all"
    private(set) var page = 1
    /// What the last action said (saved, deleted, a refusal).
    var notice: ImportNotice?
    /// The rule whose delete is being confirmed.
    var deleting: ImportRuleItem?
    private(set) var busy = false

    private var rules: JSONValue = []
    private var categories: JSONValue = []
    /// ruleRows: the rules with their category, direction and day added.
    private var rows: JSONValue = []

    private let data: DataLayer
    private let core: BudgeerCore

    init(data: DataLayer, core: BudgeerCore = .shared) {
        self.data = data
        self.core = core
    }

    func load() async {
        do {
            rules = try await data.imports.importRules()
            categories = try await data.categories.allCategories()
            rows = try core.json("importRulesMath", "ruleRows", [rules, categories])
            state = .loaded
        } catch {
            if case .loaded = state { return }
            state = .failed(UserMessage.of(error, core: core))
        }
    }

    /// The filter's choices: (value, label) — All, Money out, Money in.
    var filters: [(value: String, label: String)] {
        ((try? core.json("importRulesMath", "RULE_FILTERS", []))?.arrayValue ?? []).compactMap { pair in
            guard let items = pair.arrayValue, items.count == 2, let value = items[0].stringValue,
                  let key = items[1].stringValue else { return nil }
            return (value, core.text("import:\(key)"))
        }
    }

    var isEmpty: Bool { (rows.arrayValue ?? []).isEmpty }
    /// "12 rules", or nil with none.
    var countLabel: String? {
        let count = rows.arrayValue?.count ?? 0
        return count > 0 ? core.text("import:rules.count", ["count": .int(count)]) : nil
    }

    func setQuery(_ text: String) {
        query = text
        page = 1
    }

    func setFilter(_ value: String) {
        filter = value
        page = 1
    }

    /// The rows the search and the direction keep.
    private var shown: JSONValue {
        (try? core.json("importRulesMath", "filterRules", [rows, ["query": .string(query), "filter": .string(filter)] as JSONValue]))
            ?? []
    }

    var noMatch: Bool { !isEmpty && (shown.arrayValue ?? []).isEmpty }

    /// How many pages (paginate.pageCount), and this page's rows.
    var pages: Int {
        (try? core.call("paginate", "pageCount", [shown.arrayValue?.count ?? 0, ImportRulesModel.pageSize])) ?? 1
    }

    var items: [ImportRuleItem] {
        let current = min(page, pages)
        let slice = (try? core.json("paginate", "pageSlice", [shown, current, ImportRulesModel.pageSize]))?.arrayValue ?? []
        return slice.compactMap(rowItem)
    }

    /// "1 of 3" (common:paginator.position).
    var position: String {
        core.text("common:paginator.position", ["page": .int(min(page, pages)), "pages": .int(pages)])
    }

    func step(_ by: Int) {
        page = max(1, min(pages, min(page, pages) + by))
    }

    private func rowItem(_ row: JSONValue) -> ImportRuleItem? {
        guard let id = row["id"]?.stringValue, let pattern = row["pattern"]?.stringValue else { return nil }
        let category = row["category"] ?? .null
        let kind = row["kind"]?.stringValue
        var parts: [String] = [
            category.isNull ? core.text("import:rules.unknownCategory")
                : (try? core.call("categoryName", "categoryDisplayName", [category])) ?? "",
        ]
        if let kind { parts.append((try? core.call("importRulesMath", "directionLabel", [kind])) ?? "") }
        if let day = row["addedOn"]?.stringValue {
            let date: String = (try? core.call("dates", "shortDate", [day])) ?? day
            parts.append(core.text("import:rules.added", ["date": .string(date)]))
        }
        return ImportRuleItem(id: id, pattern: pattern, meta: parts.joined(separator: " · "),
                              look: (try? CategoryLook.of(category.isNull ? nil : category, kind: kind, core: core))
                                  ?? CategoryLook(key: "other", tone: "accent", tint: nil))
    }

    /// One rule as the list shows it, whatever the search and page.
    func item(id: String) -> ImportRuleItem? {
        rows.arrayValue?.first(where: { $0["id"]?.stringValue == id }).flatMap(rowItem)
    }

    /// A rule's editor.
    func editor(id: String) -> ImportRuleEditor? {
        guard let row = rows.arrayValue?.first(where: { $0["id"]?.stringValue == id }) else { return nil }
        return ImportRuleEditor(rule: row, rules: rows, categories: categories, data: data, core: core)
    }

    // MARK: Delete

    /// Delete "LIDL"? (import:rules.remove.title)
    func deleteTitle(_ item: ImportRuleItem) -> String {
        core.text("import:rules.remove.title", ["pattern": .string(item.pattern)])
    }

    @discardableResult
    func confirmDelete() async -> Bool {
        guard let item = deleting else { return false }
        busy = true
        defer { busy = false }
        do {
            try await data.imports.deleteImportRule(id: item.id)
            deleting = nil
            notice = ImportNotice(title: core.text("import:rules.deleted"))
            await load()
            return true
        } catch {
            deleting = nil
            notice = ImportNotice(title: UserMessage.of(error, core: core), warning: true)
            return false
        }
    }

    /// A rule's page saved: say so over the list.
    func saved() async {
        notice = ImportNotice(title: core.text("import:rules.saved"))
        await load()
    }
}

/// A rule's page (the web's EditRuleModal): its text and category.
@MainActor
@Observable
final class ImportRuleEditor {
    let id: String
    /// The text as saved.
    let original: String
    var pattern: String
    var categoryId: String
    /// The text field was left or Save tapped: its problem shows from now on.
    var touched = false
    private(set) var busy = false
    private(set) var failed: String?

    private let rules: JSONValue
    private let categories: JSONValue
    private let data: DataLayer
    private let core: BudgeerCore

    init(rule: JSONValue, rules: JSONValue, categories: JSONValue, data: DataLayer, core: BudgeerCore = .shared) {
        id = rule["id"]?.stringValue ?? ""
        original = rule["pattern"]?.stringValue ?? ""
        pattern = original
        categoryId = rule["category_id"]?.stringValue ?? ""
        self.rules = rules
        self.categories = categories
        self.data = data
        self.core = core
    }

    /// importRulesMath.PATTERN_MAX: the most the field takes.
    var maxLength: Int { (try? core.call("importRulesMath", "PATTERN_MAX", [])) ?? Int.max }

    func setPattern(_ text: String) {
        pattern = String(text.prefix(maxLength))
        failed = nil
    }

    /// Too short, too long, or another rule's text; nil when it can be saved.
    var problem: String? {
        (try? core.json("importRulesMath", "patternProblem", [JSONValue.string(pattern), rules, JSONValue.string(id)]))?.stringValue
    }

    /// The problem to show (once touched).
    var shownProblem: String? { touched ? (failed ?? problem) : failed }

    /// "Only future imports use the new text" once the text changed.
    var textChanged: Bool {
        let clean: String = (try? core.call("importRulesMath", "cleanPattern", [pattern])) ?? pattern
        return clean != original
    }

    /// The categories it can move to, by direction (ruleTargets): a group's label and its (id, name).
    var groups: [(kind: String, label: String, categories: [(id: String, name: String)])] {
        ((try? core.json("importRulesMath", "ruleTargets", [categories, JSONValue.string(categoryId)]))?.arrayValue ?? [])
            .compactMap { group in
                guard let kind = group["kind"]?.stringValue else { return nil }
                let list: [(id: String, name: String)] = (group["categories"]?.arrayValue ?? []).compactMap { category in
                    guard let id = category["id"]?.stringValue else { return nil }
                    return (id, (try? core.call("categoryName", "categoryDisplayName", [category])) ?? "")
                }
                return (kind, group["label"]?.stringValue ?? "", list)
            }
    }

    /// Save the text and the category; true once saved.
    func save() async -> Bool {
        touched = true
        guard problem == nil, !categoryId.isEmpty else { return false }
        busy = true
        defer { busy = false }
        do {
            let clean: String = try core.call("importRulesMath", "cleanPattern", [pattern])
            try await data.imports.updateImportRule(id: id, pattern: clean, categoryId: categoryId)
            failed = nil
            return true
        } catch let error as ServerError where error.code == "23505" {
            // The table is unique per user and text: the refusal worth its own words.
            failed = core.text("import:rules.errors.taken")
            return false
        } catch {
            failed = UserMessage.of(error, core: core)
            return false
        }
    }
}
