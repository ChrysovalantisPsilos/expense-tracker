// A group's sheets and pages: an expense's form (amount first, as Add;
// the description, the date, who paid and the split), settle up, and the
// members page (remove someone; invite by email or with a share link).
// Everything they show is their model's (the core's).
import CoreImage.CIFilterBuiltins
import SwiftUI
import UIKit

// MARK: An expense

/// Add or edit a group's expense, as a sheet: Cancel, the group's name, Save;
/// Delete at the end of an edit.
@MainActor
struct GroupExpenseSheet: View {
    @Bindable var model: GroupExpenseModel
    /// Saved or deleted: the toast's words.
    let onDone: (ToastText?) -> Void
    @Environment(AppLanguage.self) private var language
    @Environment(\.dismiss) private var dismiss
    @State private var confirmDelete = false

    var body: some View {
        NavigationStack {
            GroupExpenseForm(model: model, compact: false) {
                if model.isEdit {
                    Button(role: .destructive) { confirmDelete = true } label: {
                        Label(language.t("common:actions.delete"), systemImage: "trash").frame(maxWidth: .infinity)
                    }
                    .nativeGlassButton()
                }
            }
            .navigationTitle(language.t(model.isEdit ? "groups:expensePage.titleEdit" : "groups:expensePage.titleAdd"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button { dismiss() } label: { Image(systemName: "xmark") }
                        .accessibilityLabel(language.t("common:actions.cancel"))
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button(language.t("common:actions.save")) {
                        Task {
                            if await model.save() { finish() }
                        }
                    }
                    .fontWeight(.semibold)
                    .disabled(model.busy)
                    .accessibilityIdentifier("groupExpense.save")
                }
            }
        }
        .presentationDetents([.large])
        .confirmationDialog(model.deleteTitle, isPresented: $confirmDelete, titleVisibility: .visible) {
            Button(language.t("common:actions.delete"), role: .destructive) {
                Task { if await model.delete() { finish() } }
            }
            Button(language.t("common:actions.cancel"), role: .cancel) {}
        } message: {
            Text(model.deleteBody)
        }
    }

    private func finish() {
        NativeHaptics.success()
        onDone(model.saved)
        dismiss()
    }
}

/// The expense's fields: the amount (with the pad while Add is collapsed),
/// its date and currency, the exchange rate, what it was for and who paid,
/// `extra` (Add's "Who's it for?", or Delete), then the split.
@MainActor
struct GroupExpenseForm<Extra: View>: View {
    @Bindable var model: GroupExpenseModel
    /// Add's collapsed sheet: the number pad shows.
    var compact: Bool
    @ViewBuilder var extra: () -> Extra
    @Environment(AppLanguage.self) private var language

    var body: some View {
        ScrollView {
            VStack(spacing: 14) {
                if let notice = model.notice {
                    NativeNotice(text: [notice.title, notice.description].compactMap { $0 }.joined(separator: " "), warning: true)
                        .padding(.horizontal, 16)
                        .accessibilityIdentifier("groupExpense.notice")
                }
                AmountHeader(text: model.amountText, value: Double(model.amountMinor), error: model.errors["amount"]) {
                    DayPill(iso: Binding(get: { model.form.spentAt }, set: { model.setDate($0) }))
                    CurrencyPill(options: model.currencyOptions, value: model.form.paidCurrency) { model.pickCurrency($0) }
                }
                if let line = model.fxLine {
                    FxLineView(line: line, manual: $model.manualRate).padding(.horizontal, 16)
                }
                if compact {
                    NumberPad(whole: model.amountHints.whole) { model.press($0) }
                }
                VStack(spacing: 18) {
                    NativeFormCard {
                        TextField(language.t("groups:form.descriptionHint"),
                                  text: Binding(get: { model.form.description }, set: { model.setDescription($0) }))
                            .padding(.vertical, 13)
                            .accessibilityIdentifier("groupExpense.description")
                        if let error = model.errors["description"] { FormNote(text: error, warning: true) }
                        Divider()
                        Picker(language.t("groups:form.paidBy"), selection: Binding(get: { model.form.paidBy },
                                                                                   set: { model.pickPayer($0) })) {
                            ForEach(model.memberRows, id: \.id) { row in Text(row.name).tag(row.id) }
                        }
                        .pickerStyle(.menu)
                        .padding(.vertical, 6)
                        if let error = model.errors["paidBy"] { FormNote(text: error, warning: true) }
                    }
                    extra()
                    splitCard
                }
                .padding(.horizontal, 16)
            }
            .padding(.top, 6)
            .padding(.bottom, 24)
        }
        .scrollDismissesKeyboard(.interactively)
    }

