// The one entry form's state, after the web's useEntryFields +
// TransactionForm (Add / Edit an expense or income, with its Repeat card)
// and RecurringForm (a rule's page: the same fields, Repeat always on, the
// date is the next charge). The form state is the web's (entryForm.js):
// every start (newForm, formFromRow, ruleToForm), every derived value
// (entryDerived, entryErrors, keptRate, effectiveRate, fxPreview, the
// Repeat lines), every save (entrySaveFields, ruleFromForm, planRepeat) and
// Type it's fill (aiMath.fillPlan, settlePendingCategory) and a receipt's
// (receiptRead.receiptFill, ReceiptModel) is a core call.
// This file holds the fields and does the I/O.
import Foundation
import Observation
import BudgeerCore

@MainActor
@Observable
final class EntryFormModel {
    enum Mode: Equatable {
        /// A new expense or income (Repeat offered); with a saved
        /// transaction, a copy of it dated today (Duplicate, Split).
        case add
        /// A saved transaction (its kind fixed), with its rule when it repeats.
        case edit
        /// A recurring rule (Repeat always on; the date is the next charge).
        case rule
    }

    /// The exchange-rate lookup (fx.js useFxRate).
    enum FxState: Equatable {
        case same
        case loading
        case ok(rate: Double, date: String)
        case missing
        case skipped
    }

    enum QuickState: Equatable {
        case idle, working, done
        case failed(String)
    }

    let mode: Mode
    private let transaction: JSONValue?
    /// The rule being edited, or the one the saved entry repeats by (found on load).
    private(set) var rule: JSONValue?
    private let startKind: String
    private let startRepeat: Bool
    /// The category Add opens on (Savings' "Add to savings"; addLinks' `category`), if it fits the kind.
    private let preset: String?
    /// What a group's form carried over on Add ({ amount, currency, currencyPicked, description, spentAt }).
    private let initial: JSONValue
    private let data: DataLayer
    private let core: BudgeerCore
    private let now: @Sendable () -> Date
    private let clientUUID = UUID().uuidString.lowercased()

    // The context the form reads.
    private(set) var ready = false
    private(set) var loadError: String?
    private(set) var baseCurrency = "EUR"
    private(set) var separateYearly = false
    private(set) var quickOn = false
    private(set) var categories: JSONValue = []
    private var bothKinds: JSONValue = []
    private var savingsIds: JSONValue = ["$": "set", "v": []]
    private(set) var savingsLoaded = false
    private var vouchersOn = false
    private var startPaidFrom = "bank"

    // The web's form state.
    private(set) var kind = "expense"
    private(set) var amount = ""
    private(set) var currency = "EUR"
    private var currencyPicked = false
    private(set) var categoryId = ""
    private(set) var description = ""
    private(set) var date = ""
    var fromIncome = true
    private(set) var paidFrom = "bank"
    var notes = ""
    var repeatOn = false
    private(set) var draft: JSONValue = [:]
    var manualRate = ""
    private(set) var fx: FxState = .same
    private var fxTask: Task<Void, Never>?

    // Type it.
    var quickText = ""
    private(set) var quickState: QuickState = .idle
    private(set) var marks: Set<String> = []
    private var beforeFill: JSONValue?

    // Saving.
    private(set) var tried = false
    private(set) var busy = false
    /// A message over the form (a failed save, a rate still missing).
    private(set) var notice: String?
    /// Saved, but the repeat part failed (a warning, the entry is in).
    private(set) var repeatWarning: String?
    /// Scan a receipt (a new expense only, as on the web).
    let receipt: ReceiptModel

    init(mode: Mode, kind: String = "expense", repeats: Bool = false, transaction: JSONValue? = nil,
         rule: JSONValue? = nil, initial: JSONValue = .null, preset: String? = nil, data: DataLayer,
         core: BudgeerCore = .shared, now: @escaping @Sendable () -> Date = { Date() }) {
        self.mode = mode
        self.preset = preset
        self.initial = initial
        self.transaction = transaction
        self.rule = rule
        startKind = kind
        startRepeat = repeats
        self.data = data
        self.core = core
        self.now = now
        receipt = ReceiptModel(core: core)
    }

    private var today: String { (try? core.isoDate(now())) ?? "" }

    // MARK: Loading

