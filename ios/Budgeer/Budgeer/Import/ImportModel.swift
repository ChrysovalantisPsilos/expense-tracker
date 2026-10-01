// Import a bank statement (the web's ImportExpenses), step by step:
//   upload  pick a CSV/TSV/TXT/XLSX/XLS file; it's read on this phone (the
//           core's sheetRead, SheetJS for workbooks), nothing is uploaded
//   map     the layout detected (a bank, a remembered layout, or the columns
//           guessed), the columns to adjust, your name for own transfers,
//           and a live preview of the rows as they'll be saved
//   rates   the exchange rates the ECB couldn't give, typed in
//   review  a category for each new merchant (the AI's ideas when that
//           helper is on), each remembered as an import rule
//   done    what was imported, skipped and left out
// Every rule is the web's pure code through the core (statementDetect,
// statementRows, importMath, importText, aiMath); the rows already in the
// ledger are left out (dropKnownRows) and the server skips any it knows by
// id. The confirmed layout and your name are kept on this phone under the
// web's own storage keys.
import Foundation
import Observation
import BudgeerCore

/// A short message over the page (the web's toasts): a title, maybe a line under it.
struct ImportNotice: Equatable {
    let title: String
    var text: String? = nil
    var warning = false
}

/// One preview row as it'll be saved.
struct ImportPreviewRow: Identifiable, Equatable {
    let id: Int
    let title: String
    let meta: String
    let amount: String
    let income: Bool
    let look: CategoryLook
}

/// A new merchant (or payer) on the review step.
struct ImportMerchant: Identifiable, Equatable {
    let id: String
    let pattern: String
    let kind: String
    /// "3 rows · money out".
    let meta: String
}

/// The done step's words (importText.doneText).
struct ImportDone: Equatable {
    let title: String
    let dated: String?
    let notes: [String]
    /// The imported entries' first and last day, for "View transactions".
    let from: String?
    let to: String?
}

@MainActor
@Observable
final class ImportModel {
    enum Step: Equatable { case upload, map, rates, review, done }
    /// The category ideas (ai.useCategoryIdeas' status).
    enum Ideas: Equatable { case idle, working, done, failed }

    /// The web's STORAGE_KEYS.importMappings and .importHolder: this phone's
    /// confirmed layouts and the holder's name.
    static let mappingsKey = "budgeer:import-mappings:v1"
    static let holderKey = "budgeer:import-holder:v1"

    private(set) var step: Step = .upload
    private(set) var fileName = ""
    private(set) var headers: [String] = []
    private(set) var mapping: JSONValue = [:]
    private(set) var detection: JSONValue = .null
    var showMapping = false
    private(set) var reading = false
    private(set) var busy = false
    var notice: ImportNotice?
    private(set) var preview: JSONValue = .null
    private(set) var previewRows: [ImportPreviewRow] = []
    // The review step.
    private(set) var merchants: [ImportMerchant] = []
    private(set) var assign: [String: String] = [:]
    private(set) var ideas: Ideas = .idle
    private(set) var suggested: [String: String] = [:]
    // The rates step.
    private(set) var missingRates: [(currency: String, count: Int)] = []
    private(set) var rateInput: [String: String] = [:]
    private(set) var done: ImportDone?

    private var rows: JSONValue = []
    private var lines: JSONValue = []
    private var profile: JSONValue = [:]
    /// The active categories of both kinds (useCategories): the file's
    /// category column and the rules file rows into them.
    private var categories: JSONValue = []
    private var rules: JSONValue = []
    /// statementRows' answer while the review is open: { valid, merchants, errors, skipped }.
    private var pending: JSONValue = .null
    private var groups: JSONValue = []
    /// Bumped by every new file, so a late answer about an old one is dropped.
    private var reads = 0

    private let data: DataLayer
    private let userId: String
    private let core: BudgeerCore
    private let defaults: UserDefaults
    private let now: @Sendable () -> Date

    init(data: DataLayer, userId: String, core: BudgeerCore = .shared, defaults: UserDefaults = .standard,
         now: @escaping @Sendable () -> Date = { Date() }) {
        self.data = data
        self.userId = userId
        self.core = core
        self.defaults = defaults
        self.now = now
    }

    var baseCurrency: String { profile["base_currency"]?.stringValue ?? "EUR" }
    /// Category ideas on import (Settings › AI helpers).
    var ideasOn: Bool { (try? core.json("aiMath", "helpersOn", [profile]))?["importCategories"]?.boolValue == true }

