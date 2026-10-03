// Add (and Edit, and a recurring rule) as a sheet, amount first. Collapsed
// (two thirds of the screen): the big amount, the date and currency, the
// number pad, then the category chips; on a new expense, Scan a receipt
// (ReceiptCard: the phone reads it, the check fills the form). Pulled up (the large detent), the
// pad steps aside for the details: "Type it" (when its helper is on), what
// it was for, "Who's it for?" (a group turns the sheet into that group's
// quick form, carrying what was typed), taken from income, Paid from,
// Repeat, Notes, and Delete on an edit. Swipe down to cancel; Save taps
// and closes. Everything it shows is EntryFormModel's (the core's).
import SwiftUI
import BudgeerCore

extension PresentationDetent {
    /// Add's collapsed height: the amount, the pad and the chips.
    static let nativeAdd = PresentationDetent.fraction(0.68)
}

extension View {
    /// The Add sheet's presentation: two detents and the grabber; on iOS
    /// 17–18 the sand canvas behind it (iOS 26 keeps the system's glass sheet).
    func nativeAddPresentation(detent: Binding<PresentationDetent>) -> some View {
        modifier(NativeAddPresentation(detent: detent))
    }
}

struct NativeAddPresentation: ViewModifier {
    @Binding var detent: PresentationDetent

    #if compiler(>=6.2)
    func body(content: Content) -> some View {
        if #available(iOS 26.0, *) {
            content
                .presentationDetents([.nativeAdd, .large], selection: $detent)
                .presentationDragIndicator(.visible)
        } else {
            content
                .presentationDetents([.nativeAdd, .large], selection: $detent)
                .presentationDragIndicator(.visible)
                .presentationBackground(NativeStyle.canvas)
                .presentationCornerRadius(28)
        }
    }
    #else
    func body(content: Content) -> some View {
        content
            .presentationDetents([.nativeAdd, .large], selection: $detent)
            .presentationDragIndicator(.visible)
            .presentationBackground(NativeStyle.canvas)
            .presentationCornerRadius(28)
    }
    #endif
}

@MainActor
struct AddSheet: View {
    let request: AddRequest
    let data: DataLayer
    let userId: String
    let groups: MyGroupsModel
    @Environment(AppLanguage.self) private var language
    @Environment(\.dismiss) private var dismiss
    @State private var entry: EntryFormModel
    @State private var groupForm: GroupExpenseModel?
    @State private var groupId: String?
    @State private var detent: PresentationDetent
    @State private var confirmDelete = false
    /// The receipt's photo (kept in memory for its thumbnail, never saved) and its pickers.
    @State private var receiptPhoto: UIImage?
    @State private var takingPhoto = false
    @State private var pickingPhoto = false

    /// Over the sidebar's frame: whole from the start, the number pad kept beside the details.
    private let wide: Bool

    /// After a save (the frame asks about push once, after the first).
    private let onSaved: () -> Void

    /// - wide: over the sidebar's frame (an iPad), where the sheet is a form
    ///   sheet that can't be pulled up: it opens whole, the details showing.
    init(request: AddRequest, data: DataLayer, userId: String, groups: MyGroupsModel, wide: Bool = false,
         onSaved: @escaping () -> Void = {}) {
        self.request = request
        self.data = data
        self.userId = userId
        self.groups = groups
        self.onSaved = onSaved
        self.wide = wide
        _entry = State(initialValue: request.model)
        let collapsed = !wide && request.model.mode == .add && request.splitting == nil
        _detent = State(initialValue: collapsed ? .nativeAdd : .large)
    }

    private var expanded: Bool { detent == .large }

    /// Pulled up on a phone, a tap on the amount lowers the sheet to the number pad.
    private var padBack: (() -> Void)? {
        expanded && !wide ? { detent = .nativeAdd } : nil
    }

    /// "Who's it for?" is offered on a new expense to someone in a group.
    private var offersGroups: Bool {
        entry.mode == .add && entry.kind == "expense" && !groups.groups.isEmpty
    }

