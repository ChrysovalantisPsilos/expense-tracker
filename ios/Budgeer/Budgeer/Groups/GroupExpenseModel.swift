// A group expense's form, after the web's GroupExpenseForm: a new one (paid
// by you, split equally between everyone), one carried over from Add's
// "Who's it for?" (`quick`), or an existing one to edit or delete. Its
// rules are groupExpenseForm.js's (GroupExpenseFigures): where it starts,
// the split's preview and line, the split card, what stops a save, what a
// save sends and the toast; the exchange rate is the web's (keptRate, the
// ECB's rate for the day, or one typed when there is none). A new expense
// can start from a receipt (ReceiptModel), which fills the amount and the
// date as the web's group form does (receiptFill). This file holds the
// fields and does the I/O.
import Foundation
import Observation
import BudgeerCore

@MainActor
@Observable
final class GroupExpenseModel {
    let group: JSONValue
    let members: JSONValue
    let myMemberId: String?
    /// The signed-in user (their avatar is the highlighted one).
    let userId: String?
    let expense: JSONValue?
    let quick: Bool
    private(set) var form: ExpenseFormState
    var manualRate = ""
    private(set) var fx: EntryFormModel.FxState = .same
    private var fxTask: Task<Void, Never>?
    /// The split editor is open (the quick layout's Adjust).
    var adjust = false
    private(set) var tried = false
    private(set) var busy = false
    /// What stops a save (the web's warning toast), or a failed request.
    private(set) var notice: ToastText?
    /// The toast after a save (the words of "Added to Lisbon trip").
    private(set) var saved: ToastText?
    /// Scan a receipt (a new expense only, as on the web).
    let receipt: ReceiptModel

    private let data: DataLayer
    private let core: BudgeerCore

    /// - initial: what the Add form carried over (quickAddMath.carryDraft's answer), or null
    init(group: JSONValue, members: JSONValue, myMemberId: String?, userId: String? = nil, expense: JSONValue?,
         initial: JSONValue = .null, quick: Bool = false, data: DataLayer, core: BudgeerCore = .shared,
         now: @escaping @Sendable () -> Date = { Date() }) {
        self.group = group
        self.members = members
        self.myMemberId = myMemberId
        self.userId = userId
        self.expense = expense
        self.quick = quick
        self.data = data
        self.core = core
        receipt = ReceiptModel(core: core)
        let today = (try? core.isoDate(now())) ?? ""
        form = (try? GroupExpenseFigures.start(group: group, members: members, myMemberId: myMemberId, expense: expense,
                                               initial: initial, today: today, core: core))
            ?? ExpenseFormState(description: "", paidCurrency: group["currency"]?.stringValue ?? "EUR",
                                currencyPicked: false, amount: "", paidBy: myMemberId ?? "", spentAt: today,
                                splitWith: [], mode: "equal", values: [:])
        refreshRate()
    }

    var isEdit: Bool { expense != nil }

    /// "Scan a receipt" is offered on a new expense (GroupExpenseForm).
    var offersReceipt: Bool { !isEdit }

    /// "Use these": the receipt's total in the currency paid, and its date
    /// (the web's group form takes only those: receiptFill with { total, date }).
    func useReceipt() {
        guard let scan = receipt.use() else { return }
        let read: JSONValue = ["total": scan["total"] ?? .null, "date": scan["date"] ?? .null]
        let form: JSONValue = ["currency": .string(self.form.paidCurrency)]
        guard let fill = try? core.json("receiptRead", "receiptFill", [read, form]) else { return }
        if let amount = fill["amount"]?.stringValue { setAmount(amount) }
        if let day = fill["date"]?.stringValue { setDate(day) }
    }
    var groupCurrency: String { group["currency"]?.stringValue ?? "EUR" }
    var groupName: String { group["name"]?.stringValue ?? "" }
    /// The split modes in the buttons' order.
    var modes: [String] { (try? core.call("groupExpenseForm", "splitModes", [])) ?? [] }

