// Plan's editors, in place (no pop-ups), after the web's PlanEditors and
// PlanWhatIf: a row's (the amount with the live delta, how often, keep or
// cancel, Reset, Done), "What if I add…"'s form, an overlap's picker, "Type a
// what-if" with its preview, and the one sheet: Apply, the real confirmation.
// Every figure and word is PlanModel's (the core's).
import SwiftUI

/// What a change does a month and a year ("You'd save · +€15.00 a month").
struct PlanDeltaTile: View {
    let delta: PlanDelta

    var body: some View {
        VStack(alignment: .trailing, spacing: 2) {
            HStack(alignment: .firstTextBaseline) {
                Text(delta.word).font(.subheadline.weight(.semibold))
                Spacer(minLength: 8)
                Text(delta.perMonth)
                    .font(NativeStyle.money(19, relativeTo: .title3))
                    .foregroundStyle(SavingsView.color(delta.tone))
                    .monospacedDigit()
                    .lineLimit(1)
                    .fixedSize()
                    .contentTransition(.numericText())
            }
            Text(delta.perYear).font(.caption).foregroundStyle(.secondary).monospacedDigit()
        }
        .padding(12)
        .background(Theme.Colors.subtle, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
        .accessibilityElement(children: .combine)
        .animation(.snappy, value: delta)
    }
}

/// How often: the Repeat choices (the rule's own "every N" first when it has one).
struct PlanFrequencyPicker: View {
    let frequency: PlanFrequency
    var disabled = false
    let pick: (String) -> Void
    @Environment(AppLanguage.self) private var language

    var body: some View {
        Picker(language.t("plan:edit.howOften"), selection: Binding(get: { frequency.value }, set: pick)) {
            ForEach(frequency.options, id: \.value) { option in Text(option.label).tag(option.value) }
        }
        .pickerStyle(.menu)
        .tint(NativeStyle.tint)
        .disabled(disabled)
    }
}

/// An amount field: the currency, the amount as typed (decimal pad).
struct PlanAmountField: View {
    let currency: String
    let text: String
    var disabled = false
    let set: (String) -> Void

    var body: some View {
        HStack(spacing: 8) {
            Text(verbatim: currency).font(.subheadline.weight(.semibold)).foregroundStyle(.secondary)
            TextField(text: Binding(get: { text }, set: set)) { Text(verbatim: "0") }
                .keyboardType(.decimalPad)
                .font(.title3.weight(.semibold))
                .monospacedDigit()
                .disabled(disabled)
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 10)
        .background(Theme.Colors.subtle, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
        .opacity(disabled ? 0.5 : 1)
    }
}

/// A small caption over a field.
private struct PlanFieldLabel: View {
    let text: String

    var body: some View {
        Text(text).font(.footnote.weight(.semibold)).foregroundStyle(.secondary)
    }
}

// MARK: A row's editor

struct PlanEditorView: View {
    let model: PlanModel
    let editor: PlanEditor
    @Environment(AppLanguage.self) private var language

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            if let signal = editor.signal {
                HStack(alignment: .firstTextBaseline, spacing: 8) {
                    PlanTagView(tag: signal.tag)
                    Text(signal.text).font(.footnote).foregroundStyle(.secondary)
                }
            }
            if let note = editor.note {
                Label(note, systemImage: "info.circle").font(.footnote).foregroundStyle(.secondary)
            }
            VStack(alignment: .leading, spacing: 4) {
                PlanFieldLabel(text: language.t("plan:edit.amount"))
                PlanAmountField(currency: editor.currency, text: model.editText, disabled: editor.cancelled) {
                    model.setAmount($0)
                }
                .accessibilityIdentifier("plan.editAmount")
                Text(editor.help).font(.caption).foregroundStyle(.secondary)
            }
            if let frequency = editor.frequency {
                HStack {
                    PlanFieldLabel(text: language.t("plan:edit.howOften"))
                    Spacer(minLength: 8)
                    PlanFrequencyPicker(frequency: frequency, disabled: editor.cancelled) { model.setFrequency($0) }
                }
            }
            PlanDeltaTile(delta: editor.delta)
            VStack(alignment: .leading, spacing: 6) {
                PlanFieldLabel(text: language.t("plan:edit.inPlan"))
                Picker(language.t("plan:edit.inPlan"),
                       selection: Binding(get: { editor.cancelled ? "cancel" : "keep" },
                                          set: { value in withAnimation(NativeMotion.expand) { model.setCancelled(value == "cancel") } })) {
                    ForEach(editor.keep, id: \.value) { choice in Text(choice.label).tag(choice.value) }
                }
                .pickerStyle(.segmented)
            }
            HStack {
                Button(language.t("plan:edit.reset")) { withAnimation(NativeMotion.expand) { model.reset() } }
                    .buttonStyle(.borderless)
                    .foregroundStyle(NativeStyle.tint)
                    .disabled(!editor.canReset)
                Spacer()
                Button(language.t("plan:edit.done")) { withAnimation(NativeMotion.expand) { model.close() } }
                    .buttonStyle(.borderedProminent)
                    .tint(NativeStyle.solid)
                    .accessibilityIdentifier("plan.editDone")
            }
        }
        .padding(.vertical, 8)
        .listRowBackground(Theme.Colors.subtle.opacity(0.5))
    }
}