    var body: some View {
        NavigationStack {
            Group {
                if let groupForm {
                    GroupExpenseForm(model: groupForm, compact: !expanded || wide, onAmountTap: padBack) { whoFor }
                } else if entry.ready {
                    form
                } else if let error = entry.loadError {
                    NativeFailed(message: error) { await entry.load() }
                } else {
                    NativeLoading()
                }
            }
            .navigationTitle(title)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { toolbar }
        }
        .nativeAddPresentation(detent: $detent)
        // A group's receipt check needs the room the keypad takes, as the entry's does.
        .onChange(of: groupForm?.receipt.stage) { _, stage in if stage == .check { detent = .large } }
        .task {
            if !entry.ready { await entry.load() }
            if entry.mode == .add { await groups.load() }
            if request.splitting != nil, let first = groups.groups.first?["id"]?.stringValue { pick(first) }
        }
        .confirmationDialog(entry.deleteTitle, isPresented: $confirmDelete, titleVisibility: .visible) {
            Button(language.t("common:actions.delete"), role: .destructive) {
                Task { if await entry.delete() { done() } }
            }
            Button(language.t("common:actions.cancel"), role: .cancel) {}
        } message: {
            Text(entry.deleteBody)
        }
    }

    private var title: String {
        if let groupForm { return groupForm.groupName }
        return entry.ready ? entry.title : ""
    }

    @ToolbarContentBuilder private var toolbar: some ToolbarContent {
        ToolbarItem(placement: .cancellationAction) {
            Button { dismiss() } label: { Image(systemName: "xmark") }
                .accessibilityLabel(language.t("common:actions.cancel"))
                // Esc on a keyboard closes it.
                .keyboardShortcut(.cancelAction)
        }
        if entry.mode == .add {
            ToolbarItem(placement: .principal) {
                Picker(language.t("transactions:form.kind"), selection: Binding(get: { groupForm == nil ? entry.kind : "expense" },
                                                                               set: { kind in pickKind(kind) })) {
                    Text(language.t("transactions:kinds.expense")).tag("expense")
                    Text(language.t("transactions:kinds.income")).tag("income")
                }
                .pickerStyle(.segmented)
                .frame(width: 200)
                .accessibilityIdentifier("add.kind")
            }
        }
        ToolbarItem(placement: .confirmationAction) {
            Button(language.t("common:actions.save")) { Task { await save() } }
                .fontWeight(.semibold)
                .disabled(saveDisabled)
                .accessibilityIdentifier("add.save")
        }
    }

    private var saveDisabled: Bool {
        if let groupForm { return groupForm.busy }
        return entry.busy || !entry.savingsLoaded || (entry.needsFx && entry.rate == nil)
    }

    // MARK: The entry's form

