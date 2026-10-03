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
    /// The number pad: open on a new expense, on an edit once the amount is tapped.
    @State private var padOpen: Bool?

    var body: some View {
        NavigationStack {
            GroupExpenseForm(model: model, compact: padOpen ?? !model.isEdit,
                             onAmountTap: (padOpen ?? !model.isEdit) ? nil : { padOpen = true }) {
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
                        .keyboardShortcut(.cancelAction)
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
/// its date and currency (and Scan a receipt on a new one), the exchange
/// rate, what it was for and who paid, `extra` (Add's "Who's it for?", or
/// Delete), then the split.
@MainActor
struct GroupExpenseForm<Extra: View>: View {
    @Bindable var model: GroupExpenseModel
    /// Add's collapsed sheet: the number pad shows.
    var compact: Bool
    /// While the pad is hidden: a tap on the amount brings it back.
    var onAmountTap: (() -> Void)? = nil
    @ViewBuilder var extra: () -> Extra
    @Environment(AppLanguage.self) private var language
    /// The receipt's photo (in memory for its thumbnail, never saved) and its pickers.
    @State private var receiptPhoto: UIImage?
    @State private var takingPhoto = false
    @State private var pickingPhoto = false

    var body: some View {
        ScrollView {
            VStack(spacing: 14) {
                if let notice = model.notice {
                    NativeNotice(text: [notice.title, notice.description].compactMap { $0 }.joined(separator: " "), warning: true)
                        .padding(.horizontal, 16)
                        .accessibilityIdentifier("groupExpense.notice")
                }
                AmountHeader(text: model.amountText, value: Double(model.amountMinor), error: model.errors["amount"],
                             onTap: onAmountTap) {
                    DayPill(iso: Binding(get: { model.form.spentAt }, set: { model.setDate($0) }))
                    CurrencyPill(options: model.currencyOptions, value: model.form.paidCurrency) { model.pickCurrency($0) }
                    if model.offersReceipt, model.receipt.stage == .idle {
                        ReceiptPill(camera: { takingPhoto = true }, library: { pickingPhoto = true })
                    }
                }
                if model.offersReceipt, model.receipt.stage != .idle || model.receipt.problem != nil {
                    ReceiptCard(receipt: model.receipt, photo: receiptPhoto) { model.useReceipt() }
                        .padding(.horizontal, 16)
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
                        // Outside a Form a menu picker drops its label: the label is its own text.
                        HStack {
                            Text(language.t("groups:form.paidBy"))
                            Spacer(minLength: 12)
                            Picker(language.t("groups:form.paidBy"), selection: Binding(get: { model.form.paidBy },
                                                                                       set: { model.pickPayer($0) })) {
                                ForEach(model.memberRows, id: \.id) { row in Text(row.name).tag(row.id) }
                            }
                            .pickerStyle(.menu)
                            .labelsHidden()
                            .fixedSize()
                        }
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
        .modifier(ReceiptCapture(receipt: model.receipt, camera: $takingPhoto, library: $pickingPhoto, photo: $receiptPhoto))
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

/// Settle up's one-time ask when you're being paid and friends have no way
/// to pay you yet (the web's PaymentDetailsAsk): Add payment details opens
/// Getting paid's three fields here, saved as Settings saves them; Not now is
/// remembered on this phone.
@MainActor
struct PaymentDetailsAsk: View {
    @Bindable var model: SettleUpModel
    @Environment(AppLanguage.self) private var language

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .top, spacing: 12) {
                NativeIconTile(symbol: "building.columns.fill", color: NativeTone.coral, size: 30)
                Text(language.t("groups:paymentAsk.body")).font(.subheadline)
            }
            if model.askOpen {
                VStack(spacing: 0) {
                    GettingPaidFields(iban: $model.iban, revolut: $model.revolut, paypal: $model.paypal, ids: "ask") { field in
                        field.padding(.vertical, 8)
                    }
                }
                .padding(.horizontal, 14)
                .background(Theme.Colors.subtle, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
                if let problem = model.askProblem {
                    Text(problem).font(.footnote.weight(.semibold)).foregroundStyle(NativeStyle.negative)
                }
                Text(language.t("settings:payment.lead")).font(.caption).foregroundStyle(.secondary)
            }
            HStack(spacing: 10) {
                Button { model.notNow() } label: {
                    Text(language.t("groups:paymentAsk.notNow")).frame(maxWidth: .infinity)
                }
                .nativeGlassButton()
                .accessibilityIdentifier("ask.notNow")
                if model.askOpen {
                    Button { Task { await model.saveDetails() } } label: {
                        Text(language.t("settings:account.save")).frame(maxWidth: .infinity)
                    }
                    .nativeGlassButton(prominent: true)
                    .disabled(model.busy)
                    .accessibilityIdentifier("ask.save")
                } else {
                    Button { model.openAsk() } label: {
                        Text(language.t("groups:paymentAsk.add")).frame(maxWidth: .infinity)
                    }
                    .nativeGlassButton(prominent: true)
                    .accessibilityIdentifier("ask.add")
                }
            }
        }
        .padding(16)
        .background(NativeStyle.card, in: RoundedRectangle(cornerRadius: 22, style: .continuous))
        .animation(.snappy, value: model.askOpen)
    }

}

/// Settle up, as a sheet: a hero with who pays whom (both avatars, the
/// arrow between) over the amount in big figures, I paid | I received and
/// the person as avatar chips, the suggested payments (a tap fills the form;
/// a bell reminds someone who owes you), the date, then "Pay Sam directly"
/// as glass buttons; Record floats at the foot.
@MainActor
struct SettleUpView: View {
    @Bindable var model: SettleUpModel
    let onDone: () -> Void
    @Environment(AppLanguage.self) private var language
    @Environment(\.dismiss) private var dismiss
    @FocusState private var amountFocused: Bool

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 16) {
                    if let message = model.message {
                        NativeNotice(text: message).padding(.horizontal, 4)
                    }
                    if model.others.isEmpty {
                        Text(language.t("groups:settle.addMemberFirst"))
                            .foregroundStyle(.secondary)
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 40)
                    } else {
                        hero
                        who
                        if model.asksForDetails { PaymentDetailsAsk(model: model) }
                        if !model.suggestions.isEmpty { suggestions }
                        NativeFormCard {
                            DayRow(title: language.t("groups:settle.date"), iso: $model.settledAt)
                        }
                        if let pay = model.payShortcut { PayShortcutCard(parts: pay) }
                    }
                }
                .padding(.horizontal, 16)
                .padding(.top, 6)
                .padding(.bottom, 40)
            }
            .scrollDismissesKeyboard(.interactively)
            .background(NativeStyle.canvas)
            .safeAreaInset(edge: .bottom, spacing: 0) {
                if !model.others.isEmpty {
                    Button {
                        Task {
                            if await model.record() {
                                NativeHaptics.success()
                                onDone()
                                dismiss()
                            }
                        }
                    } label: {
                        Group {
                            if model.busy {
                                ProgressView().tint(Color.white)
                            } else {
                                Label(language.t("groups:settle.record"), systemImage: "checkmark.circle.fill")
                            }
                        }
                        .frame(maxWidth: .infinity)
                    }
                    .nativeGlassButton(prominent: true)
                    .disabled(model.busy)
                    .padding(.horizontal, 16)
                    .padding(.vertical, 10)
                    .nativeFootBar()
                    .accessibilityIdentifier("settle.record")
                }
            }
            .navigationTitle(language.t("groups:settle.title"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button { dismiss() } label: { Image(systemName: "xmark") }
                        .keyboardShortcut(.cancelAction)
                        .accessibilityLabel(language.t("common:actions.cancel"))
                }
            }
            .task(id: "\(model.otherId)|\(model.direction)") {
                await model.loadPayInfo()
                await model.loadMyInfo()
            }
        }
        .presentationDetents([.large])
    }

    /// From → to with both circles, the amount to type in big figures, and
    /// where the other person stands overall.
    private var hero: some View {
        let state = model.state
        return VStack(spacing: 14) {
            HStack(alignment: .top, spacing: 6) {
                party(model.avatar(state?.args["fromMember"]?.stringValue), name: state?.parties.from ?? "")
                Image(systemName: "arrow.right")
                    .font(.system(size: 18, weight: .bold))
                    .foregroundStyle(NativeStyle.tint)
                    .frame(width: 44, height: 44)
                    .nativeGlass(Circle())
                    .padding(.top, 8)
                party(model.avatar(state?.args["toMember"]?.stringValue), name: state?.parties.to ?? "")
            }
            VStack(spacing: 4) {
                TextField("0", text: Binding(get: { model.amount }, set: { model.setAmount($0) }))
                    .keyboardType(.decimalPad)
                    .multilineTextAlignment(.center)
                    .font(NativeStyle.money(46))
                    .monospacedDigit()
                    .focused($amountFocused)
                    .accessibilityLabel(language.t("groups:settle.amount", ["currency": .string(model.currency)]))
                    .accessibilityIdentifier("settle.amount")
                Text(verbatim: model.currency)
                    .font(.caption.weight(.bold))
                    .foregroundStyle(.secondary)
                    .padding(.horizontal, 10)
                    .padding(.vertical, 3)
                    .background(Color.primary.opacity(0.07), in: Capsule())
            }
            if let line = state?.otherLine {
                Text(line).font(.footnote).foregroundStyle(.secondary).multilineTextAlignment(.center)
            }
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 20)
        .padding(.horizontal, 12)
        .background(NativeStyle.card, in: RoundedRectangle(cornerRadius: 26, style: .continuous))
    }

    private func party(_ avatar: Avatar?, name: String) -> some View {
        VStack(spacing: 6) {
            if let avatar {
                NativeAvatar(avatar: avatar, size: 60, ring: NativeStyle.card)
            } else {
                Circle().fill(Color.primary.opacity(0.08)).frame(width: 60, height: 60)
            }
            Text(name).font(.subheadline.weight(.semibold)).lineLimit(1)
        }
        .frame(maxWidth: .infinity)
    }

    /// I paid | I received, then the person as a row of avatar chips.
    private var who: some View {
        VStack(alignment: .leading, spacing: 12) {
            Picker("", selection: Binding(get: { model.direction }, set: { model.setDirection($0) })) {
                Text(language.t("groups:settle.iPaid")).tag("out")
                Text(language.t("groups:settle.iReceived")).tag("in")
            }
            .pickerStyle(.segmented)
            Text(language.t(model.direction == "out" ? "groups:settle.paidTo" : "groups:settle.receivedFrom").capsLabel)
                .font(.footnote)
                .foregroundStyle(.secondary)
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 10) {
                    ForEach(model.others, id: \.self) { id in
                        personChip(id)
                    }
                }
                .padding(.vertical, 2)
            }
            .scrollClipDisabled()
        }
        .padding(16)
        .background(NativeStyle.card, in: RoundedRectangle(cornerRadius: 22, style: .continuous))
    }

    private func personChip(_ id: String) -> some View {
        let picked = model.otherId == id
        return Button { model.pickOther(id) } label: {
            HStack(spacing: 8) {
                if let avatar = model.avatar(id) { NativeAvatar(avatar: avatar, size: 28) }
                Text(model.name(id)).font(.subheadline.weight(.semibold)).lineLimit(1)
            }
            .foregroundStyle(picked ? Color.white : Color.primary)
            .padding(.leading, 6)
            .padding(.trailing, 14)
            .frame(minHeight: 40)
            .nativeGlass(Capsule(), tint: picked ? NativeStyle.solid : nil, interactive: true)
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(picked ? .isSelected : [])
    }

    private var suggestions: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(language.t("groups:settle.suggested").capsLabel)
                .font(.footnote)
                .foregroundStyle(.secondary)
                .padding(.leading, 16)
            VStack(spacing: 0) {
                ForEach(model.suggestions) { suggestion in
                    suggestionRow(suggestion)
                    if suggestion.id != model.suggestions.last?.id { Divider().padding(.leading, 34) }
                }
            }
            .padding(.horizontal, 16)
            .background(NativeStyle.card, in: RoundedRectangle(cornerRadius: 22, style: .continuous))
        }
    }

    private func suggestionRow(_ suggestion: SettleSuggestion) -> some View {
        let picked = model.picked == suggestion.index
        return HStack(spacing: 10) {
            Button { model.apply(suggestion) } label: {
                HStack(spacing: 10) {
                    Image(systemName: picked ? "checkmark.circle.fill" : "circle")
                        .font(.title3)
                        .foregroundStyle(picked ? NativeStyle.tint : Color.secondary)
                    NativeRich.text(model.rich(suggestion.text))
                        .foregroundStyle(Color.primary)
                        .multilineTextAlignment(.leading)
                    Spacer(minLength: 4)
                }
                .frame(minHeight: 50)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityAddTraits(picked ? .isSelected : [])
            if let remind = suggestion.remind {
                Button { Task { await model.remind(remind.memberId) } } label: {
                    Image(systemName: "bell.and.waves.left.and.right")
                        .font(.subheadline.weight(.semibold))
                        .frame(width: 40, height: 40)
                        .nativeGlass(Circle(), interactive: true)
                }
                .buttonStyle(.plain)
                .foregroundStyle(NativeStyle.tint)
                .accessibilityLabel(remind.label)
            }
        }
    }
}

