// The one entry form, laid out as the web's EntryFields + Repeat card, in
// the same order and with the same words: Type it (when its switch is on),
// Expense | Income (a label once saved), Amount + Currency and the exchange
// rate, Category, "Taken from my income" (savings income), Paid from,
// Description, Date (a rule's next charge), Notes; then the Repeat card.
// Everything it shows is EntryFormModel's (the core's answers); `onDone`
// closes it (true once saved or deleted).
import SwiftUI

@MainActor
struct EntryFormView: View {
    @Bindable var model: EntryFormModel
    let onDone: (Bool) -> Void
    @Environment(AppLanguage.self) private var language
    @State private var confirmDelete = false

    var body: some View {
        NavigationStack {
            Group {
                if model.ready {
                    form
                } else if let error = model.loadError {
                    ScrollView {
                        Panel { LoadErrorBlock(message: error) { await model.load() } }.padding(Theme.Space.s4)
                    }
                } else {
                    LoadingView()
                }
            }
            .background(Theme.Colors.canvas.ignoresSafeArea())
            .navigationTitle(model.ready ? model.title : "")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(language.t("common:actions.cancel")) { onDone(false) }
                }
            }
        }
        .tint(Theme.Colors.accentFg)
        .task(id: language.current) { if !model.ready { await model.load() } }
    }

    private var form: some View {
        ScrollView {
            VStack(spacing: Theme.Space.s4) {
                if let notice = model.notice {
                    Note(text: notice, tone: Theme.Colors.warning)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .accessibilityIdentifier("entry.notice")
                }
                Panel { fields }
                Panel { repeatCard }
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
                        Label(language.t("common:actions.delete"), systemImage: "trash")
                    }
                    .buttonStyle(DangerButtonStyle())
                    .accessibilityIdentifier("entry.delete")
                }
            }
            .padding(Theme.Space.s4)
        }
        .scrollDismissesKeyboard(.interactively)
        .confirmationDialog(model.deleteTitle, isPresented: $confirmDelete, titleVisibility: .visible) {
            Button(language.t("common:actions.delete"), role: .destructive) {
                Task { if await model.delete() { onDone(true) } }
            }
            Button(language.t("common:actions.cancel"), role: .cancel) {}
        } message: {
            Text(model.deleteBody)
        }
    }

    // MARK: The entry's fields (EntryFields)

    @ViewBuilder private var fields: some View {
        VStack(alignment: .leading, spacing: Theme.Space.s4) {
            if model.quickOn { TypeItField(model: model) }
            kindField
            HStack(alignment: .top, spacing: Theme.Space.s3) {
                FormRow(label: language.t("transactions:form.amount") + " *", suggested: model.marks.contains("amount"),
                        error: model.errors["amount"]) {
                    TextField(model.amountHints.placeholder, text: Binding(get: { model.amount }, set: { model.setAmount($0) }))
                        .keyboardType(model.amountHints.whole ? .numberPad : .decimalPad)
                        .fieldStyle()
                        .accessibilityIdentifier("entry.amount")
                }
                FormRow(label: language.t("transactions:form.currency")) {
                    Menu {
                        Picker(language.t("transactions:form.currency"), selection: Binding(
                            get: { model.currency }, set: { model.pickCurrency($0) })) {
                            ForEach(model.currencyOptions, id: \.self) { Text($0).tag($0) }
                        }
                    } label: {
                        HStack {
                            Text(model.currency)
                            Spacer(minLength: 0)
                            Image(systemName: "chevron.up.chevron.down").font(.system(size: 11))
                        }
                        .fieldStyle()
                    }
                }
                .frame(width: 110)
            }
            if model.mode == .rule, model.currency != model.baseCurrency {
                Note(text: language.t("recurring:form.eachChargeRate"))
            } else if let line = model.fxLine {
                FxLine(line: line, manual: $model.manualRate)
            }
            categoryField
            if model.isSavings {
                SwitchRow(label: language.t("common:savingsSwitch.fromIncome.label"),
                          note: language.t("common:savingsSwitch.fromIncome.hint"), isOn: $model.fromIncome)
            }
            if !model.sources.isEmpty {
                FormRow(label: language.t("common:paidFrom.label"), suggested: model.marks.contains("paidFrom")) {
                    Picker(language.t("common:paidFrom.label"), selection: Binding(
                        get: { model.shownPaidFrom }, set: { model.pickPaidFrom($0) })) {
                        ForEach(model.sources, id: \.self) { Text(language.t("common:paidFrom.\($0)")).tag($0) }
                    }
                    .pickerStyle(.segmented)
                }
            }
            FormRow(label: language.t("transactions:form.description"), suggested: model.marks.contains("description")) {
                TextField(language.t("transactions:form.placeholder.\(model.kind)"),
                          text: Binding(get: { model.description }, set: { model.setDescription($0) }))
                    .fieldStyle()
            }
            FormRow(label: (model.mode == .rule ? language.t("recurring:repeat.nextCharge") : language.t("transactions:form.date")) + " *",
                    suggested: model.marks.contains("date"), error: model.errors["date"], help: model.dateHelp) {
                DayField(label: language.t("transactions:form.date"),
                         iso: Binding(get: { model.date }, set: { model.changeDate($0) }))
            }
            if model.mode != .rule {
                FormRow(label: language.t("transactions:form.notes")) {
                    TextField("", text: $model.notes, axis: .vertical)
                        .lineLimit(2...4)
                        .padding(.vertical, Theme.Space.s2)
                        .fieldStyle()
                }
            }
        }
    }

    @ViewBuilder private var kindField: some View {
        if model.mode == .edit {
            FormRow(label: language.t("transactions:form.type"),
                    help: language.t("transactions:form.kindFixed.\(model.kind)")) {
                Text(language.t("transactions:kinds.\(model.kind)"))
                    .font(Theme.Fonts.body(16, weight: .semibold, lang: language.current))
                    .foregroundStyle(Theme.Colors.textPrimary)
            }
        } else {
            Picker(language.t("transactions:form.kind"), selection: Binding(
                get: { model.kind }, set: { kind in Task { await model.pickKind(kind) } })) {
                Text(language.t("transactions:kinds.expense")).tag("expense")
                Text(language.t("transactions:kinds.income")).tag("income")
            }
            .pickerStyle(.segmented)
            .accessibilityIdentifier("entry.kind")
        }
    }

    private var categoryField: some View {
        FormRow(label: language.t("transactions:form.category"), suggested: model.marks.contains("category")) {
            Menu {
                Picker(language.t("transactions:form.category"), selection: Binding(
                    get: { model.categoryId }, set: { model.pickCategory($0) })) {
                    Text(language.t("transactions:uncategorized")).tag("")
                    ForEach(model.categoryOptions, id: \.id) { option in
                        Text(option.name).tag(option.id)
                    }
                }
            } label: {
                HStack {
                    Text(model.categoryOptions.first { $0.id == model.categoryId }?.name
                         ?? language.t("transactions:uncategorized"))
                        .lineLimit(1)
                    Spacer(minLength: 0)
                    Image(systemName: "chevron.up.chevron.down").font(.system(size: 11))
                }
                .fieldStyle()
            }
            .accessibilityIdentifier("entry.category")
        }
    }

    // MARK: The Repeat card (RepeatPanel + RepeatFields)

    @ViewBuilder private var repeatCard: some View {
        VStack(alignment: .leading, spacing: Theme.Space.s4) {
            HStack(alignment: .top, spacing: Theme.Space.s3) {
                IconTile(systemName: "repeat", tone: Theme.Colors.accentFg)
                VStack(alignment: .leading, spacing: 2) {
                    Text(language.t("transactions:form.repeat.title"))
                        .font(Theme.Fonts.heading(16, weight: .semibold, lang: language.current))
                        .foregroundStyle(Theme.Colors.textPrimary)
                    Text(repeatSubtitle)
                        .font(Theme.Fonts.body(13, lang: language.current))
                        .foregroundStyle(Theme.Colors.textMuted)
                }
                Spacer(minLength: 0)
                if model.mode != .rule {
                    Toggle(language.t("transactions:form.repeat.title"), isOn: $model.repeatOn)
                        .labelsHidden()
                        .tint(Theme.Colors.accentSolid)
                        .accessibilityIdentifier("entry.repeat")
                }
            }
            if model.repeatOn {
                if model.mode == .edit, model.pausable {
                    Note(text: language.t("transactions:form.repeat.appliesToFuture"))
                }
                RepeatFieldsView(model: model)
            } else if model.pausable {
                Note(text: language.t("transactions:form.repeat.stops"))
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
                    Picker(language.t("recurring:repeat.howOften"), selection: Binding(
                        get: { model.repeatChoice }, set: { model.editRepeat(["choice": .string($0)]) })) {
                        ForEach(model.repeatChoices, id: \.value) { Text($0.label).tag($0.value) }
                    }
                    .pickerStyle(.menu)
                    .tint(Theme.Colors.textPrimary)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .fieldStyle()
                }
                if model.repeatChoice != "quarterly" {
                    FormRow(label: language.t("recurring:repeat.every")) {
                        HStack(spacing: Theme.Space.s2) {
                            TextField("1", text: Binding(get: { model.repeatEvery }, set: { model.editRepeat(["n": .string($0)]) }))
                                .keyboardType(.numberPad)
                                .frame(width: 44)
                                .fieldStyle()
                                .accessibilityLabel(language.t("recurring:repeat.everyHowMany.\(model.repeatChoice)"))
                            Text(language.t("recurring:repeat.units.\(model.repeatChoice)"))
                                .font(Theme.Fonts.body(14, lang: language.current))
                                .foregroundStyle(Theme.Colors.textMuted)
                        }
                    }
                    .fixedSize()
                }
            }
            if let share = model.repeatShare { Note(text: share) }
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
                SwitchRow(label: language.t("recurring:repeat.remind"), systemImage: "bell", isOn: Binding(
                    get: { model.repeatRemind }, set: { model.editRepeat(["remind": .bool($0)]) }))
                if model.repeatRemind {
                    HStack(spacing: Theme.Space.s2) {
                        TextField("3", text: Binding(get: { model.repeatRemindDays },
                                                     set: { model.editRepeat(["remindDays": .string($0)]) }))
                            .keyboardType(.numberPad)
                            .frame(width: 56)
                            .fieldStyle()
                            .accessibilityLabel(language.t("recurring:repeat.remindDays"))
                        Note(text: language.t("recurring:repeat.daysBefore"))
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

/// "Type it" at the top of Add: the line, Fill, then Undo or the error.
private struct TypeItField: View {
    @Bindable var model: EntryFormModel
    @Environment(AppLanguage.self) private var language

    var body: some View {
        VStack(alignment: .leading, spacing: Theme.Space.s2) {
            HStack(spacing: Theme.Space.s1) {
                Image(systemName: "sparkle").foregroundStyle(Theme.Colors.accentFg)
                FieldLabel(text: language.t("ai:add.label"))
            }
            HStack(spacing: Theme.Space.s2) {
                TextField(language.t("ai:add.placeholder"), text: $model.quickText)
                    .submitLabel(.go)
                    .onSubmit { Task { await model.typeIt() } }
                    .disabled(model.quickState == .working)
                Button {
                    Task { await model.typeIt() }
                } label: {
                    if model.quickState == .working {
                        ProgressView()
                    } else {
                        Image(systemName: "arrow.right")
                    }
                }
                .accessibilityLabel(language.t("ai:add.fill"))
                .disabled(model.quickText.trimmingCharacters(in: .whitespaces).isEmpty)
            }
            .fieldStyle()
            switch model.quickState {
            case .working:
                Note(text: language.t("ai:add.working"))
            case .done:
                HStack(spacing: Theme.Space.s2) {
                    Note(text: language.t("ai:add.done"))
                    Button(language.t("ai:add.undo")) { Task { await model.undoFill() } }
                        .font(Theme.Fonts.body(13, weight: .semibold, lang: language.current))
                        .foregroundStyle(Theme.Colors.accentFg)
                }
            case .failed(let key):
                Label(language.t(key), systemImage: "exclamationmark.circle")
                    .font(Theme.Fonts.body(13, lang: language.current))
                    .foregroundStyle(Theme.Colors.warning)
            case .idle:
                EmptyView()
            }
        }
    }
}

/// The exchange rate under the amount (fxPreview): one line, or the request
/// for a rate with its field and what it gives.
private struct FxLine: View {
    let line: JSONValue
    @Binding var manual: String
    @Environment(AppLanguage.self) private var language

    var body: some View {
        if line["status"]?.stringValue == "missing" {
            VStack(alignment: .leading, spacing: Theme.Space.s2) {
                Note(text: line["text"]?.stringValue ?? "", tone: Theme.Colors.textPrimary)
                FieldLabel(text: line["label"]?.stringValue ?? "")
                TextField(language.t("common:fx.ratePlaceholder"), text: $manual)
                    .keyboardType(.decimalPad)
                    .frame(maxWidth: 160)
                    .fieldStyle()
                if let conversion = line["conversion"]?.stringValue { Note(text: conversion) }
            }
            .padding(Theme.Space.s3)
            .background(Theme.Colors.subtle)
            .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.md))
            .overlay(RoundedRectangle(cornerRadius: Theme.Radius.md).stroke(Theme.Colors.warning, lineWidth: 1))
        } else {
            HStack(spacing: Theme.Space.s2) {
                if line["status"]?.stringValue == "loading" { ProgressView().controlSize(.small) }
                Note(text: line["text"]?.stringValue ?? "")
            }
            .accessibilityIdentifier("entry.fx")
        }
    }
}