    private var form: some View {
        ScrollView {
            VStack(spacing: 14) {
                if let notice = entry.notice { NativeNotice(text: notice, warning: true).padding(.horizontal, 16) }
                if let warning = entry.repeatWarning { NativeNotice(text: warning, warning: true).padding(.horizontal, 16) }
                AmountHeader(text: entry.amountText, value: Double(entry.amountMinor),
                             color: entry.kind == "income" ? NativeStyle.positive : Color.primary,
                             error: entry.errors["amount"], suggested: entry.marks.contains("amount"), onTap: padBack) {
                    // A rule's date is its next charge, set once in the details' Next charge row.
                    if entry.mode != .rule {
                        DayPill(iso: Binding(get: { entry.date }, set: { entry.changeDate($0) }))
                    }
                    CurrencyPill(options: entry.currencyOptions, value: entry.currency) { entry.pickCurrency($0) }
                    if entry.offersReceipt, entry.receipt.stage == .idle {
                        ReceiptPill(camera: { takingPhoto = true }, library: { pickingPhoto = true })
                    }
                }
                if entry.offersReceipt, entry.receipt.stage != .idle || entry.receipt.problem != nil {
                    ReceiptCard(receipt: entry.receipt, photo: receiptPhoto) { entry.useReceipt() }
                        .padding(.horizontal, 16)
                }
                if entry.mode == .rule, entry.currency != entry.baseCurrency {
                    Text(language.t("recurring:form.eachChargeRate")).font(.footnote).foregroundStyle(.secondary)
                } else if let line = entry.fxLine {
                    FxLineView(line: line, manual: $entry.manualRate).padding(.horizontal, 16)
                }
                if !expanded || wide {
                    NumberPad(whole: entry.amountHints.whole) { entry.press($0) }
                        .transition(.move(edge: .top).combined(with: .opacity))
                }
                categoryChips
                if expanded {
                    details.transition(.opacity)
                } else {
                    Label(language.t("ios:native.add.pullUp"), systemImage: "chevron.compact.up")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                        .multilineTextAlignment(.center)
                        .padding(.horizontal, 24)
                }
            }
            .padding(.top, 6)
            .padding(.bottom, 24)
            .animation(.snappy, value: expanded)
        }
        .scrollDismissesKeyboard(.interactively)
        .modifier(ReceiptCapture(receipt: entry.receipt, camera: $takingPhoto, library: $pickingPhoto, photo: $receiptPhoto))
        // The check needs the room the keypad takes.
        .onChange(of: entry.receipt.stage, initial: true) { _, stage in if stage == .check { detent = .large } }
    }

