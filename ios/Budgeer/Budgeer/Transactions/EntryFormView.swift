// The one entry form, a page as on the web (TransactionPage / RecurringPage
// in a PageForm): "Transactions" over "New expense" with the back arrow,
// then the card of EntryFields in the web's order and words: Type it (when
// its switch is on), Expense | Income (the type and its ⓘ once saved),
// "Who's it for?", Amount + Currency and the exchange rate, Category,
// "Taken from my income" (savings income), Paid from (its ⓘ), Description,
// Date (a rule's next charge), Notes; then the Repeat card, and the save
// button with Delete under it. Everything it shows is EntryFormModel's (the
// core's answers); `onDone` closes it (true once saved or deleted).
import SwiftUI

@MainActor
struct EntryFormView: View {
    @Bindable var model: EntryFormModel
    /// Add's "Who's it for?" row (the user's groups), for a new expense.
    var who: AnyView? = nil
    let onDone: (Bool) -> Void
    @Environment(AppLanguage.self) private var language
    @State private var confirmDelete = false
    @State private var kindInfo = false
    @State private var paidInfo = false

    var body: some View {
        Page {
            PageHeader(title: model.ready ? model.title : "",
                       eyebrow: language.t(model.mode == .rule ? "recurring:list.title" : "transactions:ledger.title"),
                       back: { onDone(false) })
            if model.ready {
                form
            } else if let error = model.loadError {
                Panel { LoadErrorBlock(message: error) { await model.load() } }
            } else {
                Panel { SkeletonRows(count: 5) }
            }
        }
        .task(id: language.current) { if !model.ready { await model.load() } }
        .confirmationDialog(model.deleteTitle, isPresented: $confirmDelete, titleVisibility: .visible) {
            Button(language.t("common:actions.delete"), role: .destructive) {
                Task { if await model.delete() { onDone(true) } }
            }
            Button(language.t("common:actions.cancel"), role: .cancel) {}
        } message: {
            Text(model.deleteBody)
        }
    }

    @ViewBuilder private var form: some View {
        if let notice = model.notice {
            Note(text: notice, tone: Theme.Colors.warning, size: 14)
                .accessibilityIdentifier("entry.notice")
        }
        Panel { fields }
        Panel { repeatCard }
        VStack(spacing: Theme.Space.s3) {
            Button {
                Task { if await model.save() { onDone(true) } }
            } label: {
                if model.busy { ProgressView().tint(Theme.Colors.onAccent) } else { Text(model.saveLabel) }
            }
            .buttonStyle(PrimaryButtonStyle())
            .disabled(model.busy || !model.savingsLoaded || (model.needsFx && model.rate == nil))
            .accessibilityIdentifier("entry.save")
            if model.mode == .edit {
                Button {
                    confirmDelete = true
                } label: {
                    IconLabel(text: language.t("common:actions.delete"), icon: .trash2)
                }
                .buttonStyle(DangerButtonStyle())
                .accessibilityIdentifier("entry.delete")
            }
        }
    }

    // MARK: The entry's fields (EntryFields)