    /// The profile, the categories and the saved rules: what the preview
    /// files rows with. Read one after another; a failed read leaves the
    /// preview without them.
    func load() async {
        if let read = try? await data.profile.profile() { profile = read }
        if let read = try? await data.categories.categories(kind: nil) { categories = read }
        if let read = try? await data.imports.importRules() { rules = read }
        refreshPreview()
    }

    // MARK: Upload

    /// The upload step's longer note (the banks recognised, what's left out).
    var uploadMore: String { (try? core.call("importText", "uploadMore", [])) ?? "" }

    /// A file picked in Files: read on this phone.
    func read(url: URL) async {
        let scoped = url.startAccessingSecurityScopedResource()
        defer { if scoped { url.stopAccessingSecurityScopedResource() } }
        let size = (try? url.resourceValues(forKeys: [.fileSizeKey]).fileSize) ?? 0
        if let problem = fileProblem(name: url.lastPathComponent, size: size) {
            notice = ImportNotice(title: core.text("import:toasts.unreadable"), text: problem, warning: true)
            return
        }
        do {
            await read(data: try Data(contentsOf: url), name: url.lastPathComponent)
        } catch {
            notice = ImportNotice(title: core.text("import:toasts.unreadable"),
                                  text: UserMessage.of(error, fallback: core.text("import:errors.unreadableShort"), core: core),
                                  warning: true)
        }
    }

    /// importText.fileProblem: too big, or a Numbers document; nil when it can be read.
    private func fileProblem(name: String, size: Int) -> String? {
        let file: JSONValue = ["name": .string(name), "size": .int(size)]
        return (try? core.json("importText", "fileProblem", [file]))?.stringValue
    }

    /// The file's bytes → its table, the layout and the preview
    /// (importExpenses.parseWorkbook's steps).
    func read(data bytes: Data, name: String) async {
        if let problem = fileProblem(name: name, size: bytes.count) {
            notice = ImportNotice(title: core.text("import:toasts.unreadable"), text: problem, warning: true)
            return
        }
        reads += 1
        let ask = reads
        reading = true
        defer { if ask == reads { reading = false } }
        do {
            let engine = core
            let table: JSONValue = try await Task.detached { try engine.callBytes("sheetRead", "readStatement", bytes: bytes) }.value
            guard ask == reads else { return }
            guard table["ok"]?.boolValue == true else {
                let key = table["key"]?.stringValue
                notice = ImportNotice(title: core.text("import:toasts.unreadable"),
                                      text: try core.call("importText", "readProblem", [key.json]), warning: true)
                return
            }
            let headerRow = table["headers"] ?? []
            let objects = try core.json("sheetParse", "rowsToObjects", [headerRow, table["rows"] ?? []])
            guard let count = objects.arrayValue?.count, count > 0 else {
                notice = ImportNotice(title: core.text("import:toasts.noRows"), warning: true)
                return
            }
            let found = try core.json("statementDetect", "detectStatement", [headerRow, objects, rememberedMappings()])
            let holder: String = try core.call("importMath", "suggestedHolder", [
                JSONValue.string(rememberedHolder()), profile["display_name"] ?? .null,
            ])
            fileName = name
            headers = headerRow.arrayValue?.compactMap(\.stringValue) ?? []
            rows = objects
            lines = table["lines"] ?? []
            detection = found
            // Files without a holder column (Revolut's) use the name the user gives.
            mapping = (found["mapping"] ?? [:]).with("holderName", .string(holder))
            // Sure enough → straight to the preview; otherwise ask for the columns.
            showMapping = (try? core.call("statementDetect", "mappingUnsure", [found])) ?? true
            notice = nil
            refreshPreview()
            step = .map
        } catch {
            guard ask == reads else { return }
            notice = ImportNotice(title: core.text("import:toasts.unreadable"),
                                  text: UserMessage.of(error, fallback: core.text("import:errors.unreadableShort"), core: core),
                                  warning: true)
        }
    }

    /// Back to the file picker ("Change file", "Import another").
    func startOver() {
        step = .upload
        done = nil
        pending = .null
        notice = nil
    }

    // MARK: Map

    /// "3 rows" (import:map.rows).
    var rowsLabel: String { core.text("import:map.rows", ["count": .int(rows.arrayValue?.count ?? 0)]) }
    /// The line about the layout: remembered, a bank, detected or unsure; then "Check the preview".
    var detectionText: String { (try? core.call("importText", "detectionText", [detection])) ?? "" }
    /// The file names the holder itself (a holder column): no name to type.
    var holderMapped: Bool { !(mapping["holder"]?.stringValue ?? "").isEmpty }
    var holderName: String { mapping["holderName"]?.stringValue ?? "" }
    var mappingComplete: Bool { (try? core.call("statementRows", "mappingComplete", [mapping])) ?? false }