    /// The profile, the savings categories, the voucher setup and this kind's
    /// categories, then the form's start (newForm / formFromRow / ruleToForm).
    func load() async {
        do {
            let profile = try await data.profile.profile()
            baseCurrency = profile["base_currency"]?.stringValue ?? "EUR"
            separateYearly = profile["yearly_separate"]?.boolValue ?? false
            let helpers = try core.json("aiMath", "helpersOn", [profile])
            quickOn = mode == .add && helpers["quickEntry"]?.boolValue == true
            let savings = try await data.categories.savingsCategories()
            savingsIds = try core.json("savings", "savingsIdsOf", [savings])
            savingsLoaded = true
            vouchersOn = !((try? await data.profile.mealVouchers()) ?? .null).isNull
            // An entry in a series: its rule, whose schedule the Repeat card edits.
            if mode == .edit, rule == nil, let ruleId = transaction?["recurring_rule_id"]?.stringValue {
                let rules = try await data.recurring.rules()
                rule = rules.arrayValue?.first { $0["id"]?.stringValue == ruleId }
            }
            try start()
            categories = try await data.categories.categories(kind: kind)
            // useEntryFields: a preset category, kept only when it is an active one of this kind.
            if mode == .add, transaction == nil, let preset {
                categoryId = try core.call("categoryName", "presetCategoryId", [JSONValue.string(preset), categories,
                                                                                JSONValue.string(kind)])
            }
            if quickOn { bothKinds = try await data.categories.categories(kind: nil) }
            ready = true
            loadError = nil
            refreshRate()
        } catch {
            loadError = String(describing: error)
        }
    }

    private func start() throws {
        let form: JSONValue
        switch mode {
        case .add:
            if let copy = transaction {
                // Duplicate / Split: the saved entry's fields, dated today.
                form = try core.json("entryForm", "formFromRow", [copy, JSONValue.string(today)])
                notes = copy["notes"]?.stringValue ?? ""
            } else {
                form = try core.json("entryForm", "newForm", [["kind": .string(startKind), "baseCurrency": .string(baseCurrency),
                                                               "date": .string(today), "initial": initial] as JSONValue])
            }
            repeatOn = startRepeat
            draft = try core.json("recurringMath", "repeatDraft", [JSONValue.null, ["fromDate": form["date"] ?? .null] as JSONValue])
        case .edit:
            let row = transaction ?? [:]
            form = try core.json("entryForm", "formFromRow", [row, row["spent_at"] ?? .null])
            notes = row["notes"]?.stringValue ?? ""
            repeatOn = rule != nil
            draft = try core.json("recurringMath", "repeatDraft", [rule ?? .null, ["fromDate": form["date"] ?? .null] as JSONValue])
        case .rule:
            let started = try core.json("ruleForm", "ruleToForm", [rule ?? [:]])
            form = started["form"] ?? [:]
            draft = started["draft"] ?? [:]
            repeatOn = true
        }
        kind = form["kind"]?.stringValue ?? "expense"
        amount = form["amount"]?.stringValue ?? ""
        currency = form["currency"]?.stringValue ?? baseCurrency
        currencyPicked = form["currencyPicked"]?.boolValue ?? false
        categoryId = form["categoryId"]?.stringValue ?? ""
        description = form["description"]?.stringValue ?? ""
        date = form["date"]?.stringValue ?? ""
        fromIncome = form["fromIncome"]?.boolValue ?? true
        paidFrom = form["paidFrom"]?.stringValue ?? "bank"
        startPaidFrom = paidFrom
        marks = []
    }

    // MARK: What the fields show (the core's answers)

    /// The form state as the web's functions take it.
    var form: JSONValue {
        ["kind": .string(kind), "amount": .string(amount), "currency": .string(currency),
         "currencyPicked": .bool(currencyPicked), "categoryId": .string(categoryId),
         "description": .string(description), "date": .string(date), "fromIncome": .bool(fromIncome),
         "paidFrom": .string(paidFrom)]
    }