    @ViewBuilder private var fields: some View {
        VStack(alignment: .leading, spacing: Theme.Space.s5) {
            if model.quickOn { TypeItField(model: model) }
            kindField
            if model.mode == .add, model.kind == "expense", let who { who }
            VStack(alignment: .leading, spacing: Theme.Space.s2) {
                HStack(alignment: .top, spacing: Theme.Space.s2) {
                    FormRow(label: language.t("transactions:form.amount"), required: true, suggested: model.marks.contains("amount"),
                            error: model.errors["amount"]) {
                        TextField(model.amountHints.placeholder, text: Binding(get: { model.amount }, set: { model.setAmount($0) }))
                            .keyboardType(model.amountHints.whole ? .numberPad : .decimalPad)
                            .fieldStyle()
                            .accessibilityIdentifier("entry.amount")
                    }
                    FormRow(label: language.t("transactions:form.currency")) {
                        SelectMenu(options: model.currencyOptions.map { ($0, $0) }, value: model.currency,
                                   label: language.t("transactions:form.currency")) { model.pickCurrency($0) }
                    }
                    .frame(width: 110)
                }
                if model.mode == .rule, model.currency != model.baseCurrency {
                    Note(text: language.t("recurring:form.eachChargeRate"), size: 14)
                } else if let line = model.fxLine {
                    FxLine(line: line, manual: $model.manualRate)
                }
            }
            categoryField
            if model.isSavings {
                SwitchRow(label: language.t("common:savingsSwitch.fromIncome.label"),
                          note: language.t("common:savingsSwitch.fromIncome.hint"), isOn: $model.fromIncome)
            }
            if !model.sources.isEmpty {
                VStack(alignment: .leading, spacing: Theme.Space.s2) {
                    HStack(spacing: 2) {
                        FieldLabel(text: language.t("common:paidFrom.label"))
                        InfoButton(open: $paidInfo, label: language.t("common:info"))
                        if model.marks.contains("paidFrom") {
                            Spacer(minLength: 0)
                            SuggestedMark()
                        }
                    }
                    SegmentedControl(options: model.sources.map { ($0, language.t("common:paidFrom.\($0)")) },
                                     value: model.shownPaidFrom, size: .sm, fitted: true) { model.pickPaidFrom($0) }
                        .accessibilityLabel(language.t("common:paidFrom.label"))
                    if paidInfo { InfoBox(lines: model.sources.map { language.t("common:paidFrom.\($0)Info") }) }
                }
            }
            FormRow(label: language.t("transactions:form.description"), suggested: model.marks.contains("description")) {
                TextField(language.t("transactions:form.placeholder.\(model.kind)"),
                          text: Binding(get: { model.description }, set: { model.setDescription($0) }))
                    .fieldStyle()
            }
            FormRow(label: model.mode == .rule ? language.t("recurring:repeat.nextCharge") : language.t("transactions:form.date"),
                    required: true, suggested: model.marks.contains("date"), error: model.errors["date"], help: model.dateHelp) {
                DayField(label: language.t("transactions:form.date"),
                         iso: Binding(get: { model.date }, set: { model.changeDate($0) }))
            }
            if model.mode != .rule {
                FormRow(label: language.t("transactions:form.notes")) {
                    TextField("", text: $model.notes, axis: .vertical)
                        .lineLimit(3...6)
                        .padding(.vertical, Theme.Space.s2)
                        .frame(minHeight: 80, alignment: .topLeading)
                        .fieldStyle()
                }
            }
        }
    }

    @ViewBuilder private var kindField: some View {
        if model.mode == .edit {
            VStack(alignment: .leading, spacing: Theme.Space.s2) {
                FieldLabel(text: language.t("transactions:form.type"))
                HStack(spacing: 2) {
                    Text(language.t("transactions:kinds.\(model.kind)")).kitText(16, .semibold)
                    InfoButton(open: $kindInfo, label: language.t("common:info"))
                }
                if kindInfo { InfoBox(lines: [language.t("transactions:form.kindFixed.\(model.kind)")]) }
            }
        } else {
            SegmentedControl(options: [("expense", language.t("transactions:kinds.expense")),
                                       ("income", language.t("transactions:kinds.income"))],
                             value: model.kind, size: .sm, fitted: true) { kind in Task { await model.pickKind(kind) } }
                .accessibilityLabel(language.t("transactions:form.kind"))
                .accessibilityIdentifier("entry.kind")
        }
    }

    private var categoryField: some View {
        FormRow(label: language.t("transactions:form.category"), suggested: model.marks.contains("category")) {
            SelectMenu(options: [("", language.t("transactions:uncategorized"))] + model.categoryOptions.map { ($0.id, $0.name) },
                       value: model.categoryId, label: language.t("transactions:form.category")) { model.pickCategory($0) }
                .accessibilityIdentifier("entry.category")
        }
    }

    // MARK: The Repeat card (RepeatPanel + RepeatFields)