// MARK: What if I add…

struct PlanAddFormView: View {
    let model: PlanModel
    let form: PlanAddForm
    @Environment(AppLanguage.self) private var language

    private func field(_ key: String) -> String { model.addFields[key]?.stringValue ?? "" }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Picker(language.t("plan:add.kind"), selection: Binding(get: { field("kind") }, set: { model.setAddKind($0) })) {
                ForEach(form.kinds, id: \.value) { kind in Text(kind.label).tag(kind.value) }
            }
            .pickerStyle(.segmented)
            VStack(alignment: .leading, spacing: 4) {
                PlanFieldLabel(text: language.t("plan:add.name"))
                TextField(form.placeholder, text: Binding(get: { field("name") }, set: { model.setAddName($0) }))
                    .padding(.horizontal, 12)
                    .padding(.vertical, 10)
                    .background(Theme.Colors.subtle, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                    .accessibilityIdentifier("plan.addName")
            }
            HStack(alignment: .bottom, spacing: 10) {
                VStack(alignment: .leading, spacing: 4) {
                    PlanFieldLabel(text: language.t("plan:add.amount"))
                    PlanAmountField(currency: field("currency"), text: field("text")) { model.setAddAmount($0) }
                        .accessibilityIdentifier("plan.addAmount")
                }
                Picker(language.t("plan:add.currency"),
                       selection: Binding(get: { field("currency") }, set: { model.setAddCurrency($0) })) {
                    ForEach(model.currencyOptions, id: \.self) { code in Text(verbatim: code).tag(code) }
                }
                .pickerStyle(.menu)
                .tint(NativeStyle.tint)
            }
            HStack {
                PlanFieldLabel(text: language.t("plan:edit.howOften"))
                Spacer(minLength: 8)
                PlanFrequencyPicker(frequency: form.frequency) { model.setAddFrequency($0) }
            }
            DatePicker(selection: Binding(get: { ISODay.date(field("start")) ?? Date() },
                                          set: { model.setAddStart(ISODay.string($0)) }),
                       in: (ISODay.date(model.todayISO) ?? Date())...,
                       displayedComponents: .date) {
                PlanFieldLabel(text: language.t("plan:add.starts"))
            }
            HStack {
                PlanFieldLabel(text: form.categoryLabel)
                Spacer(minLength: 8)
                Picker(form.categoryLabel, selection: Binding(get: { field("categoryId") }, set: { model.setAddCategory($0) })) {
                    if let none = form.noCategory { Text(none).tag("") }
                    ForEach(form.categories) { category in Text(category.label).tag(category.id) }
                }
                .pickerStyle(.menu)
                .tint(NativeStyle.tint)
            }
            PlanDeltaTile(delta: form.delta)
            HStack {
                Button(language.t("common:actions.cancel")) { withAnimation(NativeMotion.expand) { model.close() } }
                    .buttonStyle(.borderless)
                    .foregroundStyle(NativeStyle.tint)
                Spacer()
                Button(form.submit) { withAnimation(NativeMotion.expand) { model.saveAdd() } }
                    .buttonStyle(.borderedProminent)
                    .tint(NativeStyle.solid)
                    .disabled(!form.ready)
                    .accessibilityIdentifier("plan.addSave")
            }
        }
        .padding(.vertical, 8)
        .listRowBackground(Theme.Colors.subtle.opacity(0.5))
    }
}

