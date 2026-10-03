// Plan mode's state, after the web's Plan.jsx and plan.js: the reads (the
// profile, the saved plan with the last apply, the rules, the categories,
// the income behind the derived rows, the charges and budgets the ideas look
// at, today's rates), one after another; then the figures from the core
// (PlanFigures). The plan is read from the server once; after that the
// page's copy is the truth and every edit is saved a moment later (as the
// web's debounced save), and at once when the page goes. Every edit is a
// core call (planPage's editItem, toggleItem, dropItem, tryIdeaWith, planMath's
// upsertAdd, dismissIdea, startOver); one editor is open at a time (`open`:
// a row's id, "changes-<id>" for its change, "new" for "What if I add…", an
// overlap idea's id for its picker). Apply sends applySelection's changes
// (apply_recurring_plan) and Undo takes the last apply back.
import Foundation
import Observation
import BudgeerCore

@MainActor
@Observable
final class PlanModel {
    enum State: Equatable {
        case loading
        case loaded(PlanPage)
        case failed(String)
    }

    /// Where the plan's copy on the server stands: 'saved', 'saving' or 'error'.
    enum SaveStatus: String { case saved, saving, error }

    /// "Type a what-if": nothing yet, asking, the preview, added (with Undo), or why not.
    enum WhatIfState: Equatable {
        case idle
        case working
        case preview
        case added(Int)
        case failed(String)
    }

    private(set) var state: State = .loading
    /// 'month' or 'year'.
    private(set) var view = "month"
    private(set) var saveStatus = SaveStatus.saved
    /// The one editor open in place (nil: none).
    private(set) var open: String?
    /// The open row's editor, its amount as typed.
    private(set) var editor: PlanEditor?
    private(set) var editText = ""
    /// "What if I add…": the form's draft and parts.
    private(set) var addForm: PlanAddForm?
    private(set) var draft: JSONValue = [:]
    /// The overlap picker's ticks and parts.
    private(set) var pick: PlanPick?
    private var picked: [String] = []
    /// The Apply sheet (nil: closed) and what's unticked on it.
    private(set) var applySheet: PlanApply?
    private var applyOff: [String] = []
    /// What the last action said (applied, undone, or why it failed).
    private(set) var message: String?
    private(set) var warning = false
    private(set) var busy = false
    /// Whether "Type a what-if" is offered (Settings › AI helpers).
    private(set) var whatIfOn = false
    var whatIfText = ""
    private(set) var whatIf = WhatIfState.idle
    private(set) var whatIfPreview: PlanWhatIf?
    /// The proposal being edited, its editor and its amount as typed.
    private(set) var whatIfEditing: String?
    private(set) var whatIfEditor: PlanWhatIfEditor?
    private(set) var whatIfEditText = ""
    /// The shared demo login (its note under the what-if box).
    private(set) var isDemo = false

    private var figures: PlanFigures?
    private var plan: JSONValue?
    private var undo: JSONValue = .null
    private var profile: JSONValue = [:]
    private var rules: JSONValue = []
    private var categories: JSONValue = []
    private var savingsCategories: JSONValue = []
    private var income: JSONValue = []
    private var charges: JSONValue = []
    private var budgetSets: JSONValue = []
    private var rates: JSONValue = [:]
    private var whatIfRows: JSONValue = []
    private var whatIfPicked: [String] = []
    private var whatIfNotFound: JSONValue = []
    private var whatIfUndo: JSONValue = .null
    private var dirty = false
    private var saveTask: Task<Void, Never>?

    private let data: DataLayer
    private let core: BudgeerCore
    private let now: @Sendable () -> Date
    private let saveDelay: UInt64

    /// `saveDelayMs`: how long after the last edit the plan is saved (the web's 800 ms).
    init(data: DataLayer, core: BudgeerCore = .shared, now: @escaping @Sendable () -> Date = { Date() },
         saveDelayMs: UInt64 = 800) {
        self.data = data
        self.core = core
        self.now = now
        saveDelay = saveDelayMs * 1_000_000
    }

    var page: PlanPage? {
        if case .loaded(let page) = state { return page }
        return nil
    }

    private var base: String { profile["base_currency"]?.stringValue ?? "EUR" }

    // MARK: Reading