    @ViewBuilder private var repeatCard: some View {
        VStack(alignment: .leading, spacing: 0) {
            CardHeader(title: language.t("transactions:form.repeat.title"), icon: .repeat, subtitle: repeatSubtitle) {
                if model.mode != .rule {
                    KitSwitch(isOn: $model.repeatOn, label: language.t("transactions:form.repeat.title"))
                        .accessibilityIdentifier("entry.repeat")
                }
            }
            if model.repeatOn {
                VStack(alignment: .leading, spacing: Theme.Space.s4) {
                    if model.mode == .edit, model.pausable {
                        Note(text: language.t("transactions:form.repeat.appliesToFuture"), size: 14)
                    }
                    RepeatFieldsView(model: model)
                }
            } else if model.pausable {
                Note(text: language.t("transactions:form.repeat.stops"), size: 14)
            }
        }
    }

    private var repeatSubtitle: String {
        switch model.mode {
        case .rule: return language.t("recurring:form.repeatSubtitle")
        case .edit where model.pausable: return language.t("transactions:form.repeat.inSeries")
        default: return language.t("transactions:form.repeat.offer")
        }
    }
}

/// The schedule: how often and every N, the budgets line, the next charge
/// (not on a rule's page: its date field is it), the end date, the reminder
/// and, for a series that exists, Paused.
private struct RepeatFieldsView: View {
    @Bindable var model: EntryFormModel
    @Environment(AppLanguage.self) private var language

    var body: some View {
        VStack(alignment: .leading, spacing: Theme.Space.s4) {
            HStack(alignment: .bottom, spacing: Theme.Space.s3) {
                FormRow(label: language.t("recurring:repeat.howOften")) {
                    SelectMenu(options: model.repeatChoices.map { ($0.value, $0.label) }, value: model.repeatChoice,
                               label: language.t("recurring:repeat.howOften")) { model.editRepeat(["choice": .string($0)]) }
                }
                if model.repeatChoice != "quarterly" {
                    FormRow(label: language.t("recurring:repeat.every")) {
                        HStack(spacing: Theme.Space.s2) {
                            TextField("1", text: Binding(get: { model.repeatEvery }, set: { model.editRepeat(["n": .string($0)]) }))
                                .keyboardType(.numberPad)
                                .frame(width: 36)
                                .fieldStyle()
                                .accessibilityLabel(language.t("recurring:repeat.everyHowMany.\(model.repeatChoice)"))
                            Text(language.t("recurring:repeat.units.\(model.repeatChoice)")).kitText(14, color: Theme.Colors.textMuted)
                        }
                    }
                    .fixedSize()
                }
            }
            if let share = model.repeatShare { Note(text: share, size: 14) }
            if model.mode != .rule {
                FormRow(label: language.t("recurring:repeat.nextCharge"), help: model.repeatNextHelp) {
                    DayField(label: language.t("recurring:repeat.nextCharge"), iso: Binding(
                        get: { model.repeatNextRun }, set: { model.editRepeat(["nextRun": .string($0)]) }))
                }
            }
            VStack(alignment: .leading, spacing: Theme.Space.s2) {
                SwitchRow(label: language.t("recurring:repeat.endDate"), isOn: Binding(
                    get: { !model.repeatEndDate.isEmpty },
                    set: { on in model.editRepeat(["endDate": .string(on ? (model.repeatNextRun.isEmpty ? model.date : model.repeatNextRun) : "")]) }))
                if !model.repeatEndDate.isEmpty {
                    DayField(label: language.t("recurring:repeat.endDate"), iso: Binding(
                        get: { model.repeatEndDate }, set: { model.editRepeat(["endDate": .string($0)]) }))
                }
            }
            VStack(alignment: .leading, spacing: Theme.Space.s2) {
                SwitchRow(label: language.t("recurring:repeat.remind"), icon: .bell, isOn: Binding(
                    get: { model.repeatRemind }, set: { model.editRepeat(["remind": .bool($0)]) }))
                if model.repeatRemind {
                    HStack(spacing: Theme.Space.s2) {
                        TextField("3", text: Binding(get: { model.repeatRemindDays },
                                                     set: { model.editRepeat(["remindDays": .string($0)]) }))
                            .keyboardType(.numberPad)
                            .frame(width: 40)
                            .fieldStyle()
                            .accessibilityLabel(language.t("recurring:repeat.remindDays"))
                        Note(text: language.t("recurring:repeat.daysBefore"), size: 14)
                    }
                }
            }
            if model.pausable {
                SwitchRow(label: language.t("recurring:repeat.paused"), note: language.t("recurring:repeat.pausedHelp"),
                          isOn: Binding(get: { !model.repeatActive }, set: { model.editRepeat(["active": .bool(!$0)]) }))
            }
        }
    }
}