// MARK: An overlap's picker

struct PlanPickSection: View {
    let model: PlanModel
    let pick: PlanPick
    @Environment(AppLanguage.self) private var language

    var body: some View {
        Section {
            ForEach(pick.rows) { row in
                Button {
                    withAnimation(NativeMotion.expand) { model.togglePick(row.id) }
                } label: {
                    HStack(spacing: 12) {
                        Image(systemName: row.picked ? "checkmark.circle.fill" : "circle")
                            .font(.title3)
                            .foregroundStyle(row.picked ? NativeStyle.tint : Color.secondary)
                        CategoryBadge(look: row.look, size: 32)
                        VStack(alignment: .leading, spacing: 2) {
                            Text(row.name).font(.body.weight(.semibold)).lineLimit(2)
                            Text(row.perYear).font(.footnote).foregroundStyle(.secondary)
                        }
                        Spacer(minLength: 8)
                        Text(row.perMonth).font(.subheadline.weight(.semibold)).monospacedDigit().lineLimit(1).fixedSize()
                    }
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityAddTraits(row.picked ? .isSelected : [])
            }
            VStack(alignment: .trailing, spacing: 2) {
                HStack(alignment: .firstTextBaseline) {
                    Text(pick.summary.label).font(.subheadline.weight(.semibold))
                    Spacer(minLength: 8)
                    Text(pick.summary.amount)
                        .font(NativeStyle.money(19, relativeTo: .title3))
                        .foregroundStyle(SavingsView.color(pick.summary.tone))
                        .monospacedDigit()
                        .lineLimit(1)
                        .fixedSize()
                }
                Text(pick.summary.sub).font(.caption).foregroundStyle(.secondary)
            }
            HStack {
                Button(language.t("common:actions.cancel")) { withAnimation(NativeMotion.expand) { model.close() } }
                    .buttonStyle(.borderless)
                    .foregroundStyle(NativeStyle.tint)
                Spacer()
                Button(pick.add) { withAnimation(NativeMotion.expand) { model.addPicked() } }
                    .buttonStyle(.borderedProminent)
                    .tint(NativeStyle.solid)
                    .disabled(pick.picked.isEmpty)
                    .accessibilityIdentifier("plan.pickAdd")
            }
        } header: {
            VStack(alignment: .leading, spacing: 2) {
                Text(pick.title).font(.headline).foregroundStyle(Color.primary)
                Text(language.t("plan:pick.sub")).font(.footnote).foregroundStyle(.secondary)
            }
            .textCase(nil)
            .padding(.horizontal, -4)
        }
        .listRowBackground(NativeStyle.card)
    }
}

// MARK: Type a what-if

struct PlanWhatIfSection: View {
    let model: PlanModel
    @Environment(AppLanguage.self) private var language
    @State private var info = false