    /// The mapping's fields in the web's order (statementDetect.IMPORT_FIELDS).
    var fields: [(key: String, required: Bool, hint: Bool)] {
        ((try? core.json("statementDetect", "IMPORT_FIELDS", []))?.arrayValue ?? []).compactMap { field in
            guard let key = field["key"]?.stringValue else { return nil }
            return (key, field["required"]?.boolValue == true, field["hint"]?.boolValue == true)
        }
    }
    var dateOrders: [String] { (try? core.call("statementDetect", "DATE_ORDERS", [])) ?? [] }
    var decimals: [(value: String, id: String)] {
        ((try? core.json("statementDetect", "DECIMALS", []))?.arrayValue ?? []).compactMap { option in
            guard let value = option["value"]?.stringValue, let id = option["id"]?.stringValue else { return nil }
            return (value, id)
        }
    }

    func column(_ key: String) -> String { mapping[key]?.stringValue ?? "" }

    /// A field mapped to a column ("" for none).
    func setColumn(_ key: String, _ header: String) {
        mapping = mapping.with(key, .string(header))
        refreshPreview()
    }

    func setHolderName(_ name: String) {
        mapping = mapping.with("holderName", .string(String(name.prefix(100))))
        refreshPreview()
    }

    /// The preview and its rows, after any change to the mapping.
    private func refreshPreview() {
        guard !(rows.arrayValue ?? []).isEmpty else { return }
        let instant = now()
        let extra: JSONValue = ["categories": categories, "rules": rules]
        guard let answer = try? core.json("statementRows", "statementPreview", [rows, mapping, JSONValue.string(baseCurrency), extra])
        else { return }
        preview = answer
        let byId = Dictionary((categories.arrayValue ?? []).compactMap { c in c["id"]?.stringValue.map { ($0, c) } },
                              uniquingKeysWith: { first, _ in first })
        previewRows = (answer["rows"]?.arrayValue ?? []).enumerated().compactMap { index, draft in
            let category = draft["category_id"]?.stringValue.flatMap { byId[$0] }
            guard let row = try? core.json("importText", "previewRow", [draft, category ?? .null, JSDate(instant)]) else { return nil }
            let kind = draft["kind"]?.stringValue ?? "expense"
            return ImportPreviewRow(id: index, title: row["title"]?.stringValue ?? "", meta: row["meta"]?.stringValue ?? "",
                                    amount: row["amount"]?.stringValue ?? "", income: row["income"]?.boolValue == true,
                                    look: (try? CategoryLook.of(category, kind: kind, core: core))
                                        ?? CategoryLook(key: "other", tone: "accent", tint: nil))
        }
    }

    /// How many rows are ready to import.
    var ready: Int { preview["ready"]?.intValue ?? 0 }
    /// The line under the preview (left out, can't be read), or nil.
    var previewNote: String? { (try? core.json("importText", "previewNote", [preview, lines]))?.stringValue }

    // MARK: Import

    /// Build the rows (saved rules sort known merchants), then import at
    /// once or stop at the rates or review step. `manualRates` fills in the
    /// currencies the ECB couldn't give (never 1:1).
    func prepare(manualRates: JSONValue = [:]) async {
        guard mappingComplete else {
            notice = ImportNotice(title: core.text("import:toasts.mapFirst"), warning: true)
            return
        }
        rememberMapping()
        rememberHolder()
        busy = true
        defer { busy = false }
        do {
            let savedRules = (try? await data.imports.importRules()) ?? rules
            let base = JSONValue.string(baseCurrency)
            let spans = try core.json("statementRows", "rateSpans", [rows, mapping, base])
            let series = await FxRates.seriesMap(spans, to: baseCurrency, fx: data.fx)
            let input: JSONValue = [
                "rows": rows, "mapping": mapping, "userId": .string(userId), "baseCurrency": base,
                "categories": categories, "rules": savedRules, "manualRates": manualRates, "lines": lines,
                "seriesByCurrency": series,
            ]
            let engine = core
            let built: JSONValue = try await Task.detached { try engine.json("statementRows", "statementRows", [input]) }.value
            let missing = built["missingRates"]?.arrayValue ?? []
            if !missing.isEmpty {
                missingRates = missing.compactMap { item in
                    guard let currency = item["currency"]?.stringValue, let count = item["count"]?.intValue else { return nil }
                    return (currency, count)
                }
                step = .rates
                return
            }
            guard let valid = built["valid"], !(valid.arrayValue ?? []).isEmpty else {
                notice = ImportNotice(title: core.text("import:toasts.nothing"), text: core.text("import:toasts.nothingText"),
                                      warning: true)
                return
            }
            let found = try core.json("importMath", "merchantGroups", [valid, built["merchants"] ?? .null])
            notice = nil
            if (found.arrayValue ?? []).isEmpty {
                await finish(built: built, groups: [], assignments: [:])
                return
            }
            pending = built
            groups = found
            assign = [:]
            suggested = [:]
            merchants = (found.arrayValue ?? []).compactMap { group in
                guard let id = group["id"]?.stringValue, let pattern = group["pattern"]?.stringValue else { return nil }
                let kind = group["kind"]?.stringValue ?? "expense"
                let count = core.text("import:map.rows", ["count": group["count"] ?? 0])
                let way = core.text(kind == "income" ? "import:review.moneyIn" : "import:review.moneyOut")
                return ImportMerchant(id: id, pattern: pattern, kind: kind, meta: "\(count) · \(way)")
            }
            step = .review
            await askIdeas()
        } catch {
            notice = ImportNotice(title: core.text("import:toasts.failed"), text: UserMessage.of(error, core: core), warning: true)
        }
    }