    private var categoryChips: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ForEach(entry.categoryOptions, id: \.id) { option in
                    Chip(selected: option.id == entry.categoryId, suggested: entry.marks.contains("category")) {
                        entry.pickCategory(option.id == entry.categoryId ? "" : option.id)
                    } label: {
                        CategoryBadge(look: option.look, size: 26)
                        Text(option.name).lineLimit(1)
                    }
                }
            }
            .padding(.horizontal, 16)
        }
        .sensoryFeedback(.selection, trigger: entry.categoryId)
        .accessibilityIdentifier("add.categories")
    }

    // MARK: The details (pulled up)

    private var details: some View {
        VStack(spacing: 18) {
            if entry.quickOn { TypeItCard(model: entry) }
            NativeFormCard {
                TextField(language.t("transactions:form.placeholder.\(entry.kind)"),
                          text: Binding(get: { entry.description }, set: { entry.setDescription($0) }))
                    .padding(.vertical, 13)
                    .accessibilityIdentifier("add.description")
                if entry.mode == .rule {
                    Divider()
                    DayRow(title: language.t("recurring:repeat.nextCharge"),
                           iso: Binding(get: { entry.date }, set: { entry.changeDate($0) }))
                    if let help = entry.dateHelp { FormNote(text: help) }
                }
                if let error = entry.errors["date"] { FormNote(text: error, warning: true) }
            }
            if offersGroups { whoFor }
            if entry.isSavings || !entry.sources.isEmpty {
                NativeFormCard {
                    if entry.isSavings {
                        Toggle(language.t("common:savingsSwitch.fromIncome.label"), isOn: $entry.fromIncome)
                            .padding(.vertical, 8)
                        FormNote(text: language.t("common:savingsSwitch.fromIncome.hint"))
                    }
                    if !entry.sources.isEmpty {
                        if entry.isSavings { Divider() }
                        // Outside a Form a menu picker drops its label: the label is its own text.
                        HStack {
                            Text(language.t("common:paidFrom.label"))
                            Spacer(minLength: 12)
                            Picker(language.t("common:paidFrom.label"), selection: Binding(get: { entry.shownPaidFrom },
                                                                                          set: { entry.pickPaidFrom($0) })) {
                                ForEach(entry.sources, id: \.self) { source in
                                    Text(language.t("common:paidFrom.\(source)")).tag(source)
                                }
                            }
                            .pickerStyle(.menu)
                            .labelsHidden()
                            .fixedSize()
                        }
                        .padding(.vertical, 6)
                        FormNote(text: language.t("common:paidFrom.\(entry.shownPaidFrom)Info"))
                    }
                }
            }
            RepeatCard(model: entry)
            if entry.mode != .rule {
                NativeFormCard(title: language.t("transactions:form.notes")) {
                    TextField(language.t("transactions:form.notes"), text: $entry.notes, axis: .vertical)
                        .lineLimit(2...5)
                        .padding(.vertical, 12)
                }
            }
            if entry.mode == .edit {
                Button(role: .destructive) { confirmDelete = true } label: {
                    Label(language.t("common:actions.delete"), systemImage: "trash").frame(maxWidth: .infinity)
                }
                .nativeGlassButton()
                .accessibilityIdentifier("add.delete")
            }
        }
        .padding(.horizontal, 16)
    }

    /// "Who's it for?": Just me, then the groups (most recently used first).
    private var whoFor: some View {
        NativeFormCard(title: language.t("groups:whoFor.label")) {
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 8) {
                    Chip(selected: groupId == nil) { pick(nil) } label: {
                        Image(systemName: "person.fill")
                        Text(language.t("groups:whoFor.justMe"))
                    }
                    ForEach(groups.groups.indices, id: \.self) { index in
                        let group = groups.groups[index]
                        let id = group["id"]?.stringValue ?? ""
                        Chip(selected: groupId == id) { pick(id) } label: {
                            Image(systemName: "person.2.fill")
                            Text(group["name"]?.stringValue ?? "").lineLimit(1)
                        }
                        .accessibilityIdentifier("whoFor.\(id)")
                    }
                }
                .padding(.vertical, 10)
            }
        }
    }

    // MARK: Actions

    private func pickKind(_ kind: String) {
        if groupForm != nil {
            if kind == "income" { pick(nil, kind: "income") }
        } else {
            Task { await entry.pickKind(kind) }
        }
    }

    /// Switch between the entry and a group's quick form, carrying what was typed (carryDraft).
    private func pick(_ id: String?, kind: String = "expense") {
        guard id != groupId || kind == "income" else { return }
        let core = BudgeerCore.shared
        let draft = groupForm?.whoForDraft ?? entry.whoForDraft
        if let id, let group = groups.group(id) {
            let currency = group["currency"] ?? "EUR"
            let initial = (try? core.json("quickAddMath", "carryDraft", [draft, currency])) ?? .null
            let members = group["members"] ?? []
            let me = (try? core.json("groupFormat", "groupViewer", [group, members, JSONValue.string(userId)]))?["myMember"]?["id"]?
                .stringValue
            groupForm = GroupExpenseModel(group: group, members: members, myMemberId: me, userId: userId, expense: nil,
                                          initial: initial, quick: true, data: data)
            groupId = id
        } else {
            let initial = (try? core.json("quickAddMath", "carryDraft", [draft, JSONValue.string(entry.baseCurrency)])) ?? .null
            entry = EntryFormModel(mode: .add, kind: kind, initial: initial, data: data)
            groupForm = nil
            groupId = nil
            Task { await entry.load() }
        }
    }

    private func save() async {
        if let groupForm {
            guard await groupForm.save() else { return }
            // Split with a group: the expense now lives in the group (your share comes back as one).
            if let id = request.splitting?["id"]?.stringValue { try? await data.transactions.delete(id: id) }
            done()
        } else if await entry.save() {
            done()
        }
    }

    private func done() {
        NativeHaptics.success()
        dismiss()
        onSaved()
    }
}

// MARK: Pieces

/// The big amount and, under it, its pills (the date, the currency).
struct AmountHeader<Pills: View>: View {
    let text: String
    let value: Double
    var color: Color = .primary
    var error: String? = nil
    var suggested = false
    /// A tap on the figures brings the number pad back (nil: the pad is showing).
    var onTap: (() -> Void)? = nil
    @ViewBuilder var pills: () -> Pills