    /// Every read, one after another; the saved plan only the first time
    /// (after that the page's copy is the truth). The charges and budgets
    /// behind the ideas are optional: without them the page has no ideas.
    func load() async {
        do {
            let instant = now()
            profile = try await data.profile.profile()
            whatIfOn = profile["ai_plan_whatif"]?.boolValue == true
            isDemo = profile["is_demo"]?.boolValue == true
            let saved = try await data.plan.recurringPlan()
            undo = saved["undo"] ?? .null
            if plan == nil { plan = try core.json("planMath", "normalisePlan", [saved["plan"] ?? .null]) }
            rules = try await data.recurring.rules()
            savingsCategories = try await data.categories.savingsCategories()
            categories = try await data.categories.allCategories()
            let today = try core.isoDate(instant)
            let reads = try PlanFigures.reads(profile: profile, now: instant, core: core)
            let span = reads["income"]
            let incomeRead = try await data.transactions.transactions(TxnQuery(
                kind: "income", from: span?["from"]?.stringValue, to: span?["to"]?.stringValue))
            income = try await FxRates.fillPending(incomeRead, base: base, today: today, fx: data.fx, core: core)
            charges = (try? await readCharges(reads, today: today)) ?? []
            budgetSets = (try? await readBudgets(reads)) ?? []
            try await readRates()
            try refigure()
        } catch {
            if case .loaded = state { return } // a failed refresh keeps the page
            state = .failed(String(describing: error))
        }
    }

    /// The expenses the price rises look at (yearly ones spread).
    private func readCharges(_ reads: JSONValue, today: String) async throws -> JSONValue {
        let span = reads["charges"]
        let rows = try await data.transactions.transactions(TxnQuery(
            kind: "expense", from: span?["from"]?.stringValue, to: span?["to"]?.stringValue, spread: true))
        return try await FxRates.fillPending(rows, base: base, today: today, fx: data.fx, core: core)
    }

    /// The budget months' sets (useBudgetSets: each month with a budget from the first one's caps on).
    private func readBudgets(_ reads: JSONValue) async throws -> JSONValue {
        let periods = try PlanFigures.budgetPeriods(try await data.budgets.budgetPeriods(), reads: reads, core: core)
        var sets: [JSONValue] = []
        for period in periods {
            sets.append(["period": .string(period), "rows": try await data.budgets.budgets(period: period)])
        }
        return .array(sets)
    }

    /// Today's rate of each foreign currency the rules and the plan use (rateNeeds).
    private func readRates() async throws {
        let needs = try core.json("planMath", "rateNeeds", [rules, plan ?? .null])
        rates = try await FxRates.latest(for: needs, base: base, fx: data.fx, core: core)
    }

    private func refigure() throws {
        guard let plan else { return }
        let instant = now()
        let figures = try PlanFigures.compute(profile: profile, rules: rules, plan: plan, undo: undo, categories: categories,
                                              savingsCategories: savingsCategories, income: income, charges: charges,
                                              budgetSets: budgetSets, rates: rates, view: view, now: instant, core: core)
        self.figures = figures
        state = .loaded(figures.page)
        try refigureEditor()
        if applySheet != nil { applySheet = try figures.apply(off: applyOff, currency: base, now: instant, core: core) }
    }

    /// The open editor's parts, from the plan as it is now.
    private func refigureEditor() throws {
        editor = nil
        addForm = nil
        pick = nil
        guard let figures, let open else { return }
        let id = open.hasPrefix("changes-") ? String(open.dropFirst("changes-".count)) : open
        if open == "new" || figures.item(id)?["added"]?.boolValue == true {
            addForm = try core.call("planPage", "addFormParts", [draft, [
                "categories": categories, "currency": .string(base), "rates": rates, "editing": .bool(open != "new"),
            ] as JSONValue])
        } else if let item = figures.item(id) {
            editor = try core.call("planPage", "editorParts", [item, figures.signal(id) ?? .null, JSONValue.string(base),
                                                             JSDate(now())])
        } else if let card = figures.page.ideas.cards.first(where: { $0.id == open && $0.action == "pick" }) {
            pick = try core.call("planPage", "pickParts", [figures.state["items"] ?? [], card.idea,
                                                          JSONValue.array(picked.map { .string($0) }), JSONValue.string(base)])
        }
    }

    // MARK: The view

    func setView(_ value: String) {
        view = value
        try? refigure()
    }

    // MARK: Editing the plan