    /// entryDerived: isSavings, sources, from, amountMinor.
    private var derived: JSONValue {
        // Meal vouchers pay as you go: never for a rule, nor an entry set to repeat.
        let allowVouchers = mode != .rule && !repeatOn
        let options: JSONValue = ["savingsIds": savingsIds, "vouchersOn": .bool(vouchersOn),
                                  "allowVouchers": .bool(allowVouchers), "startPaidFrom": .string(startPaidFrom)]
        return (try? core.json("entryForm", "entryDerived", [form, options])) ?? [:]
    }

    var isSavings: Bool { derived["isSavings"]?.boolValue ?? false }
    /// "Paid from"'s choices ([] hides it).
    var sources: [String] { derived["sources"]?.arrayValue?.compactMap(\.stringValue) ?? [] }
    /// The "Paid from" choice shown.
    var shownPaidFrom: String { derived["from"]?.stringValue ?? "bank" }
    var amountMinor: Int { derived["amountMinor"]?.intValue ?? 0 }

    /// The form with "Paid from" as shown (useEntryFields' values()).
    private var values: JSONValue { form.with("paidFrom", .string(shownPaidFrom)) }

    /// The inline errors, from the first save on: "amount", "date".
    var errors: [String: String] {
        guard tried else { return [:] }
        let found = (try? core.json("entryForm", "entryErrors", [["amount": .string(amount), "date": .string(date)] as JSONValue])) ?? [:]
        return (found.objectValue ?? [:]).compactMapValues(\.stringValue)
    }

    /// What Add carries to a group's form when the user picks one under
    /// "Who's it for?" (the web's onDraft).
    var whoForDraft: JSONValue {
        ["amount": .string(amount), "currency": .string(currency), "currencyPicked": .bool(currencyPicked),
         "description": .string(description), "spentAt": .string(date)]
    }

    /// The categories of this kind as the chips show them: (id, name shown, badge).
    var categoryOptions: [(id: String, name: String, look: CategoryLook)] {
        (categories.arrayValue ?? []).compactMap { category in
            guard let id = category["id"]?.stringValue else { return nil }
            let name: String = (try? core.call("categoryName", "categoryDisplayName", [category])) ?? ""
            let look = (try? CategoryLook.of(category, kind: kind, core: core)) ?? CategoryLook(key: "other", tone: "accent", tint: nil)
            return (id, name, look)
        }
    }

    /// The amount as the big figure shows it (currency.formatMoney; nothing typed reads 0).
    var amountText: String {
        core.formatMoney(.int(amountMinor), currency)
    }

    /// A key of the number pad: a digit or the decimal point is typed at the
    /// end, "⌫" takes the last character off (the text is cleaned as typed).
    func press(_ key: String) {
        if key == "⌫" {
            setAmount(String(amount.dropLast()))
        } else {
            setAmount(amount + key)
        }
    }

    /// The currencies the picker offers (the web's CurrencySelect).
    var currencyOptions: [String] {
        (try? core.call("currency", "currencyCodes", [JSONValue.string(currency)])) ?? [currency]
    }

    /// The amount field's keypad and placeholder (MoneyInput).
    var amountHints: (whole: Bool, placeholder: String) {
        let hints = (try? core.json("moneyParse", "amountFieldHints", [currency])) ?? [:]
        return (hints["whole"]?.boolValue ?? false, hints["placeholder"]?.stringValue ?? "")
    }

    // MARK: Exchange rate (Add / Edit)

    /// A foreign-currency entry: it needs a rate (none for a rule: each
    /// charge gets its own day's).
    var needsFx: Bool { mode != .rule && currency != baseCurrency }

    /// keptRate: the saved row's rate while its currency and date are unchanged.
    private var kept: JSONValue {
        guard mode == .edit, let transaction else { return .null }
        let options: JSONValue = ["currency": .string(currency), "date": .string(date), "base": .string(baseCurrency)]
        return (try? core.json("currency", "keptRate", [transaction, options])) ?? .null
    }

    private var fxJSON: JSONValue {
        switch fx {
        case .same: return ["status": "same"]
        case .loading: return ["status": "loading"]
        case .ok(let rate, let day): return ["status": "ok", "rate": .double(rate), "date": .string(day)]
        case .missing: return ["status": "missing"]
        case .skipped: return ["status": "skipped"]
        }
    }

    /// effectiveRate: the rate a save captures, or nil while none is known.
    var rate: Double? {
        let args: JSONValue = ["needsFx": .bool(needsFx), "kept": kept, "fx": fxJSON, "manual": .string(manualRate)]
        return (try? core.json("currency", "effectiveRate", [args]))?.doubleValue
    }