    var body: some View {
        VStack(spacing: 8) {
            Group {
                if let onTap {
                    Button(action: onTap) { figures }.buttonStyle(.plain)
                } else {
                    figures
                }
            }
            .accessibilityIdentifier("add.amount")
            if let error { Text(error).font(.footnote).foregroundStyle(NativeStyle.negative) }
            HStack(spacing: 8) { pills() }
        }
    }

    private var figures: some View {
        NativeMoney(text: text, value: value, font: NativeStyle.money(54), color: color)
            .padding(.horizontal, 20)
            .overlay(alignment: .topTrailing) {
                if suggested { Image(systemName: "sparkles").foregroundStyle(NativeStyle.tint).offset(x: 4, y: -2) }
            }
    }
}

/// A day as a pill that opens the calendar.
struct DayPill: View {
    @Binding var iso: String

    var body: some View {
        DatePicker("", selection: Binding(get: { ISODay.date(iso) ?? Date() }, set: { iso = ISODay.string($0) }),
                   displayedComponents: .date)
            .labelsHidden()
            .datePickerStyle(.compact)
            .accessibilityIdentifier("add.date")
    }
}

/// A day in a form card: its name and the compact calendar.
struct DayRow: View {
    let title: String
    @Binding var iso: String

    var body: some View {
        DatePicker(title, selection: Binding(get: { ISODay.date(iso) ?? Date() }, set: { iso = ISODay.string($0) }),
                   displayedComponents: .date)
            .padding(.vertical, 6)
    }
}

/// The currency as a pill that opens the list (the web's CurrencySelect).
struct CurrencyPill: View {
    let options: [String]
    let value: String
    let pick: (String) -> Void
    @Environment(AppLanguage.self) private var language

    var body: some View {
        Menu {
            Picker(language.t("transactions:form.currency"), selection: Binding(get: { value }, set: { pick($0) })) {
                ForEach(options, id: \.self) { Text($0).tag($0) }
            }
        } label: {
            HStack(spacing: 5) {
                Text(value)
                Image(systemName: "chevron.down").font(.caption2.weight(.bold))
            }
            .font(.subheadline.weight(.semibold))
            .foregroundStyle(Color.primary)
            .padding(.horizontal, 14)
            .frame(minHeight: 34)
            .background(Color.primary.opacity(0.07), in: Capsule())
        }
        .accessibilityLabel(language.t("transactions:form.currency"))
        .accessibilityIdentifier("add.currency")
    }
}

/// A chip: a capsule that lights in the tint when picked.
struct Chip<Label: View>: View {
    let selected: Bool
    var suggested = false
    let action: () -> Void
    @ViewBuilder var label: () -> Label

    var body: some View {
        Button(action: action) {
            HStack(spacing: 7) { label() }
                .font(.subheadline.weight(selected ? .semibold : .regular))
                .foregroundStyle(Color.primary)
                .padding(.leading, 8)
                .padding(.trailing, 12)
                .frame(minHeight: 44)
                .background(selected ? Theme.Colors.accentSubtle : NativeStyle.card, in: Capsule())
                .overlay {
                    Capsule().stroke(selected ? NativeStyle.tint : Color.primary.opacity(0.1), lineWidth: selected ? 1.5 : 0.5)
                }
                .overlay(alignment: .topTrailing) {
                    if selected && suggested {
                        Image(systemName: "sparkles").font(.caption2).foregroundStyle(NativeStyle.tint).offset(x: 2, y: -4)
                    }
                }
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(selected ? .isSelected : [])
    }
}

/// The number pad: 1–9, the decimal point (none for a currency without
/// cents), 0 and delete, a light tap on every key.
struct NumberPad: View {
    var whole = false
    let press: (String) -> Void
    @State private var taps = 0