    /// The split: who it covers, the modes, a row per member (in or out,
    /// their share's field for a custom split, their share), and the line.
    private var splitCard: some View {
        let figures = model.figures
        return NativeFormCard(title: language.t("groups:form.split")) {
            HStack(spacing: 10) {
                if let stack = model.splitStack { NativeAvatarStack(stack: stack, size: 24) }
                VStack(alignment: .leading, spacing: 1) {
                    Text(figures?.card.title ?? "").font(.subheadline.weight(.semibold))
                    Text(figures?.card.line ?? "").font(.footnote).foregroundStyle(.secondary)
                }
            }
            .padding(.vertical, 10)
            Picker(language.t("groups:form.split"), selection: Binding(get: { model.form.mode }, set: { model.pickMode($0) })) {
                ForEach(model.modes, id: \.self) { mode in Text(language.t("groups:form.modes.\(mode)")).tag(mode) }
            }
            .pickerStyle(.segmented)
            .padding(.bottom, 8)
            .accessibilityIdentifier("groupExpense.modes")
            ForEach(model.memberRows, id: \.id) { row in
                let on = model.form.splitWith.contains(row.id)
                Divider()
                HStack(spacing: 10) {
                    Button { model.toggle(row.id) } label: {
                        HStack(spacing: 10) {
                            Image(systemName: on ? "checkmark.circle.fill" : "circle")
                                .font(.title3)
                                .foregroundStyle(on ? NativeStyle.tint : Color.secondary)
                            if let avatar = row.avatar { NativeAvatar(avatar: avatar, size: 28) }
                            Text(row.name).lineLimit(1)
                        }
                    }
                    .buttonStyle(.plain)
                    .accessibilityAddTraits(on ? .isSelected : [])
                    Spacer(minLength: 6)
                    if on, model.form.mode != "equal" {
                        TextField("0", text: Binding(get: { model.form.values[row.id] ?? "" }, set: { model.setShare(row.id, $0) }))
                            .keyboardType(.decimalPad)
                            .multilineTextAlignment(.trailing)
                            .frame(width: 64)
                            .textFieldStyle(.roundedBorder)
                        Text(model.shareUnit).font(.footnote).foregroundStyle(.secondary)
                    }
                    if on {
                        Text(figures?.preview.shareText[row.id] ?? "")
                            .font(.footnote)
                            .foregroundStyle(.secondary)
                            .monospacedDigit()
                            .frame(minWidth: 60, alignment: .trailing)
                    }
                }
                .frame(minHeight: 48)
            }
            Divider()
            Text(figures?.preview.summary ?? "")
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(figures?.preview.complete == true ? NativeStyle.positive : Color.secondary)
                .padding(.vertical, 12)
                .accessibilityIdentifier("groupExpense.summary")
        }
    }
}

// MARK: Settle up