    // MARK: Rates

    /// "1 USD = ? EUR · 3 rows".
    func rateLabel(_ currency: String, count: Int) -> String {
        core.text("import:rates.rate", ["currency": .string(currency), "base": .string(baseCurrency)])
            + " · " + core.text("import:map.rows", ["count": .int(count)])
    }

    func setRate(_ currency: String, _ text: String) { rateInput[currency] = text }

    /// currency.parseManualRate of what was typed, nil until it's a rate.
    private func typedRate(_ currency: String) -> JSONValue? {
        guard let answer = try? core.json("currency", "parseManualRate", [rateInput[currency] ?? ""]), !answer.isNull,
              answer.doubleValue != nil else { return nil }
        return answer
    }

    var ratesReady: Bool { missingRates.allSatisfy { typedRate($0.currency) != nil } }

    func continueWithRates() async {
        var rates: [String: JSONValue] = [:]
        for item in missingRates {
            guard let rate = typedRate(item.currency) else { return }
            rates[item.currency] = rate
        }
        await prepare(manualRates: .object(rates))
    }

    func backToMap() {
        pending = .null
        step = .map
    }

    // MARK: Review

    /// The categories a merchant of `kind` can get: the active ones (A–Z by the name shown).
    func choices(_ kind: String) -> [(id: String, name: String)] {
        (categories.arrayValue ?? []).compactMap { category in
            guard category["kind"]?.stringValue == kind, category["is_archived"]?.boolValue != true,
                  let id = category["id"]?.stringValue else { return nil }
            return (id, (try? core.call("categoryName", "categoryDisplayName", [category])) ?? "")
        }
    }

    func choose(_ merchantId: String, _ categoryId: String) { assign[merchantId] = categoryId }

    /// The choice is still the AI's suggestion (aiMath.isSuggested).
    func isSuggested(_ merchantId: String) -> Bool {
        (try? core.call("aiMath", "isSuggested", [JSONValue.from(suggested), JSONValue.from(assign), JSONValue.string(merchantId)]))
            ?? false
    }

    /// The ideas' line: finding them, how many got one, or none this time.
    var ideasNote: String? {
        switch ideas {
        case .idle: return nil
        case .working: return core.text("ai:import.working")
        case .failed: return core.text("ai:import.none")
        case .done:
            if suggested.isEmpty { return core.text("ai:import.none") }
            return core.text("ai:import.some", ["count": .int(suggested.count), "total": .int(merchants.count)])
        }
    }

    /// The AI's category ideas for the new merchants (ai.useCategoryIdeas):
    /// they fill the merchants not picked yet, and stay marked until changed.
    private func askIdeas() async {
        guard ideasOn, !(groups.arrayValue ?? []).isEmpty else { ideas = .idle; return }
        let asked = groups
        ideas = .working
        do {
            let request = try core.json("aiMath", "suggestionRequest", [asked])
            let labels = try core.json("aiMath", "categoryLabels", [categories])
            let suggestions = try await data.imports.suggestCategories(merchants: request["merchants"] ?? [], labels: labels)
            guard asked == groups, step == .review else { return } // another statement since
            let ids = request["ids"] ?? []
            let picked = try core.json("aiMath", "applySuggestions", [JSONValue.from(assign), ids, suggestions])
            suggested = (try? picked["suggested"]?.decode([String: String].self)) ?? [:]
            assign = (try? picked["assign"]?.decode([String: String].self)) ?? assign
            ideas = .done
        } catch {
            if asked == groups { ideas = .failed }
        }
    }