    /// The plan after an edit: shown at once, saved a moment later.
    private func change(_ edit: (JSONValue) throws -> JSONValue) {
        guard let plan, let next = try? edit(plan) else { return }
        self.plan = next
        dirty = true
        try? refigure()
        scheduleSave()
    }

    private func item(_ id: String) -> JSONValue? { figures?.item(id) }

    /// A row's switch: keep it, or cancel (stop) it in the plan; an added one leaves.
    func toggle(_ id: String) {
        guard let item = item(id) else { return }
        change { try core.json("planPage", "toggleItem", [$0, item, rules]) }
    }

    /// "Undo this change" / "Remove".
    func drop(_ id: String) {
        guard let item = item(id) else { return }
        if open == id || open == "changes-\(id)" { close() }
        change { try core.json("planPage", "dropItem", [$0, item]) }
    }

    /// Open (or close, when it's open) an editor: a row's id, "changes-<id>", "new", or an overlap idea's id.
    func toggleOpen(_ key: String) {
        if open == key { close() } else { openEditor(key) }
    }

    func openEditor(_ key: String) {
        open = key
        picked = []
        let id = key.hasPrefix("changes-") ? String(key.dropFirst("changes-".count)) : key
        let add = item(id)?["add"]
        if key == "new" || add != nil {
            draft = (try? core.json("planPage", "addDraft", [add ?? .null, JSONValue.string(base),
                                                            JSONValue.string((try? core.isoDate(now())) ?? "")])) ?? [:]
        }
        try? refigureEditor()
        editText = editor?.text ?? ""
    }

    func close() {
        open = nil
        try? refigureEditor()
    }

    /// The open row's editor: the amount as typed (a positive one goes into the plan).
    func setAmount(_ text: String) {
        guard let editor, let id = openItemId else { return }
        editText = clean(text, editor.currency)
        guard let patch = try? core.json("planPage", "amountEdit", [editText, editor.currency]), !patch.isNull else { return }
        edit(id, patch)
    }

    /// How often: a choice (the rule's own "every N" picks nothing).
    func setFrequency(_ value: String) {
        guard let id = openItemId, let patch = try? core.json("planPage", "frequencyPick", [value]), !patch.isNull else { return }
        edit(id, patch)
    }

    /// Keep or cancel (stop) in the plan.
    func setCancelled(_ cancelled: Bool) {
        guard let id = openItemId else { return }
        edit(id, ["cancel": .bool(cancelled)])
    }

    /// Reset: the row goes back to the real payment.
    func reset() {
        guard let id = openItemId, let item = item(id) else { return }
        let text = editor?.resetText ?? ""
        change { try core.json("planPage", "dropItem", [$0, item]) }
        editText = text
    }

    private var openItemId: String? {
        guard let open else { return nil }
        return open.hasPrefix("changes-") ? String(open.dropFirst("changes-".count)) : open
    }

    private func edit(_ id: String, _ patch: JSONValue) {
        guard let item = item(id) else { return }
        change { try core.json("planPage", "editItem", [$0, item, rules, patch]) }
    }

    // MARK: What if I add…

    /// The form's fields: the kind (savings goes to the first savings category).
    func setAddKind(_ kind: String) {
        draft = (try? core.json("planPage", "addKind", [draft, JSONValue.string(kind), categories])) ?? draft
        try? refigureEditor()
    }

    func setAddName(_ name: String) { setDraft("name", .string(name)) }
    func setAddAmount(_ text: String) { setDraft("text", .string(clean(text, draft["currency"]?.stringValue ?? base))) }
    func setAddCurrency(_ currency: String) { setDraft("currency", .string(currency)) }
    func setAddStart(_ day: String) { setDraft("start", .string(day)) }
    func setAddCategory(_ id: String) { setDraft("categoryId", .string(id)) }

    func setAddFrequency(_ value: String) {
        guard let rule = try? core.json("planPage", "frequencyPick", [value]), !rule.isNull else { return }
        draft = draft.with("frequency", rule["frequency"] ?? .null).with("interval_n", rule["interval_n"] ?? .null)
        try? refigureEditor()
    }

    var addFields: JSONValue { draft }

    private func setDraft(_ key: String, _ value: JSONValue) {
        draft = draft.with(key, value)
        try? refigureEditor()
    }