    var body: some View {
        Section {
            HStack(spacing: 8) {
                TextField(language.t("plan:typeIt.placeholder"),
                          text: Binding(get: { model.whatIfText }, set: { model.setWhatIfText($0) }))
                    .submitLabel(.go)
                    .onSubmit { Task { await model.askWhatIf() } }
                    .disabled(model.whatIf == .working)
                    .accessibilityIdentifier("plan.typeIt")
                Button {
                    Task { await model.askWhatIf() }
                } label: {
                    if model.whatIf == .working {
                        ProgressView()
                    } else {
                        Image(systemName: "arrow.right.circle.fill").font(.title2)
                    }
                }
                .buttonStyle(.borderless)
                .foregroundStyle(NativeStyle.tint)
                .disabled(model.whatIfText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                .accessibilityLabel(Text(language.t("plan:typeIt.go")))
            }
            if info {
                Text(language.t("plan:typeIt.more")).font(.footnote).foregroundStyle(.secondary)
            }
            if model.isDemo {
                Label(language.t("ai:demoNote"), systemImage: "flask").font(.footnote).foregroundStyle(.secondary)
            }
            status
            if model.whatIf == .preview, let preview = model.whatIfPreview { previewRows(preview) }
        } header: {
            HStack(spacing: 6) {
                Label(language.t("plan:typeIt.label"), systemImage: "sparkle")
                    .font(.headline)
                    .foregroundStyle(Color.primary)
                Button {
                    withAnimation(NativeMotion.expand) { info.toggle() }
                } label: {
                    Image(systemName: info ? "info.circle.fill" : "info.circle")
                }
                .buttonStyle(.borderless)
                .foregroundStyle(NativeStyle.tint)
                .accessibilityLabel(Text(language.t("ai:settings.noteLabel")))
            }
            .textCase(nil)
            .padding(.horizontal, -4)
        }
        .listRowBackground(NativeStyle.card)
    }

    @ViewBuilder private var status: some View {
        switch model.whatIf {
        case .working:
            Label(language.t("plan:typeIt.working"), systemImage: "ellipsis").font(.footnote).foregroundStyle(.secondary)
        case .failed(let words):
            Label(words, systemImage: "exclamationmark.circle").font(.footnote).foregroundStyle(NativeStyle.warning)
        case .added:
            HStack {
                Text(model.whatIfAddedText ?? "").font(.footnote).foregroundStyle(.secondary)
                Spacer(minLength: 8)
                Button(language.t("plan:typeIt.undo")) { withAnimation(NativeMotion.expand) { model.undoWhatIf() } }
                    .buttonStyle(.borderless)
                    .foregroundStyle(NativeStyle.tint)
            }
        default:
            EmptyView()
        }
    }

    @ViewBuilder
    private func previewRows(_ preview: PlanWhatIf) -> some View {
        Text(language.t("plan:typeIt.check")).font(.footnote).foregroundStyle(.secondary)
        ForEach(preview.rows) { row in
            HStack(alignment: .top, spacing: 10) {
                Button {
                    model.toggleWhatIf(row.id)
                } label: {
                    Image(systemName: row.picked ? "checkmark.circle.fill" : "circle")
                        .font(.title3)
                        .foregroundStyle(row.picked ? NativeStyle.tint : Color.secondary)
                }
                .buttonStyle(.borderless)
                .accessibilityLabel(Text(row.pickLabel))
                CategoryBadge(look: row.look, size: 32).opacity(row.picked ? 1 : 0.5)
                VStack(alignment: .leading, spacing: 2) {
                    HStack(spacing: 6) {
                        Text(row.name).font(.body.weight(.semibold)).lineLimit(1)
                        if row.suggested {
                            Label(language.t("ai:suggested"), systemImage: "sparkle")
                                .font(.caption.weight(.semibold))
                                .foregroundStyle(NativeStyle.tint)
                        }
                    }
                    Text(row.line).font(.footnote).foregroundStyle(.secondary)
                }
                .opacity(row.picked ? 1 : 0.6)
                Spacer(minLength: 4)
                Button(model.whatIfEditing == row.id ? language.t("plan:edit.done") : language.t("plan:typeIt.edit")) {
                    withAnimation(NativeMotion.expand) { model.editWhatIf(row.id) }
                }
                .buttonStyle(.borderless)
                .foregroundStyle(NativeStyle.tint)
                .accessibilityLabel(Text(row.editLabel))
            }
            if model.whatIfEditing == row.id, let editor = model.whatIfEditor { rowEditor(editor) }
        }
        if let notFound = preview.notFound {
            Text(notFound).font(.footnote).foregroundStyle(.secondary)
        }
        HStack {
            Button(language.t("common:actions.cancel")) { withAnimation(NativeMotion.expand) { model.cancelWhatIf() } }
                .buttonStyle(.borderless)
                .foregroundStyle(NativeStyle.tint)
            Spacer()
            Button(preview.add) { withAnimation(NativeMotion.expand) { model.addWhatIf() } }
                .buttonStyle(.borderedProminent)
                .tint(NativeStyle.solid)
                .disabled(preview.ready == 0)
                .accessibilityIdentifier("plan.typeItAdd")
        }
    }

    /// A proposal's fields in place: its name (a new one) or change / cancel, the amount, how often.
    private func rowEditor(_ editor: PlanWhatIfEditor) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            if editor.add {
                TextField(language.t("plan:add.name"),
                          text: Binding(get: { model.whatIfEditingName }, set: { model.setWhatIfName($0) }))
                    .padding(.horizontal, 12)
                    .padding(.vertical, 10)
                    .background(Theme.Colors.subtle, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
            } else {
                Picker(language.t("plan:edit.inPlan"),
                       selection: Binding(get: { editor.choice }, set: { model.setWhatIfCancelled($0 == "cancel") })) {
                    ForEach(editor.choices, id: \.value) { choice in Text(choice.label).tag(choice.value) }
                }
                .pickerStyle(.segmented)
            }
            PlanAmountField(currency: editor.currency, text: model.whatIfEditText, disabled: editor.cancelled) {
                model.setWhatIfAmount($0)
            }
            HStack {
                PlanFieldLabel(text: language.t("plan:edit.howOften"))
                Spacer(minLength: 8)
                PlanFrequencyPicker(frequency: editor.frequency, disabled: editor.cancelled) { model.setWhatIfFrequency($0) }
            }
        }
        .padding(.vertical, 6)
        .padding(.leading, 44)
    }
}

// MARK: The Apply sheet

/// Pick, then confirm: every change ticked, the figure after applying, the
/// warning before the button; a derived row's change stays in the plan.
struct PlanApplySheet: View {
    let model: PlanModel
    @Environment(AppLanguage.self) private var language