/// Settle up, as a sheet: the suggested payments (a tap fills the form; a
/// bell reminds someone who owes you), I paid | I received, who, "You → Sam",
/// the amount and date, "Pay Sam directly", then Record.
@MainActor
struct SettleUpView: View {
    @Bindable var model: SettleUpModel
    let onDone: () -> Void
    @Environment(AppLanguage.self) private var language
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            Form {
                if let message = model.message {
                    Section { NativeNotice(text: message) }
                }
                if model.others.isEmpty {
                    Section { Text(language.t("groups:settle.addMemberFirst")).foregroundStyle(.secondary) }
                } else {
                    if !model.suggestions.isEmpty { suggestions }
                    fields
                    if let pay = model.payShortcut { PayShortcutSection(parts: pay) }
                }
            }
            .scrollContentBackground(.hidden)
            .background(NativeStyle.canvas)
            .navigationTitle(language.t("groups:settle.title"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button { dismiss() } label: { Image(systemName: "xmark") }
                        .accessibilityLabel(language.t("common:actions.cancel"))
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button(language.t("groups:settle.record")) {
                        Task {
                            if await model.record() {
                                NativeHaptics.success()
                                onDone()
                                dismiss()
                            }
                        }
                    }
                    .fontWeight(.semibold)
                    .disabled(model.busy || model.others.isEmpty)
                    .accessibilityIdentifier("settle.record")
                }
            }
            .task(id: "\(model.otherId)|\(model.direction)") { await model.loadPayInfo() }
        }
    }

    private var suggestions: some View {
        Section {
            ForEach(model.suggestions) { suggestion in
                HStack(spacing: 8) {
                    Button { model.apply(suggestion) } label: {
                        HStack {
                            NativeRich.text(model.rich(suggestion.text))
                                .foregroundStyle(Color.primary)
                            Spacer(minLength: 4)
                            if model.picked == suggestion.index {
                                Image(systemName: "checkmark").foregroundStyle(NativeStyle.tint)
                            }
                        }
                    }
                    .buttonStyle(.plain)
                    .accessibilityAddTraits(model.picked == suggestion.index ? .isSelected : [])
                    if let remind = suggestion.remind {
                        Button { Task { await model.remind(remind.memberId) } } label: {
                            Image(systemName: "bell.and.waves.left.and.right").frame(width: 44, height: 44)
                        }
                        .buttonStyle(.plain)
                        .foregroundStyle(NativeStyle.tint)
                        .accessibilityLabel(remind.label)
                    }
                }
            }
        } header: {
            NativeCapsHeader(title: language.t("groups:settle.suggested"))
        }
    }

    private var fields: some View {
        let state = model.state
        let whoLabel = language.t(model.direction == "out" ? "groups:settle.paidTo" : "groups:settle.receivedFrom")
        return Section {
            Picker("", selection: Binding(get: { model.direction }, set: { model.setDirection($0) })) {
                Text(language.t("groups:settle.iPaid")).tag("out")
                Text(language.t("groups:settle.iReceived")).tag("in")
            }
            .pickerStyle(.segmented)
            Picker(whoLabel, selection: Binding(get: { model.otherId }, set: { model.pickOther($0) })) {
                ForEach(model.others, id: \.self) { id in Text(model.name(id)).tag(id) }
            }
            if let parties = state?.parties {
                HStack(spacing: 8) {
                    Text(parties.from)
                    Image(systemName: "arrow.right").foregroundStyle(.secondary)
                    Text(parties.to)
                }
                .font(.subheadline.weight(.semibold))
                .frame(maxWidth: .infinity)
            }
            HStack {
                Text(language.t("groups:settle.amount", ["currency": .string(model.currency)]))
                Spacer()
                TextField("0", text: Binding(get: { model.amount }, set: { model.setAmount($0) }))
                    .keyboardType(.decimalPad)
                    .multilineTextAlignment(.trailing)
                    .font(.body.weight(.semibold))
                    .accessibilityIdentifier("settle.amount")
            }
            DayRow(title: language.t("groups:settle.date"), iso: $model.settledAt)
        } footer: {
            if let line = state?.otherLine { Text(line) }
        }
    }
}

/// "Pay Sam directly" (payShortcutParts): what it would offer, or the links,
/// the bank QR (drawn on the device from the core's EPC payload) and the
/// IBAN to copy.
struct PayShortcutSection: View {
    let parts: JSONValue
    @Environment(AppLanguage.self) private var language
    @State private var showQr = false
    @State private var copied = false

    var body: some View {
        Section {
            if parts["kind"] == "hint" {
                Text(parts["note"]?.stringValue ?? "").font(.footnote).foregroundStyle(.secondary)
            } else {
                if let link = parts["revolut"]?.stringValue, let url = URL(string: link) {
                    Link(destination: url) { Label(verbatimTitle: "Revolut", systemImage: "arrow.up.right.square") }
                }
                if let link = parts["paypal"]?.stringValue, let url = URL(string: link) {
                    Link(destination: url) { Label(verbatimTitle: "PayPal", systemImage: "arrow.up.right.square") }
                }
                if parts["qr"]?.stringValue != nil {
                    Button(language.t(showQr ? "groups:pay.hideQr" : "groups:pay.showQr")) { showQr.toggle() }
                }
                if showQr, let payload = parts["qr"]?.stringValue, let image = QRImage.make(payload) {
                    VStack(spacing: 8) {
                        Image(uiImage: image)
                            .interpolation(.none)
                            .resizable()
                            .frame(width: 200, height: 200)
                            .padding(8)
                            .background(Color.white, in: RoundedRectangle(cornerRadius: 8))
                            .accessibilityLabel(language.t("groups:pay.qrAlt"))
                        Text(parts["qrCaption"]?.stringValue ?? "").font(.footnote).foregroundStyle(.secondary)
                    }
                    .frame(maxWidth: .infinity)
                }
                if let iban = parts["iban"]?.stringValue {
                    Button(language.t(copied ? "groups:pay.ibanCopied" : "groups:pay.copyIban")) {
                        UIPasteboard.general.string = iban
                        copied = true
                    }
                }
            }
        } header: {
            NativeCapsHeader(title: parts["title"]?.stringValue ?? "")
        } footer: {
            if let after = parts["after"]?.stringValue { Text(after) }
        }
    }
}

extension Label where Title == Text, Icon == Image {
    /// A label whose words aren't the app's (a brand's name).
    init(verbatimTitle: String, systemImage: String) {
        self.init { Text(verbatim: verbatimTitle) } icon: { Image(systemName: systemImage) }
    }
}