    /// "Add to plan" / "Save": the form into the plan, then it closes.
    func saveAdd() {
        guard let open else { return }
        let id = open == "new" ? UUID().uuidString.lowercased() : (openItemId ?? "")
        guard let add = try? core.json("planPage", "addToSave", [draft, JSONValue.string(id)]), !add.isNull else { return }
        close()
        change { try core.json("planMath", "upsertAdd", [$0, add]) }
    }

    // MARK: Ideas

    /// "Try it": the overlap's picker, the payment's editor (to try a lower price), or cancelled in the plan.
    func tryIdea(_ card: PlanIdeaCard) {
        switch card.action {
        case "pick":
            toggleOpen(card.id)
        case "open":
            if let rule = card.idea["ruleIds"]?.arrayValue?.first?.stringValue { openEditor(rule) }
        default:
            change { try core.json("planPage", "tryIdeaWith", [$0, card.idea, rules]) }
        }
    }

    func dismiss(_ card: PlanIdeaCard) {
        change { try core.json("planMath", "dismissIdea", [$0, JSONValue.string(card.id)]) }
    }

    /// The picker's tick on a row.
    func togglePick(_ id: String) {
        if let index = picked.firstIndex(of: id) { picked.remove(at: index) } else { picked.append(id) }
        try? refigureEditor()
    }

    /// The picked ones cancelled in the plan, and the idea gone.
    func addPicked() {
        guard let pick, let open, let card = page?.ideas.cards.first(where: { $0.id == open }) else { return }
        let ids = JSONValue.array(pick.picked.map { .string($0) })
        close()
        change { try core.json("planPage", "tryIdeaWith", [$0, card.idea, rules, ids]) }
    }

    // MARK: Notices

    /// "OK" on "Your recurring changed since you planned".
    func acknowledge() {
        guard let figures else { return }
        let reads: JSONValue = ["rules": rules, "savingsIds": figures.savingsIds, "salary": figures.salary,
                                "savings": figures.savings]
        change { try core.json("planPage", "acknowledgePlan", [$0, reads]) }
    }

    /// "Clear plan" (after its question): every change and add leaves the plan.
    func clear() {
        close()
        change { try core.json("planMath", "startOver", [$0]) }
    }

    // MARK: Saving

    private func scheduleSave() {
        saveStatus = .saving
        saveTask?.cancel()
        let wait = saveDelay
        saveTask = Task { [weak self] in
            try? await Task.sleep(nanoseconds: wait)
            guard !Task.isCancelled else { return }
            await self?.save()
        }
    }

    /// Save the plan now (an empty one is removed); a failure says so, with Try again.
    func save() async {
        guard dirty, let plan else { return }
        dirty = false
        do {
            let empty: Bool = try core.call("planMath", "isEmptyPlan", [plan])
            try await data.plan.saveRecurringPlan(plan, empty: empty)
            if !dirty { saveStatus = .saved }
        } catch {
            dirty = true
            saveStatus = .error
        }
    }

    /// Leaving the page with an edit still waiting: save it now.
    func flush() async {
        saveTask?.cancel()
        await save()
    }

    /// After Start fresh: the server's plan is gone, so this copy is too.
    /// Nothing waiting is saved (it would bring the wiped plan back), every
    /// editor closes, and the next load reads the saved plan anew.
    func forget() {
        saveTask?.cancel()
        saveTask = nil
        dirty = false
        saveStatus = .saved
        plan = nil
        undo = .null
        figures = nil
        state = .loading
        open = nil
        editor = nil
        editText = ""
        addForm = nil
        draft = [:]
        pick = nil
        picked = []
        applySheet = nil
        applyOff = []
        message = nil
        warning = false
        whatIfText = ""
        whatIf = .idle
        whatIfPreview = nil
        whatIfEditing = nil
        whatIfEditor = nil
        whatIfEditText = ""
        whatIfRows = []
        whatIfPicked = []
        whatIfNotFound = []
        whatIfUndo = .null
    }

    // MARK: Apply and undo

    /// The Apply sheet, every change ticked.
    func openApply() {
        applyOff = []
        guard let figures else { return }
        applySheet = try? figures.apply(off: applyOff, currency: base, now: now(), core: core)
    }

    func closeApply() {
        applySheet = nil
    }