    var body: some View {
        NavigationStack {
            if let sheet = model.applySheet {
                List {
                    Section {
                        ForEach(sheet.rows) { row in
                            Toggle(isOn: Binding(get: { row.on }, set: { _ in model.toggleApply(row.id) })) {
                                HStack(spacing: 12) {
                                    CategoryBadge(look: row.look, size: 32)
                                    VStack(alignment: .leading, spacing: 2) {
                                        Text(row.name).font(.body.weight(.semibold)).lineLimit(2)
                                        Text(row.line).font(.footnote).foregroundStyle(.secondary)
                                    }
                                    Spacer(minLength: 6)
                                    Text(row.amount.text)
                                        .font(.subheadline.weight(.semibold))
                                        .foregroundStyle(SavingsView.color(row.amount.tone))
                                        .monospacedDigit()
                                        .lineLimit(1)
                                        .fixedSize()
                                }
                            }
                            .tint(NativeStyle.positive)
                        }
                        ForEach(sheet.kept) { note in
                            Label(note.text, systemImage: "info.circle").font(.footnote).foregroundStyle(.secondary)
                        }
                    } header: {
                        Text(language.t("plan:apply.sub")).textCase(nil)
                    }
                    .listRowBackground(NativeStyle.card)
                    Section {
                        HStack {
                            Text(sheet.after.label).foregroundStyle(.secondary)
                            Spacer(minLength: 8)
                            Text(sheet.after.value).fontWeight(.semibold).monospacedDigit().lineLimit(1).fixedSize()
                        }
                        Label {
                            VStack(alignment: .leading, spacing: 4) {
                                Text(language.t("plan:apply.warnTitle")).font(.subheadline.weight(.bold))
                                Text(language.t("plan:apply.warnBody")).font(.footnote)
                            }
                        } icon: {
                            Image(systemName: "exclamationmark.triangle.fill").foregroundStyle(NativeStyle.warning)
                        }
                        .listRowBackground(NativeStyle.warning.opacity(0.12))
                    }
                    .listRowBackground(NativeStyle.card)
                    Section {
                        VStack(spacing: 10) {
                            Button {
                                Task { await model.apply() }
                            } label: {
                                HStack {
                                    if model.busy { ProgressView().tint(Color.white) }
                                    Text(sheet.submit)
                                }
                                .frame(maxWidth: .infinity)
                            }
                            .nativeGlassButton(prominent: true)
                            .disabled(sheet.picked.isEmpty || model.busy)
                            .accessibilityIdentifier("plan.applySubmit")
                            Button {
                                model.closeApply()
                            } label: {
                                Text(language.t("plan:apply.notNow")).frame(maxWidth: .infinity)
                            }
                            .nativeGlassButton()
                        }
                        .listRowBackground(Color.clear)
                        .listRowInsets(EdgeInsets(top: 0, leading: 0, bottom: 0, trailing: 0))
                    }
                }
                .listStyle(.insetGrouped)
                .scrollContentBackground(.hidden)
                .background(NativeStyle.canvas)
                .navigationTitle(language.t("plan:apply.title"))
                .navigationBarTitleDisplayMode(.inline)
            }
        }
        .presentationDetents([.medium, .large])
        .presentationDragIndicator(.visible)
    }
}