    /// "Import 12 rows" on the review step.
    var reviewCount: Int { pending["valid"]?.arrayValue?.count ?? 0 }

    func importReviewed() async {
        guard !pending.isNull else { return }
        await finish(built: pending, groups: groups, assignments: (try? JSONValue.from(assign)) ?? [:])
    }

    /// The review's choices as rows and rules, then the save (importNewTransactions)
    /// and what the done step says.
    private func finish(built: JSONValue, groups: JSONValue, assignments: JSONValue) async {
        busy = true
        defer { busy = false }
        do {
            let review = try core.json("statementRows", "applyReview", [
                built["valid"] ?? [], built["merchants"] ?? .null, groups, assignments,
            ])
            for rule in review["rules"]?.arrayValue ?? [] {
                guard let pattern = rule["pattern"]?.stringValue, let categoryId = rule["category_id"]?.stringValue else { continue }
                try? await data.imports.saveImportRule(pattern: pattern, categoryId: categoryId) // a bonus, not a blocker
            }
            let toSave = review["rows"] ?? []
            let saved = try await save(toSave)
            let summary = try core.json("statementRows", "importSummary", [saved, [
                "errors": built["errors"] ?? [], "skipped": built["skipped"] ?? [], "rows": toSave,
            ] as JSONValue])
            let words = try core.json("importText", "doneText", [summary, JSDate(now())])
            done = ImportDone(title: words["title"]?.stringValue ?? "", dated: words["dated"]?.stringValue,
                              notes: words["notes"]?.arrayValue?.compactMap(\.stringValue) ?? [],
                              from: summary["range"]?["from"]?.stringValue, to: summary["range"]?["to"]?.stringValue)
            pending = .null
            notice = nil
            step = .done
        } catch {
            notice = ImportNotice(title: core.text("import:toasts.failed"), text: UserMessage.of(error, core: core), warning: true)
        }
    }

    /// importNewTransactions: the rows the ledger already holds left out
    /// (dropKnownRows over the file's dates), the rest saved in chunks, the
    /// server skipping any it knows by id. { inserted, duplicates }.
    private func save(_ rows: JSONValue) async throws -> JSONValue {
        guard let all = rows.arrayValue, !all.isEmpty else { return ["inserted": 0, "duplicates": 0] }
        let range = try core.json("importMath", "importedRange", [rows])
        let existing = try await data.transactions.transactions(TxnQuery(from: range["from"]?.stringValue,
                                                                           to: range["to"]?.stringValue))
        let dropped = try core.json("importMath", "dropKnownRows", [rows, existing])
        let fresh = dropped["rows"]?.arrayValue ?? []
        let chunk: Int = try core.call("statementRows", "SAVE_CHUNK", [])
        var inserted = 0
        var start = 0
        while start < fresh.count {
            let part = Array(fresh[start..<min(start + chunk, fresh.count)])
            inserted += try await data.imports.saveTransactions(.array(part))
            start += chunk
        }
        let known = dropped["known"]?.intValue ?? 0
        return ["inserted": .int(inserted), "duplicates": .int(fresh.count - inserted + known)]
    }

    // MARK: This phone's memory (the web's localStorage)

    private func rememberedMappings() -> JSONValue {
        guard let text = defaults.string(forKey: ImportModel.mappingsKey), let stored = try? JSONValue.parse(text) else {
            return [:]
        }
        return stored
    }

    private func rememberMapping() {
        guard let next = try? core.json("statementDetect", "rememberedWith", [rememberedMappings(), JSONValue.from(headers), mapping]),
              let data = try? JSONEncoder().encode(next) else { return }
        defaults.set(String(decoding: data, as: UTF8.self), forKey: ImportModel.mappingsKey)
    }

    private func rememberedHolder() -> String {
        (try? core.call("importMath", "cleanHolderName", [defaults.string(forKey: ImportModel.holderKey).json])) ?? ""
    }

    /// The file's holder column's name, else the one typed.
    private func rememberHolder() {
        let fromFile: String = (try? core.call("importMath", "fileHolder", [rows, mapping])) ?? ""
        let name: String = (try? core.call("importMath", "cleanHolderName", [JSONValue.string(fromFile.isEmpty ? holderName : fromFile)])) ?? ""
        if !name.isEmpty { defaults.set(name, forKey: ImportModel.holderKey) }
    }
}