    /// fxPreview: the line (or the request for a rate) under the amount.
    var fxLine: JSONValue? {
        guard needsFx else { return nil }
        let rateValue: JSONValue = rate.map { JSONValue.double($0) } ?? .null
        let args: JSONValue = ["from": .string(currency), "to": .string(baseCurrency), "amountMinor": .int(amountMinor),
                               "fx": fxJSON, "captured": kept, "rate": rateValue]
        return try? core.json("fxPreview", "fxPreview", [args])
    }

    /// Look the rate up again (a new currency or date), as useFxRate: after a
    /// short pause, never 1 on a failure.
    func refreshRate() {
        fxTask?.cancel()
        guard ready, needsFx else { fx = .same; return }
        if !kept.isNull { fx = .skipped; return }
        fx = .loading
        let from = currency, to = baseCurrency, day = date
        let fxRepository = data.fx
        fxTask = Task { [weak self] in
            try? await Task.sleep(nanoseconds: 250_000_000)
            if Task.isCancelled { return }
            let answer = await fxRepository.rate(from: from, to: to, date: day.isEmpty ? nil : day)
            if Task.isCancelled { return }
            if let answer, let value = answer["rate"]?.doubleValue, let asOf = answer["date"]?.stringValue {
                self?.fx = .ok(rate: value, date: asOf)
            } else {
                self?.fx = .missing
            }
        }
    }

    /// Wait for a rate lookup in flight (tests).
    func settleRate() async {
        await fxTask?.value
    }

    // MARK: The Repeat card

    var repeatChoice: String { draft["choice"]?.stringValue ?? "monthly" }
    var repeatEvery: String { draft["n"]?.stringValue ?? "1" }
    var repeatNextRun: String { draft["nextRun"]?.stringValue ?? "" }
    var repeatEndDate: String { draft["endDate"]?.stringValue ?? "" }
    var repeatRemind: Bool { draft["remind"]?.boolValue ?? false }
    var repeatRemindDays: String { draft["remindDays"]?.stringValue ?? "3" }
    var repeatActive: Bool { draft["active"]?.boolValue ?? true }
    /// Paused is offered for a series that exists (a rule, an entry in one).
    var pausable: Bool { mode == .rule || rule != nil }

    var repeatChoices: [(value: String, label: String)] {
        let options = (try? core.json("recurringMath", "repeatChoiceOptions", [])) ?? []
        return (options.arrayValue ?? []).map { ($0["value"]?.stringValue ?? "", $0["label"]?.stringValue ?? "") }
    }

    /// repeatShareLine: how a yearly expense counts in monthly budgets.
    var repeatShare: String? {
        let args: JSONValue = ["choice": .string(repeatChoice), "n": .string(repeatEvery), "kind": .string(kind),
                               "amountMinor": .int(amountMinor), "currency": .string(currency),
                               "separateYearly": .bool(separateYearly)]
        return (try? core.json("recurringMath", "repeatShareLine", [args]))?.stringValue
    }

    /// repeatNextHelp: under the next charge of a new series.
    var repeatNextHelp: String? {
        let args: JSONValue = ["rule": rule ?? .null, "repeat": .bool(repeatOn), "draft": draft, "todayISO": .string(today)]
        return (try? core.json("recurringMath", "repeatNextHelp", [args]))?.stringValue
    }

    /// ruleForm.nextChargeHelp: under a rule's date, when it has passed.
    var dateHelp: String? {
        guard mode == .rule, errors["date"] == nil else { return nil }
        return (try? core.json("ruleForm", "nextChargeHelp", [date, today]))?.stringValue
    }

    /// Change the schedule (editRepeat): while the next charge follows the
    /// entry's date, a new choice moves it.
    func editRepeat(_ changes: JSONValue) {
        // A rule's page has no entry date for the next charge to follow.
        let args: [Encodable] = mode == .rule ? [draft, changes] : [draft, changes, date.isEmpty ? today : date]
        if let next = try? core.json("recurringMath", "editRepeat", args) { draft = next }
    }

    // MARK: Editing