    /// The members as rows: their id, name as you read it ("You") and avatar.
    var memberRows: [(id: String, name: String, avatar: Avatar?)] {
        (members.arrayValue ?? []).compactMap { member in
            guard let id = member["id"]?.stringValue else { return nil }
            let name: String = (try? core.call("groupFormat", "viewerName", [members, id, myMemberId.json])) ?? ""
            let avatar: Avatar? = try? core.call("groupFormat", "memberAvatar", [member, JSONValue.bool(id == myMemberId)])
            return (id, name, avatar)
        }
    }

    // MARK: What the form shows (the core's answers)

    /// The preview, card, problem, arguments and toast for the form as it stands.
    var figures: ExpenseFormFigures? {
        try? GroupExpenseFigures.evaluate(form, group: group, members: members, myMemberId: myMemberId, expense: expense,
                                          rate: rate, fxLoading: fx == .loading, quick: quick, core: core)
    }

    /// The inline errors, from the first save on: "description", "amount", "paidBy".
    var errors: [String: String] {
        guard tried else { return [:] }
        let found = (try? core.json("groupExpenseForm", "expenseFieldErrors", [[
            "description": .string(form.description), "amount": .string(form.amount), "paidBy": .string(form.paidBy),
        ] as JSONValue])) ?? [:]
        return (found.objectValue ?? [:]).compactMapValues(\.stringValue)
    }

    /// The currencies the amount can be in (CurrencySelect, the group's first when it isn't listed).
    var currencyOptions: [String] {
        (try? core.call("currency", "currencyCodes", [JSONValue.string(groupCurrency)])) ?? [groupCurrency]
    }

    /// The amount field's keypad and placeholder (MoneyInput).
    var amountHints: (whole: Bool, placeholder: String) {
        let hints = (try? core.json("moneyParse", "amountFieldHints", [form.paidCurrency])) ?? [:]
        return (hints["whole"]?.boolValue ?? false, hints["placeholder"]?.stringValue ?? "")
    }

    /// The quick layout's card: the avatars of whoever the split covers.
    var splitStack: AvatarStackParts? {
        guard let included = try? core.json("groupExpenseForm", "includedMembers", [members, form.splitWith]) else { return nil }
        return try? core.call("groupFormat", "avatarStackParts", [included, userId.json])
    }

    /// What a share's field counts in: the group's currency, % or ×.
    var shareUnit: String {
        (try? core.call("groupExpenseForm", "shareUnit", [form.mode, groupCurrency])) ?? groupCurrency
    }

    // MARK: The exchange rate (the paid currency → the group's)

    var needsFx: Bool { form.paidCurrency != groupCurrency }