    func toggleApply(_ id: String) {
        if let index = applyOff.firstIndex(of: id) { applyOff.remove(at: index) } else { applyOff.append(id) }
        if let figures { applySheet = try? figures.apply(off: applyOff, currency: base, now: now(), core: core) }
    }

    /// Apply the ticked changes to the real rules; the rest stays in the plan.
    func apply() async {
        guard let figures, let plan, let sheet = applySheet else { return }
        busy = true
        defer { busy = false }
        saveTask?.cancel()
        do {
            let picked = JSONValue.object(["$": "set", "v": .array(sheet.picked.map { .string($0) })])
            let selection = try core.json("planMath", "applySelection", [figures.state["items"] ?? [], plan, picked])
            let remaining = selection["remaining"] ?? .null
            let empty: Bool = try core.call("planMath", "isEmptyPlan", [remaining])
            try await data.plan.applyRecurringPlan(apply: selection["apply"] ?? .null, remaining: empty ? nil : remaining)
            self.plan = remaining
            dirty = false
            saveStatus = .saved
            applySheet = nil
            close()
            say("plan:apply.done", ["count": selection["count"] ?? 0])
            await load()
        } catch {
            say(userMessage(error, "plan:apply.failed"), warning: true, worded: true)
            if dirty { await save() } // the save the apply held back
        }
    }

    /// Undo the last apply (after its question).
    func undoApply() async {
        busy = true
        defer { busy = false }
        do {
            let count = try await data.plan.undoRecurringPlan()
            say("plan:undo.done", ["count": .int(count)])
        } catch {
            say(userMessage(error, "plan:undo.failed"), warning: true, worded: true)
        }
        await load()
    }

    /// The last apply's undo question.
    var undoTitle: String {
        core.text("plan:undo.title", ["count": .int(page?.applied?.count ?? 0)])
    }

    // MARK: Type a what-if

    /// Ask the helper: the typed line → the proposals, listed in place to check.
    func askWhatIf() async {
        let text = whatIfText.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty, whatIf != .working, let figures else { return }
        whatIf = .working
        whatIfUndo = .null
        do {
            let labels = try core.json("aiMath", "categoryLabels", [categories])
            let answer = try await data.plan.planWhatIf(text: text, labels: labels)
            let rows = try core.json("whatIfMath", "whatIfRows", [answer, figures.state["items"] ?? [],
                                                                  figures.page.savingsCategoryId.json])
            let notFound = answer["notFound"] ?? []
            if let empty = try core.json("planPage", "whatIfEmpty", [rows, notFound]).stringValue {
                whatIf = .failed(empty)
                return
            }
            whatIfRows = rows
            whatIfPicked = (rows.arrayValue ?? []).compactMap { $0["id"]?.stringValue }
            whatIfNotFound = notFound
            whatIfEditing = nil
            whatIf = .preview
            refigureWhatIf()
        } catch {
            let code = (error as? ServerError)?.code
            let key: String = (try? core.call("aiMath", "aiErrorKey", [code.json, JSONValue.string("plan:typeIt.unreadable")]))
                ?? "ai:errors.failed"
            whatIf = .failed(core.text(key))
        }
    }

    func setWhatIfText(_ text: String) {
        whatIfText = text
        if case .failed = whatIf { whatIf = .idle }
    }

    private func refigureWhatIf() {
        whatIfPreview = try? core.call("planPage", "whatIfParts", [whatIfRows, JSONValue.array(whatIfPicked.map { .string($0) }),
                                                                  whatIfNotFound])
        if let whatIfEditing, let row = whatIfRow(whatIfEditing) {
            whatIfEditor = try? core.call("planPage", "whatIfEditorParts", [row])
        } else {
            whatIfEditor = nil
        }
    }

    private func whatIfRow(_ id: String) -> JSONValue? {
        whatIfRows.arrayValue?.first { $0["id"]?.stringValue == id }
    }

    func toggleWhatIf(_ id: String) {
        if let index = whatIfPicked.firstIndex(of: id) { whatIfPicked.remove(at: index) } else { whatIfPicked.append(id) }
        refigureWhatIf()
    }

    /// Edit (or Done) on a proposal.
    func editWhatIf(_ id: String) {
        whatIfEditing = whatIfEditing == id ? nil : id
        refigureWhatIf()
        whatIfEditText = whatIfEditor?.text ?? ""
    }