    func pickKind(_ next: String) async {
        guard next != kind else { return }
        kind = next
        categoryId = "" // categories are per kind
        categories = (try? await data.categories.categories(kind: next)) ?? []
    }

    /// The amount as typed, cleaned the way the web's MoneyInput cleans it.
    func setAmount(_ text: String) {
        amount = (try? core.call("moneyParse", "sanitizeAmountInput", [text, currency])) ?? text
        unmark("amount")
    }

    func pickCurrency(_ code: String) {
        currency = code
        currencyPicked = true
        refreshRate()
    }

    func pickCategory(_ id: String) {
        categoryId = id
        unmark("category")
    }

    func setDescription(_ text: String) {
        description = text
        unmark("description")
    }

    func pickPaidFrom(_ source: String) {
        paidFrom = source
        unmark("paidFrom")
    }

    /// A new date: the next charge follows it on Add, and the rate is looked up again.
    func changeDate(_ value: String) {
        date = value
        unmark("date")
        if mode != .rule { editRepeat([:]) }
        refreshRate()
    }

    func unmark(_ field: String) {
        if marks.contains(field) { marks.remove(field) }
    }

    // MARK: A receipt

    /// "Scan a receipt" is offered on a new expense (TransactionForm).
    var offersReceipt: Bool { mode == .add && kind == "expense" }

    /// "Use these": what the receipt changes (receiptFill) goes in, in the web's order.
    func useReceipt() {
        guard let scan = receipt.use() else { return }
        let form: JSONValue = ["currency": .string(currency), "description": .string(description)]
        guard let fill = try? core.json("receiptRead", "receiptFill", [scan, form]) else { return }
        if let amount = fill["amount"]?.stringValue { setAmount(amount) }
        if let day = fill["date"]?.stringValue { changeDate(day) }
        if let shop = fill["description"]?.stringValue { setDescription(shop) }
        if let code = fill["currency"]?.stringValue { pickCurrency(code) }
    }

    // MARK: Type it

    /// The typed line → the helper's entry → the form, the fields it filled marked.
    func typeIt() async {
        let text = quickText.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty, quickState != .working else { return }
        quickState = .working
        do {
            let labels = try core.json("aiMath", "categoryLabels", [bothKinds])
            let entry = try await data.ai.parseEntry(text: text, today: today, labels: labels)
            await applyFill(entry)
            quickState = .done
        } catch {
            let code = (error as? ServerError)?.code
            let key: String = (try? core.call("aiMath", "aiErrorKey", [code.json])) ?? "ai:errors.failed"
            quickState = .failed(key)
        }
    }

    /// Put the fill back to what the form had (Undo).
    func undoFill() async {
        if let beforeFill { await putFields(beforeFill) }
        beforeFill = nil
        marks = []
        quickState = .idle
    }

    private func applyFill(_ entry: JSONValue) async {
        let current: JSONValue = ["kind": .string(kind), "amount": .string(amount), "currency": .string(currency),
                                  "currencyPicked": .bool(currencyPicked), "categoryId": .string(categoryId),
                                  "description": .string(description), "spentAt": .string(date),
                                  "paidFrom": .string(shownPaidFrom)]
        guard let plan = try? core.json("aiMath", "fillPlan", [entry, current]), let next = plan["next"] else { return }
        if beforeFill == nil { beforeFill = current }
        let picked = currencyPicked || next["currency"]?.stringValue != currency
        await putFields(next.with("currencyPicked", .bool(picked)))
        marks = Set((plan["marked"]?.arrayValue ?? []).compactMap(\.stringValue))
    }

    /// The web's putFields: a fill, or Undo's way back.
    private func putFields(_ fields: JSONValue) async {
        let nextKind = fields["kind"]?.stringValue ?? kind
        if nextKind != kind { await pickKind(nextKind) }
        amount = fields["amount"]?.stringValue ?? ""
        currency = fields["currency"]?.stringValue ?? currency
        currencyPicked = fields["currencyPicked"]?.boolValue ?? currencyPicked
        changeDate(fields["spentAt"]?.stringValue ?? date)
        description = fields["description"]?.stringValue ?? ""
        paidFrom = fields["paidFrom"]?.stringValue ?? paidFrom
        // The category once this kind's list is here (settlePendingCategory).
        let pending: JSONValue = ["id": fields["categoryId"] ?? .null, "kind": .string(nextKind)]
        if let settled = try? core.json("aiMath", "settlePendingCategory", [pending, categories, false]),
           let pick = settled["pick"]?.stringValue {
            categoryId = pick
        }
    }