/// "Pay Sam directly" (payShortcutParts): what it would offer, or Revolut,
/// PayPal, the bank QR (drawn on the device from the core's EPC payload)
/// and the IBAN to copy, as glass buttons.
struct PayShortcutCard: View {
    let parts: JSONValue
    @Environment(AppLanguage.self) private var language
    @State private var showQr = false
    @State private var copied = false

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Label(parts["title"]?.stringValue ?? "", systemImage: "creditcard.fill")
                .font(.headline)
            if parts["kind"] == "hint" {
                Text(parts["note"]?.stringValue ?? "").font(.footnote).foregroundStyle(.secondary)
            } else {
                LazyVGrid(columns: [GridItem(.flexible(), spacing: 10), GridItem(.flexible(), spacing: 10)], spacing: 10) {
                    if let link = parts["revolut"]?.stringValue, let url = URL(string: link) {
                        Link(destination: url) { option(Text(verbatim: "Revolut"), symbol: "arrow.up.right") }
                    }
                    if let link = parts["paypal"]?.stringValue, let url = URL(string: link) {
                        Link(destination: url) { option(Text(verbatim: "PayPal"), symbol: "arrow.up.right") }
                    }
                    if parts["qr"]?.stringValue != nil {
                        Button { showQr.toggle() } label: {
                            option(Text(language.t(showQr ? "groups:pay.hideQr" : "groups:pay.showQr")), symbol: "qrcode")
                        }
                    }
                    if let iban = parts["iban"]?.stringValue {
                        Button {
                            UIPasteboard.general.string = iban
                            copied = true
                        } label: {
                            option(Text(language.t(copied ? "groups:pay.ibanCopied" : "groups:pay.copyIban")),
                                   symbol: copied ? "checkmark" : "doc.on.doc")
                        }
                    }
                }
                .buttonStyle(.plain)
                if showQr, let payload = parts["qr"]?.stringValue, let image = QRImage.make(payload) {
                    VStack(spacing: 8) {
                        Image(uiImage: image)
                            .interpolation(.none)
                            .resizable()
                            .frame(width: 200, height: 200)
                            .padding(10)
                            .background(Color.white, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                            .accessibilityLabel(language.t("groups:pay.qrAlt"))
                        Text(parts["qrCaption"]?.stringValue ?? "").font(.footnote).foregroundStyle(.secondary)
                    }
                    .frame(maxWidth: .infinity)
                }
            }
            if let after = parts["after"]?.stringValue {
                Text(after).font(.caption).foregroundStyle(.secondary)
            }
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(NativeStyle.card, in: RoundedRectangle(cornerRadius: 22, style: .continuous))
    }