/// A QR code of a payload, drawn by Core Image (the web draws it with the qrcode package).
enum QRImage {
    static func make(_ payload: String) -> UIImage? {
        let filter = CIFilter.qrCodeGenerator()
        filter.message = Data(payload.utf8)
        filter.correctionLevel = "M"
        guard let output = filter.outputImage?.transformed(by: CGAffineTransform(scaleX: 8, y: 8)),
              let image = CIContext().createCGImage(output, from: output.extent) else { return nil }
        return UIImage(cgImage: image)
    }
}

// MARK: Members

/// A group's members, after the web's MembersPage: "In this group" (you
/// and the owner first, the owner's badge, the owner's remove behind a
/// confirm), then "Invite people": by email (an in-app request to someone on
/// Budgeer, else an emailed join link) or with a share link to copy or share.
@MainActor
struct MembersView: View {
    @Bindable var model: GroupModel
    @Environment(AppLanguage.self) private var language
    @State private var removing: MemberRow?
    @State private var email = ""
    @State private var copied = false

    var body: some View {
        List {
            if let message = model.message {
                Section { NativeNotice(text: message) }
            }
            if let figures = model.figures {
                Section {
                    ForEach(figures.memberRows) { row in memberRow(row) }
                } header: {
                    NativeCapsHeader(title: language.t("groups:members.inGroup"))
                } footer: {
                    Text(figures.members)
                }
                .listRowBackground(NativeStyle.card)
                if figures.myMemberId != nil { invite }
            }
        }
        .listStyle(.insetGrouped)
        .scrollContentBackground(.hidden)
        .background(NativeStyle.canvas)
        .nativeTabBarRoom()
        .navigationTitle(language.t("groups:members.title"))
        .confirmationDialog(language.t("groups:modals.remove.title", ["name": .string(removing?.avatar.name ?? "")]),
                            isPresented: Binding(get: { removing != nil }, set: { if !$0 { removing = nil } }),
                            titleVisibility: .visible) {
            Button(language.t("groups:modals.remove.confirm"), role: .destructive) {
                if let id = removing?.avatar.id { Task { await model.remove(memberId: id) } }
            }
            Button(language.t("common:actions.cancel"), role: .cancel) {}
        } message: {
            Text(language.t("groups:modals.remove.body"))
        }
    }

    private func memberRow(_ row: MemberRow) -> some View {
        HStack(spacing: 12) {
            NativeAvatar(avatar: row.avatar, size: 34)
            Text(row.label).fontWeight(row.isMe ? .semibold : .regular)
            if let owner = row.owner {
                Text(owner.capsLabel)
                    .font(.caption2.weight(.bold))
                    .foregroundStyle(NativeStyle.tint)
                    .padding(.horizontal, 6)
                    .padding(.vertical, 2)
                    .background(Theme.Colors.accentSubtle, in: Capsule())
            }
            Spacer(minLength: 8)
            if row.canRemove {
                Button { removing = row } label: {
                    Image(systemName: "person.badge.minus").frame(width: 44, height: 44)
                }
                .buttonStyle(.plain)
                .foregroundStyle(NativeStyle.tint)
                .accessibilityLabel(row.removeLabel)
            }
        }
        .frame(minHeight: 48)
    }

    private var invite: some View {
        Section {
            TextField("", text: $email, prompt: Text(verbatim: "friend@example.com"))
                .keyboardType(.emailAddress)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
                .accessibilityIdentifier("members.email")
            Button {
                Task { if await model.invite(email: email) { email = "" } }
            } label: {
                Label(language.t("groups:members.invite.send"), systemImage: "envelope")
            }
            .disabled(model.busy || email.trimmingCharacters(in: .whitespaces).isEmpty)
            Button {
                copied = false
                Task { await model.makeInviteLink() }
            } label: {
                Label(language.t("groups:members.invite.copyLink"), systemImage: "link")
            }
            .disabled(model.busy)
            if let link = model.inviteLink {
                Text(link)
                    .font(.system(size: 13, design: .monospaced))
                    .textSelection(.enabled)
                    .accessibilityLabel(language.t("groups:modals.invite.field"))
                HStack(spacing: 16) {
                    Button(language.t(copied ? "groups:modals.invite.copied" : "groups:modals.invite.copy")) {
                        UIPasteboard.general.string = link
                        copied = true
                    }
                    .buttonStyle(.borderless)
                    if let url = URL(string: link) {
                        ShareLink(item: url, subject: Text(language.t("groups:modals.invite.shareTitle"))) {
                            Text(language.t("groups:actions.share"))
                        }
                        .buttonStyle(.borderless)
                    }
                }
            }
        } header: {
            NativeCapsHeader(title: language.t("groups:members.invite.title"))
        } footer: {
            Text(language.t("groups:members.invite.emailHint"))
        }
        .listRowBackground(NativeStyle.card)
    }
}