    private var kept: JSONValue {
        let options: JSONValue = ["currency": .string(form.paidCurrency), "date": .string(form.spentAt),
                                  "base": .string(groupCurrency)]
        return (try? core.json("currency", "keptRate", [expense ?? .null, options])) ?? .null
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

    /// effectiveRate: 1 in the group's currency, else the kept, the ECB's or the typed rate.
    var rate: Double? {
        let args: JSONValue = ["needsFx": .bool(needsFx), "kept": kept, "fx": fxJSON, "manual": .string(manualRate)]
        return (try? core.json("currency", "effectiveRate", [args]))?.doubleValue
    }

    /// fxPreview's line under the amount (or the request for a rate).
    var fxLine: JSONValue? {
        guard needsFx else { return nil }
        let paid = (try? core.json("groupExpenseForm", "paidMinorOf", [form.amount, form.paidCurrency])) ?? 0
        let args: JSONValue = ["from": .string(form.paidCurrency), "to": .string(groupCurrency), "amountMinor": paid,
                               "fx": fxJSON, "captured": kept, "rate": rate.map { JSONValue.double($0) } ?? .null]
        return try? core.json("fxPreview", "fxPreview", [args])
    }

    private func refreshRate() {
        fxTask?.cancel()
        guard needsFx else { fx = .same; return }
        if !kept.isNull { fx = .skipped; return }
        fx = .loading
        let from = form.paidCurrency, to = groupCurrency, day = form.spentAt
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

    // MARK: Editing

    /// The amount as paid, as the big figure shows it (paidMinorOf, formatMoney).
    var amountText: String {
        core.formatMoney(.int(amountMinor), form.paidCurrency)
    }

    var amountMinor: Int {
        (try? core.call("groupExpenseForm", "paidMinorOf", [form.amount, form.paidCurrency])) ?? 0
    }

    /// A key of the number pad (as EntryFormModel.press).
    func press(_ key: String) {
        setAmount(key == "⌫" ? String(form.amount.dropLast()) : form.amount + key)
    }

    func setDescription(_ text: String) { form.description = text }

    /// The amount as typed, cleaned as the web's MoneyInput cleans it.
    func setAmount(_ text: String) {
        form.amount = (try? core.call("moneyParse", "sanitizeAmountInput", [text, form.paidCurrency])) ?? text
    }

    func pickCurrency(_ code: String) {
        form.paidCurrency = code
        form.currencyPicked = true
        refreshRate()
    }

    func setDate(_ day: String) {
        form.spentAt = day
        refreshRate()
    }

    func pickPayer(_ id: String) { form.paidBy = id }

    /// Include or leave out a member.
    func toggle(_ id: String) {
        if form.splitWith.contains(id) {
            form.splitWith.removeAll { $0 == id }
        } else {
            form.splitWith.append(id)
        }
    }

    /// A split mode; Percent starts from an even split of whoever is included (evenPercents).
    func pickMode(_ mode: String) {
        if mode == "percent", form.mode != "percent" {
            let ids = (try? core.json("groupExpenseForm", "includedIds", [members, form.splitWith])) ?? []
            if let even = try? core.call("splitMath", "evenPercents", [ids]) as [String: String] {
                form.values = even
            }
        }
        form.mode = mode
    }

    /// A member's share as typed: an amount (cleaned in the group's currency), a percentage or a weight.
    func setShare(_ id: String, _ text: String) {
        let currency: JSONValue = form.mode == "exact" ? .string(groupCurrency) : .null
        form.values[id] = (try? core.call("moneyParse", "sanitizeAmountInput", [JSONValue.string(text), currency])) ?? text
    }

    /// What the Add form carries to the other side when the user switches (onDraft).
    var whoForDraft: JSONValue {
        ["amount": .string(form.amount), "currency": .string(form.paidCurrency), "currencyPicked": .bool(form.currencyPicked),
         "description": .string(form.description), "spentAt": .string(form.spentAt)]
    }

    // MARK: Saving

    /// Save as the web's form does; true when the expense is in.
    func save() async -> Bool {
        notice = nil
        tried = true
        guard errors.isEmpty, let figures else { return false }
        if let problem = figures.problem {
            notice = problem
            return false
        }
        busy = true
        defer { busy = false }
        do {
            try await data.groups.saveGroupExpense(figures.args)
            saved = figures.toast
            // A new expense moves its group to the front of Add's "Who's it for?".
            if !isEdit, let id = group["id"]?.stringValue { MyGroupsModel.remember(groupId: id, core: core) }
            return true
        } catch {
            notice = ToastText(title: UserMessage.of(error, core: core), description: nil)
            return false
        }
    }

    /// DeleteTransactionDialog's words for this expense.
    var deleteTitle: String { core.text("transactions:deleteDialog.title.expense") }
    var deleteBody: String {
        guard let expense else { return "" }
        let name: String = (try? core.call("categoryName", "entryName",
                                           [expense, core.text("transactions:deleteDialog.thisEntry")])) ?? ""
        let amount = core.formatMoney(expense["amount_minor"] ?? 0, expense["currency"]?.stringValue ?? groupCurrency)
        return core.text("transactions:deleteDialog.body", ["name": .string(name), "amount": .string(amount)])
            + " " + core.text("groups:expensePage.deleteNote")
    }

    /// Delete the expense (after the view's confirm).
    func delete() async -> Bool {
        guard let id = expense?["id"]?.stringValue else { return false }
        busy = true
        defer { busy = false }
        do {
            try await data.groups.deleteGroupExpense(id: id)
            saved = ToastText(title: core.text("groups:expensePage.deleted"), description: nil)
            return true
        } catch {
            notice = ToastText(title: UserMessage.of(error, core: core), description: nil)
            return false
        }
    }
}