    /// One way to pay: its name and symbol in a glass capsule.
    private func option(_ title: Text, symbol: String) -> some View {
        HStack(spacing: 6) {
            Image(systemName: symbol).font(.subheadline.weight(.semibold))
            title.font(.subheadline.weight(.semibold)).lineLimit(1).minimumScaleFactor(0.8)
        }
        .foregroundStyle(NativeStyle.tint)
        .frame(maxWidth: .infinity, minHeight: 46)
        .nativeGlass(Capsule(), interactive: true)
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

/// A group's members, after the web's MembersPage: the group up top, then
/// "In this group" as a card of people (big circles, "(you)", the owner's
/// badge, the owner's remove behind a confirm), then "Invite people" as its
/// own card: by email (an in-app request to someone on Budgeer, else an
/// emailed join link) or with a share link to copy or share.
@MainActor
struct MembersView: View {
    @Bindable var model: GroupModel
    @Environment(AppLanguage.self) private var language
    @State private var removing: MemberRow?
    @State private var email = ""

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                if let message = model.message {
                    NativeNotice(text: message).padding(.horizontal, 4)
                }
                if let figures = model.figures {
                    header(figures)
                    VStack(alignment: .leading, spacing: 8) {
                        Text(language.t("groups:members.inGroup").capsLabel)
                            .font(.footnote)
                            .foregroundStyle(.secondary)
                            .padding(.leading, 16)
                        VStack(spacing: 0) {
                            ForEach(figures.memberRows) { row in
                                memberRow(row)
                                if row.id != figures.memberRows.last?.id { Divider().padding(.leading, 64) }
                            }
                        }
                        .padding(.horizontal, 16)
                        .background(NativeStyle.card, in: RoundedRectangle(cornerRadius: 22, style: .continuous))
                    }
                    if figures.myMemberId != nil { invite }
                }
            }
            .padding(.horizontal, 16)
            .padding(.top, 6)
            .padding(.bottom, NativeFoot.room)
        }
        .scrollDismissesKeyboard(.interactively)
        .background(NativeStyle.canvas)
        .nativeTabBarRoom()
        .navigationTitle(language.t("groups:members.title"))
        .navigationBarTitleDisplayMode(.large)
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