    var body: some View {
        LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 8), count: 3), spacing: 8) {
            ForEach(["1", "2", "3", "4", "5", "6", "7", "8", "9", whole ? "" : ".", "0", "⌫"], id: \.self) { key in
                if key.isEmpty {
                    Color.clear.frame(height: 46)
                } else {
                    Button {
                        taps += 1
                        press(key)
                    } label: {
                        Group {
                            if key == "⌫" { Image(systemName: "delete.left") } else { Text(verbatim: key) }
                        }
                        .font(.system(size: 24, weight: .medium, design: .rounded))
                        .foregroundStyle(Color.primary)
                        .frame(maxWidth: .infinity, minHeight: 46)
                        .background(NativeStyle.card, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                    }
                    .buttonStyle(.plain)
                    .accessibilityIdentifier("pad.\(key)")
                }
            }
        }
        .padding(.horizontal, 16)
        .sensoryFeedback(.impact(weight: .light), trigger: taps)
    }
}

/// A rounded card of fields (an inset-grouped section inside a scroll view).
struct NativeFormCard<Content: View>: View {
    var title: String? = nil
    @ViewBuilder var content: () -> Content

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            if let title {
                Text(title.capsLabel)
                    .font(.footnote)
                    .foregroundStyle(.secondary)
                    .padding(.leading, 16)
            }
            VStack(alignment: .leading, spacing: 0) { content() }
                .padding(.horizontal, 16)
                .background(NativeStyle.card, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
        }
    }
}

/// A line of help under a field (or a warning).
struct FormNote: View {
    let text: String
    var warning = false

    var body: some View {
        Text(text)
            .font(.footnote)
            .foregroundStyle(warning ? NativeStyle.warning : Color.secondary)
            .padding(.bottom, 10)
            .fixedSize(horizontal: false, vertical: true)
    }
}

/// The exchange rate under the amount (fxPreview): one line, or the request
/// for a rate with its field and what it gives.
struct FxLineView: View {
    let line: JSONValue
    @Binding var manual: String
    @Environment(AppLanguage.self) private var language

    var body: some View {
        if line["status"]?.stringValue == "missing" {
            VStack(alignment: .leading, spacing: 6) {
                Text(line["text"]?.stringValue ?? "").font(.footnote)
                TextField(line["label"]?.stringValue ?? language.t("common:fx.ratePlaceholder"), text: $manual)
                    .keyboardType(.decimalPad)
                    .textFieldStyle(.roundedBorder)
                    .frame(maxWidth: 200)
                if let conversion = line["conversion"]?.stringValue {
                    Text(conversion).font(.footnote).foregroundStyle(.secondary)
                }
            }
            .padding(12)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(NativeStyle.warning.opacity(0.12), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
        } else {
            HStack(spacing: 6) {
                if line["status"]?.stringValue == "loading" { ProgressView().controlSize(.small) }
                Text(line["text"]?.stringValue ?? "").font(.footnote).foregroundStyle(.secondary)
            }
            .accessibilityIdentifier("add.fx")
        }
    }
}

/// "Type it": the line with its button, then Undo or the helper's error.
struct TypeItCard: View {
    @Bindable var model: EntryFormModel
    @Environment(AppLanguage.self) private var language

    var body: some View {
        NativeFormCard(title: language.t("ai:add.label")) {
            HStack(spacing: 8) {
                Image(systemName: "sparkles").foregroundStyle(NativeStyle.tint)
                TextField(language.t("ai:add.placeholder"), text: $model.quickText)
                    .submitLabel(.go)
                    .onSubmit { Task { await model.typeIt() } }
                    .disabled(model.quickState == .working)
                if model.quickState == .working {
                    ProgressView()
                } else {
                    Button(language.t("ai:add.fill")) { Task { await model.typeIt() } }
                        .fontWeight(.semibold)
                        .disabled(model.quickText.trimmingCharacters(in: .whitespaces).isEmpty)
                }
            }
            .padding(.vertical, 12)
            switch model.quickState {
            case .done:
                HStack {
                    FormNote(text: language.t("ai:add.done"))
                    Spacer()
                    Button(language.t("ai:add.undo")) { Task { await model.undoFill() } }.font(.footnote)
                        .padding(.bottom, 10)
                }
            case .failed(let key):
                FormNote(text: language.t(key), warning: true)
            case .working, .idle:
                EmptyView()
            }
        }
    }
}

/// The Repeat card (RepeatPanel + RepeatFields): the switch (always on for
/// a rule), how often and every N, the budgets line, the next charge (not
/// on a rule: its date is it), the end date, the reminder and Paused.
struct RepeatCard: View {
    @Bindable var model: EntryFormModel
    @Environment(AppLanguage.self) private var language