/// "Type it" at the top of Add: the line with its button, then Undo or the error.
private struct TypeItField: View {
    @Bindable var model: EntryFormModel
    @Environment(AppLanguage.self) private var language

    var body: some View {
        VStack(alignment: .leading, spacing: Theme.Space.s2) {
            HStack(spacing: Theme.Space.s1) {
                LucideIcon(icon: .sparkle, size: 14).foregroundStyle(Theme.Colors.accentFg)
                FieldLabel(text: language.t("ai:add.label"))
            }
            HStack(spacing: Theme.Space.s2) {
                TextField(language.t("ai:add.placeholder"), text: $model.quickText)
                    .submitLabel(.go)
                    .onSubmit { Task { await model.typeIt() } }
                    .disabled(model.quickState == .working)
                    .fieldStyle()
                Button {
                    Task { await model.typeIt() }
                } label: {
                    if model.quickState == .working {
                        ProgressView().tint(Theme.Colors.onAccent)
                    } else {
                        Text(language.t("ai:add.fill"))
                    }
                }
                .buttonStyle(.kit(.solid, .md))
                .disabled(model.quickText.trimmingCharacters(in: .whitespaces).isEmpty)
            }
            switch model.quickState {
            case .working:
                Note(text: language.t("ai:add.working"), size: 14)
            case .done:
                HStack(spacing: Theme.Space.s2) {
                    Note(text: language.t("ai:add.done"), size: 14)
                    Button(language.t("ai:add.undo")) { Task { await model.undoFill() } }
                        .buttonStyle(.kit(.link, .sm))
                }
            case .failed(let key):
                HStack(spacing: Theme.Space.s1) {
                    LucideIcon(icon: .circleAlert, size: 14)
                    Text(language.t(key)).kitText(14, color: Theme.Colors.warning)
                }
                .foregroundStyle(Theme.Colors.warning)
            case .idle:
                EmptyView()
            }
        }
    }
}

/// The exchange rate under the amount (fxPreview): one line, or the request
/// for a rate with its field and what it gives (a group expense's form too).
struct FxLine: View {
    let line: JSONValue
    @Binding var manual: String
    @Environment(AppLanguage.self) private var language

    var body: some View {
        if line["status"]?.stringValue == "missing" {
            VStack(alignment: .leading, spacing: Theme.Space.s2) {
                Note(text: line["text"]?.stringValue ?? "", tone: Theme.Colors.textPrimary, size: 14)
                FieldLabel(text: line["label"]?.stringValue ?? "", size: 14)
                TextField(language.t("common:fx.ratePlaceholder"), text: $manual)
                    .keyboardType(.decimalPad)
                    .frame(maxWidth: 160)
                    .fieldStyle()
                if let conversion = line["conversion"]?.stringValue { Note(text: conversion) }
            }
            .padding(Theme.Space.s3)
            .background(Theme.Colors.subtle)
            .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.lg, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: Theme.Radius.lg, style: .continuous).stroke(Theme.Colors.warning, lineWidth: 1))
        } else {
            HStack(spacing: Theme.Space.s2) {
                if line["status"]?.stringValue == "loading" { ProgressView().controlSize(.small) }
                Note(text: line["text"]?.stringValue ?? "")
            }
            .accessibilityIdentifier("entry.fx")
        }
    }
}