    /// The group's picture, its name and "4 members" over the stack of circles.
    private func header(_ figures: GroupPageFigures) -> some View {
        HStack(spacing: 14) {
            GroupPicture(imageUrl: figures.imageUrl, colour: figures.colour, size: 56)
            VStack(alignment: .leading, spacing: 4) {
                Text(figures.name).font(.headline).lineLimit(2)
                HStack(spacing: 6) {
                    NativeAvatarStack(stack: figures.avatars, size: 22)
                    Text(figures.members).font(.footnote).foregroundStyle(.secondary)
                }
            }
            Spacer(minLength: 0)
        }
        .padding(14)
        .background(NativeStyle.card, in: RoundedRectangle(cornerRadius: 22, style: .continuous))
    }

    private func memberRow(_ row: MemberRow) -> some View {
        HStack(spacing: 14) {
            NativeAvatar(avatar: row.avatar, size: 46)
            VStack(alignment: .leading, spacing: 4) {
                Text(row.label).font(.body.weight(row.isMe ? .semibold : .medium)).lineLimit(1)
                if let owner = row.owner {
                    Label(owner, systemImage: "crown.fill")
                        .font(.caption.weight(.bold))
                        .foregroundStyle(NativeStyle.tint)
                        .padding(.horizontal, 8)
                        .padding(.vertical, 3)
                        .background(Theme.Colors.accentSubtle, in: Capsule())
                }
            }
            Spacer(minLength: 8)
            if row.canRemove {
                Button { removing = row } label: {
                    Image(systemName: "person.badge.minus")
                        .font(.subheadline.weight(.semibold))
                        .frame(width: 40, height: 40)
                        .nativeGlass(Circle(), interactive: true)
                }
                .buttonStyle(.plain)
                .foregroundStyle(NativeStyle.negative)
                .accessibilityLabel(row.removeLabel)
            }
        }
        .frame(minHeight: 66)
    }

