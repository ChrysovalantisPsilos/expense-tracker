// A group expense's form, laid out as the web's GroupExpenseForm: the
// description, the amount and its currency (with the exchange rate), the
// date, who paid, and the split (Equally · Amounts · Percent · Shares, a row
// per member with their share, the line under it). The quick layout is
// Add's when a group is picked under "Who's it for?": `lead` (the kind and
// the chips) on top, the amount first, the date and payer side by side, and
// the split folded into one card with its Adjust switch. Save (and Delete
// when editing) sit at the end. Everything it shows is GroupExpenseModel's.
import SwiftUI

@MainActor
struct GroupExpenseView<Lead: View>: View {
    @Bindable var model: GroupExpenseModel
    /// Saved or deleted: the toast's words.
    let onDone: (ToastText?) -> Void
    /// The header's back arrow (nil: back out of the group's stack).
    var back: (() -> Void)? = nil
    @ViewBuilder var lead: () -> Lead
    @Environment(AppLanguage.self) private var language
    @Environment(\.dismiss) private var dismiss
    @State private var confirmDelete = false

    var body: some View {
        Page {
            PageHeader(title: language.t(model.quick ? "transactions:page.title.shared"
                                         : model.isEdit ? "groups:expensePage.titleEdit" : "groups:expensePage.titleAdd"),
                       eyebrow: model.quick ? language.t("transactions:ledger.title") : model.groupName,
                       back: { if let back { back() } else { dismiss() } })
            VStack(spacing: Theme.Space.s5) {
                if let notice = model.notice {
                    VStack(alignment: .leading, spacing: 2) {
                        Note(text: notice.title, tone: Theme.Colors.warning)
                        if let description = notice.description { Note(text: description, tone: Theme.Colors.warning) }
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .accessibilityIdentifier("groupExpense.notice")
                }
                Panel { model.quick ? AnyView(quickFields) : AnyView(fullFields) }
                VStack(spacing: Theme.Space.s3) {
                    Button {
                        Task { if await model.save() { onDone(model.saved) } }
                    } label: {
                        if model.busy { ProgressView().tint(Theme.Colors.onAccent) } else { Text(saveLabel) }
                    }
                    .buttonStyle(PrimaryButtonStyle())
                    .disabled(model.busy)
                    .accessibilityIdentifier("groupExpense.save")
                    if model.isEdit {
                        Button { confirmDelete = true } label: {
                            IconLabel(text: language.t("common:actions.delete"), icon: .trash2)
                        }
                        .buttonStyle(DangerButtonStyle())
                    }
                }
            }
        }
        .confirmationDialog(model.deleteTitle, isPresented: $confirmDelete, titleVisibility: .visible) {
            Button(language.t("common:actions.delete"), role: .destructive) {
                Task { if await model.delete() { onDone(model.saved) } }
            }
            Button(language.t("common:actions.cancel"), role: .cancel) {}
        } message: {
            Text(model.deleteBody)
        }
    }

    private var saveLabel: String {
        if model.isEdit { return language.t("groups:form.save") }
        if model.quick { return language.t("groups:form.addTo", ["name": .string(model.groupName)]) }
        return language.t("groups:form.add")
    }

    // MARK: Layouts

    private var fullFields: some View {
        VStack(alignment: .leading, spacing: Theme.Space.s5) {
            descriptionField
            amountFields
            dateField
            payerField
            VStack(alignment: .leading, spacing: Theme.Space.s2) {
                FieldLabel(text: language.t("groups:form.split"))
                SplitEditor(model: model)
            }
        }
    }

    private var quickFields: some View {
        VStack(alignment: .leading, spacing: Theme.Space.s5) {
            lead()
            amountFields
            descriptionField
            HStack(alignment: .top, spacing: Theme.Space.s3) {
                dateField.frame(maxWidth: .infinity, alignment: .leading)
                payerField.frame(maxWidth: .infinity, alignment: .leading)
            }
            splitCard
        }
    }

    // MARK: Fields

    private var descriptionField: some View {
        FormRow(label: language.t("groups:form.description"), required: true, error: model.errors["description"]) {
            TextField(language.t("groups:form.descriptionHint"),
                      text: Binding(get: { model.form.description }, set: { model.setDescription($0) }))
                .fieldStyle()
                .accessibilityIdentifier("groupExpense.description")
        }
    }

    @ViewBuilder private var amountFields: some View {
        HStack(alignment: .top, spacing: Theme.Space.s2) {
            FormRow(label: language.t("groups:form.amount"), required: true, error: model.errors["amount"]) {
                TextField(model.amountHints.placeholder, text: Binding(get: { model.form.amount }, set: { model.setAmount($0) }))
                    .keyboardType(model.amountHints.whole ? .numberPad : .decimalPad)
                    .fieldStyle()
                    .accessibilityIdentifier("groupExpense.amount")
            }
            FormRow(label: language.t("groups:form.currency")) {
                CurrencyMenu(label: language.t("groups:form.currencyPaid"), options: model.currencyOptions,
                             value: model.form.paidCurrency) { model.pickCurrency($0) }
            }
            .frame(width: 110)
        }
        if let line = model.fxLine {
            FxLine(line: line, manual: $model.manualRate)
        }
    }

    private var dateField: some View {
        FormRow(label: language.t("groups:form.date")) {
            DayField(label: language.t("groups:form.date"),
                     iso: Binding(get: { model.form.spentAt }, set: { model.setDate($0) }))
        }
    }

    private var payerField: some View {
        FormRow(label: language.t("groups:form.paidBy"), required: true, error: model.errors["paidBy"]) {
            let rows = model.memberRows
            Menu {
                Picker(language.t("groups:form.paidBy"), selection: Binding(get: { model.form.paidBy }, set: { model.pickPayer($0) })) {
                    ForEach(rows, id: \.id) { row in Text(row.name).tag(row.id) }
                }
            } label: {
                HStack(spacing: Theme.Space.s2) {
                    if let chosen = rows.first(where: { $0.id == model.form.paidBy }) {
                        if let avatar = chosen.avatar { AvatarCircle(avatar: avatar) }
                        Text(chosen.name).lineLimit(1)
                    } else {
                        Text(language.t("groups:form.choose")).foregroundStyle(Theme.Colors.placeholder)
                    }
                    Spacer(minLength: 0)
                    LucideIcon(icon: .chevronDown, size: 16)
                }
                .fieldStyle()
            }
            .accessibilityLabel(language.t("groups:form.paidBy"))
        }
    }

    /// The quick layout's split, folded: who it covers and the line, Adjust to open it.
    private var splitCard: some View {
        VStack(alignment: .leading, spacing: Theme.Space.s3) {
            HStack(spacing: Theme.Space.s3) {
                if let stack = model.splitStack { AvatarStackView(stack: stack) }
                VStack(alignment: .leading, spacing: 2) {
                    Text(model.figures?.card.title ?? "")
                        .font(Theme.Fonts.body(14, weight: .semibold, lang: language.current))
                        .foregroundStyle(Theme.Colors.textPrimary)
                    Text(model.figures?.card.line ?? "")
                        .font(Theme.Fonts.body(12, lang: language.current))
                        .foregroundStyle(Theme.Colors.textMuted)
                }
                Spacer(minLength: Theme.Space.s1)
                Text(language.t("groups:form.adjust"))
                    .font(Theme.Fonts.body(14, lang: language.current))
                    .foregroundStyle(Theme.Colors.textMuted)
                    .fixedSize()
                KitSwitch(isOn: $model.adjust, label: language.t("groups:form.adjust"))
            }
            if model.adjust { SplitEditor(model: model) }
        }
        .padding(Theme.Space.s3)
        .overlay(RoundedRectangle(cornerRadius: Theme.Radius.xl, style: .continuous).stroke(Theme.Colors.border, lineWidth: 1))
    }
}

extension GroupExpenseView where Lead == EmptyView {
    init(model: GroupExpenseModel, onDone: @escaping (ToastText?) -> Void, back: (() -> Void)? = nil) {
        self.init(model: model, onDone: onDone, back: back, lead: { EmptyView() })
    }
}

/// The split: the modes, a row per member (included or not, their share's
/// field for a custom split, their share), and the line under it.
struct SplitEditor: View {
    @Bindable var model: GroupExpenseModel
    @Environment(AppLanguage.self) private var language