    var body: some View {
        NativeFormCard(title: language.t("transactions:form.repeat.title")) {
            if model.mode != .rule {
                Toggle(isOn: $model.repeatOn) {
                    Label(language.t("transactions:form.repeat.title"), systemImage: "repeat")
                }
                .padding(.vertical, 8)
                .accessibilityIdentifier("add.repeat")
            }
            if model.repeatOn {
                if model.mode == .edit, model.pausable {
                    FormNote(text: language.t("transactions:form.repeat.appliesToFuture"))
                }
                Picker(language.t("recurring:repeat.howOften"), selection: Binding(get: { model.repeatChoice },
                                                                                  set: { model.editRepeat(["choice": .string($0)]) })) {
                    ForEach(model.repeatChoices, id: \.value) { Text($0.label).tag($0.value) }
                }
                .pickerStyle(.menu)
                .padding(.vertical, 4)
                if model.repeatChoice != "quarterly" {
                    Stepper(value: Binding(get: { Int(model.repeatEvery) ?? 1 },
                                           set: { model.editRepeat(["n": .string(String($0))]) }), in: 1...99) {
                        Text(verbatim: "\(language.t("recurring:repeat.every")) \(model.repeatEvery) "
                             + language.t("recurring:repeat.units.\(model.repeatChoice)"))
                    }
                    .padding(.vertical, 4)
                }
                if let share = model.repeatShare { FormNote(text: share) }
                if model.mode != .rule {
                    Divider()
                    DayRow(title: language.t("recurring:repeat.nextCharge"),
                           iso: Binding(get: { model.repeatNextRun }, set: { model.editRepeat(["nextRun": .string($0)]) }))
                    if let help = model.repeatNextHelp { FormNote(text: help) }
                }
                Divider()
                Toggle(language.t("recurring:repeat.endDate"), isOn: Binding(
                    get: { !model.repeatEndDate.isEmpty },
                    set: { on in
                        model.editRepeat(["endDate": .string(on ? (model.repeatNextRun.isEmpty ? model.date : model.repeatNextRun) : "")])
                    }))
                    .padding(.vertical, 8)
                if !model.repeatEndDate.isEmpty {
                    DayRow(title: language.t("recurring:repeat.endDate"),
                           iso: Binding(get: { model.repeatEndDate }, set: { model.editRepeat(["endDate": .string($0)]) }))
                }
                Divider()
                Toggle(isOn: Binding(get: { model.repeatRemind }, set: { model.editRepeat(["remind": .bool($0)]) })) {
                    Label(language.t("recurring:repeat.remind"), systemImage: "bell")
                }
                .padding(.vertical, 8)
                if model.repeatRemind {
                    Stepper(value: Binding(get: { Int(model.repeatRemindDays) ?? 3 },
                                           set: { model.editRepeat(["remindDays": .string(String($0))]) }), in: 0...30) {
                        Text(verbatim: "\(model.repeatRemindDays) " + language.t("recurring:repeat.daysBefore"))
                    }
                    .padding(.vertical, 4)
                }
                if model.pausable {
                    Divider()
                    Toggle(language.t("recurring:repeat.paused"), isOn: Binding(
                        get: { !model.repeatActive }, set: { model.editRepeat(["active": .bool(!$0)]) }))
                        .padding(.vertical, 8)
                    FormNote(text: language.t("recurring:repeat.pausedHelp"))
                }
            } else if model.pausable {
                FormNote(text: language.t("transactions:form.repeat.stops"))
            } else {
                FormNote(text: language.t("transactions:form.repeat.offer"))
            }
        }
    }
}