    /// Invite by email, or make a share link (then copy or share it).
    private var invite: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack(alignment: .top, spacing: 12) {
                NativeIconTile(symbol: "person.badge.plus", size: 42)
                VStack(alignment: .leading, spacing: 3) {
                    Text(language.t("groups:members.invite.title")).font(.headline)
                    Text(language.t("groups:members.invite.subtitle")).font(.footnote).foregroundStyle(.secondary)
                }
            }
            HStack(spacing: 8) {
                TextField(language.t("groups:members.invite.email"), text: $email)
                    .keyboardType(.emailAddress)
                    .textContentType(.emailAddress)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                    .submitLabel(.send)
                    .onSubmit { send() }
                    .padding(.horizontal, 14)
                    .frame(minHeight: 46)
                    .background(Theme.Colors.subtle, in: Capsule())
                    .accessibilityIdentifier("members.email")
                Button(action: send) {
                    Image(systemName: "paperplane.fill")
                        .font(.system(size: 16, weight: .bold))
                        .foregroundStyle(Color.white)
                        .frame(width: 46, height: 46)
                        .nativeGlass(Circle(), tint: NativeStyle.solid, interactive: true)
                }
                .buttonStyle(.plain)
                .disabled(model.busy || email.trimmingCharacters(in: .whitespaces).isEmpty)
                .accessibilityLabel(language.t("groups:members.invite.send"))
            }
            Text(language.t("groups:members.invite.emailHint")).font(.caption).foregroundStyle(.secondary)
            Divider()
            if let link = model.inviteLink {
                InviteLinkCard(link: link, framed: false)
            } else {
                Button {
                    Task { await model.makeInviteLink() }
                } label: {
                    Label(language.t("groups:members.invite.copyLink"), systemImage: "link")
                        .frame(maxWidth: .infinity)
                }
                .nativeGlassButton()
                .disabled(model.busy)
            }
        }
        .padding(16)
        .background(NativeStyle.card, in: RoundedRectangle(cornerRadius: 22, style: .continuous))
    }

    private func send() {
        Task { if await model.invite(email: email) { email = "" } }
    }
}