    var body: some View {
        let figures = model.figures
        VStack(alignment: .leading, spacing: Theme.Space.s3) {
            HStack(spacing: 0) {
                ForEach(model.modes, id: \.self) { mode in
                    let on = model.form.mode == mode
                    Button { model.pickMode(mode) } label: {
                        Text(language.t("groups:form.modes.\(mode)"))
                            .font(Theme.Fonts.body(14, weight: .semibold, lang: language.current))
                            .foregroundStyle(on ? Theme.Colors.onAccent : Theme.Colors.textPrimary)
                            .lineLimit(1)
                            .minimumScaleFactor(0.8)
                            .padding(.horizontal, Theme.Space.s3)
                            .frame(minHeight: 32)
                            .background(on ? Theme.Colors.accentSolid : Theme.Colors.surface)
                    }
                    .buttonStyle(.plain)
                    .accessibilityAddTraits(on ? .isSelected : [])
                    if mode != model.modes.last { Rectangle().fill(Theme.Colors.border).frame(width: 1, height: 32) }
                }
            }
            .fixedSize()
            .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.lg, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: Theme.Radius.lg, style: .continuous).stroke(Theme.Colors.border, lineWidth: 1))
            .accessibilityIdentifier("groupExpense.modes")

            ForEach(model.memberRows, id: \.id) { row in
                let on = model.form.splitWith.contains(row.id)
                HStack(spacing: Theme.Space.s2) {
                    Button { model.toggle(row.id) } label: {
                        HStack(spacing: Theme.Space.s2) {
                            KitCheckbox(on: on)
                            if let avatar = row.avatar { AvatarCircle(avatar: avatar) }
                            Text(row.name)
                                .font(Theme.Fonts.body(15, lang: language.current))
                                .foregroundStyle(Theme.Colors.textPrimary)
                                .lineLimit(1)
                        }
                    }
                    .buttonStyle(.plain)
                    .accessibilityAddTraits(on ? .isSelected : [])
                    Spacer(minLength: Theme.Space.s1)
                    if on, model.form.mode != "equal" {
                        HStack(spacing: 0) {
                            TextField("0", text: Binding(get: { model.form.values[row.id] ?? "" },
                                                         set: { model.setShare(row.id, $0) }))
                                .keyboardType(.decimalPad)
                                .multilineTextAlignment(.trailing)
                                .font(Theme.Fonts.body(14, lang: language.current))
                                .padding(.horizontal, Theme.Space.s2)
                                .frame(width: 72, height: 34)
                            Text(model.shareUnit)
                                .font(Theme.Fonts.body(12, lang: language.current))
                                .foregroundStyle(Theme.Colors.textMuted)
                                .padding(.horizontal, 6)
                                .frame(height: 34)
                                .background(Theme.Colors.subtle)
                        }
                        .background(Theme.Colors.surface)
                        .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.md, style: .continuous))
                        .overlay(RoundedRectangle(cornerRadius: Theme.Radius.md, style: .continuous)
                            .stroke(Theme.Colors.border, lineWidth: 1))
                    }
                    if on {
                        Text(figures?.preview.shareText[row.id] ?? "")
                            .font(Theme.Fonts.body(13, lang: language.current))
                            .foregroundStyle(Theme.Colors.textMuted)
                            .frame(minWidth: 64, alignment: .trailing)
                    }
                }
            }
            Text(figures?.preview.summary ?? "")
                .font(Theme.Fonts.body(14, weight: .semibold, lang: language.current))
                .foregroundStyle(figures?.preview.complete == true ? Theme.Colors.positive : Theme.Colors.textMuted)
                .accessibilityIdentifier("groupExpense.summary")
        }
    }
}

/// Chakra's Checkbox (md, brand): a 16 pt box, sand.300 edge, filled
/// brand.500 with a white check when on.
struct KitCheckbox: View {
    let on: Bool
    @Environment(\.colorScheme) private var scheme

    var body: some View {
        ZStack {
            RoundedRectangle(cornerRadius: 2, style: .continuous)
                .fill(on ? Theme.Palette.brand500 : Color.clear)
            RoundedRectangle(cornerRadius: 2, style: .continuous)
                .stroke(on ? Theme.Palette.brand500 : (scheme == .dark ? Theme.Palette.sand600 : Theme.Palette.sand300), lineWidth: 2)
            if on { LucideIcon(icon: .check, size: 12).foregroundStyle(Color.white) }
        }
        .frame(width: 16, height: 16)
        .padding(4)
    }
}