    /// A proposal's field changed: any of { cancel, amount_minor, frequency, interval_n, name }.
    private func changeWhatIf(_ patch: JSONValue) {
        guard let id = whatIfEditing, let row = whatIfRow(id),
              let next = try? core.json("whatIfMath", "editRow", [row, patch]) else { return }
        whatIfRows = .array((whatIfRows.arrayValue ?? []).map { $0["id"]?.stringValue == id ? next : $0 })
        refigureWhatIf()
    }

    func setWhatIfName(_ name: String) { changeWhatIf(["name": .string(name)]) }

    /// The name of the new item being edited, as typed.
    var whatIfEditingName: String {
        whatIfEditing.flatMap { whatIfRow($0)?["name"]?.stringValue } ?? ""
    }
    func setWhatIfCancelled(_ cancelled: Bool) { changeWhatIf(["cancel": .bool(cancelled)]) }

    func setWhatIfAmount(_ text: String) {
        guard let editor = whatIfEditor else { return }
        whatIfEditText = clean(text, editor.currency)
        if let patch = try? core.json("planPage", "amountEdit", [whatIfEditText, editor.currency]), !patch.isNull {
            changeWhatIf(patch)
        }
    }

    func setWhatIfFrequency(_ value: String) {
        if let patch = try? core.json("planPage", "frequencyPick", [value]), !patch.isNull { changeWhatIf(patch) }
    }

    /// "Add N to plan": the ticked proposals become ordinary plan edits.
    func addWhatIf() {
        guard let plan, let preview = whatIfPreview else { return }
        let ids = (whatIfRows.arrayValue ?? []).map { _ in JSONValue.string(UUID().uuidString.lowercased()) }
        guard let result = try? core.json("whatIfMath", "applyWhatIf", [plan, whatIfRows,
                                                                        JSONValue.array(whatIfPicked.map { .string($0) }), [
            "rules": rules, "todayISO": .string((try? core.isoDate(now())) ?? ""), "ids": .array(ids),
            "savingsCategoryId": page?.savingsCategoryId.json ?? .null,
        ] as JSONValue]) else { return }
        whatIfUndo = result["added"] ?? .null
        whatIf = .added(preview.ready)
        whatIfText = ""
        whatIfEditing = nil
        change { _ in result["plan"] ?? plan }
    }

    /// Undo "Add to plan": exactly those edits leave again.
    func undoWhatIf() {
        let added = whatIfUndo
        whatIfUndo = .null
        whatIf = .idle
        change { try core.json("whatIfMath", "undoWhatIf", [$0, added]) }
    }

    func cancelWhatIf() {
        whatIf = .idle
        whatIfEditing = nil
    }

    /// "Added 2 changes to your plan."
    var whatIfAddedText: String? {
        if case .added(let count) = whatIf { return core.text("plan:typeIt.added", ["count": .int(count)]) }
        return nil
    }

    // MARK: Helpers

    /// Words with tags (<s>, <strong>) as the core parses them, for NativeRich.
    func rich(_ text: String) -> JSONValue {
        (try? core.json("translate", "parseRich", [text])) ?? [.string(text)]
    }

    /// Today, 'YYYY-MM-DD' (the earliest an added item can start).
    var todayISO: String { (try? core.isoDate(now())) ?? "" }

    /// A real rule by id (Your changes' "Open payment").
    func rule(_ id: String) -> JSONValue? {
        rules.arrayValue?.first { $0["id"]?.stringValue == id }
    }

    /// The add form's currencies (CurrencySelect: currency.currencyCodes, the draft's first when it isn't listed).
    var currencyOptions: [String] {
        let current = draft["currency"]?.stringValue ?? base
        return (try? core.call("currency", "currencyCodes", [JSONValue.string(current)])) ?? [current]
    }

    /// An amount as typed, cleaned as the web's MoneyInput cleans it.
    private func clean(_ text: String, _ currency: String) -> String {
        (try? core.call("moneyParse", "sanitizeAmountInput", [text, currency])) ?? text
    }

    /// The words of a failure (errors.userMessage, else `fallback`'s).
    private func userMessage(_ error: Error, _ fallback: String) -> String {
        UserMessage.of(error, fallback: core.text(fallback), core: core)
    }

    private func say(_ key: String, _ vars: JSONValue = [:], warning: Bool = false, worded: Bool = false) {
        message = worded ? key : core.text(key, vars)
        self.warning = warning
    }
}