    // MARK: Saving

    /// Check the fields (entryErrors); the inline errors show from now on.
    func validate() -> Bool {
        tried = true
        return errors.isEmpty
    }

    /// Save as the web's form does; true when the entry (or rule) is in.
    func save() async -> Bool {
        notice = nil
        repeatWarning = nil
        guard validate() else { return false }
        busy = true
        defer { busy = false }
        do {
            if mode == .rule {
                let fields = try core.json("ruleForm", "ruleFromForm", [values, draft, ["isSavings": .bool(isSavings)] as JSONValue])
                try await data.recurring.save(id: rule?["id"]?.stringValue, fields: fields)
                return true
            }
            // Never a foreign amount without a real rate (no silent 1:1).
            guard let rate else {
                notice = core.text(fx == .loading ? "transactions:form.fetchingRate" : "transactions:form.enterRate")
                return false
            }
            let options: JSONValue = ["isSavings": .bool(isSavings), "rate": .double(rate), "notes": .string(notes)]
            let fields = try core.json("entryForm", "entrySaveFields", [values, options])
            let entry: JSONValue
            if mode == .edit, let id = transaction?["id"]?.stringValue {
                try await data.transactions.update(id: id, fields: fields)
                entry = fields.with("kind", .string(kind)).with("id", .string(id))
                    .with("account_id", transaction?["account_id"] ?? .null)
            } else {
                let row = fields.with("kind", .string(kind)).with("client_uuid", .string(clientUUID))
                try await data.transactions.insert(row)
                entry = row
            }
            await saveRepeat(entry)
            return true
        } catch {
            notice = core.text("common:errors.generic")
            return false
        }
    }

    /// After the entry: its rule (planRepeat). Never fails the save.
    private func saveRepeat(_ entry: JSONValue) async {
        let args: JSONValue = ["rule": rule ?? .null, "repeat": .bool(repeatOn), "draft": draft,
                               "before": transaction ?? .null, "entry": entry]
        do {
            let plan = try core.json("recurringMath", "planRepeat", [args])
            switch plan["action"]?.stringValue {
            case "create": try await data.recurring.save(id: nil, fields: plan["fields"] ?? [:])
            case "update": try await data.recurring.save(id: plan["id"]?.stringValue, fields: plan["fields"] ?? [:])
            case "delete": if let id = plan["id"]?.stringValue { try await data.recurring.deleteRule(id: id) }
            default: break
            }
        } catch {
            repeatWarning = core.text(rule != nil ? "transactions:form.repeatNotUpdated" : "transactions:form.repeatNotSet")
        }
    }

    /// The screen's title (transactions:page.title, recurring:page.editTitle).
    var title: String {
        switch mode {
        case .add: return core.text(kind == "income" ? "transactions:page.title.newIncome" : "transactions:page.title.newExpense")
        case .edit: return core.text(kind == "income" ? "transactions:page.title.editIncome" : "transactions:page.title.editExpense")
        case .rule: return core.text("recurring:page.editTitle")
        }
    }

    /// The save button's words.
    var saveLabel: String {
        switch mode {
        case .add: return core.text("transactions:form.submit.\(kind)")
        case .edit: return core.text("transactions:form.saveChanges")
        case .rule: return core.text("recurring:form.saveChanges")
        }
    }

    /// DeleteTransactionDialog's words: "Delete this expense?", "Lunch · €12.00. This can't be undone."
    var deleteTitle: String { core.text("transactions:deleteDialog.title.\(kind == "income" ? "income" : "expense")") }
    var deleteBody: String {
        guard let row = transaction else { return "" }
        return TransactionWords.deleteBody(row, core: core)
    }

    /// Delete the saved entry (after the view's confirm).
    func delete() async -> Bool {
        guard let id = transaction?["id"]?.stringValue else { return false }
        busy = true
        defer { busy = false }
        do {
            try await data.transactions.delete(id: id)
            return true
        } catch {
            notice = core.text("transactions:list.notDeleted")
            return false
        }
    }
}
