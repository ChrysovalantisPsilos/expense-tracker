// Settle up, laid out as the web's SettleUpPage: "Suggested to settle up"
// (each of your payments in the fewest-payments plan, one tap to fill the
// form, a bell to remind someone who owes you), I paid | I received, the
// other person with their balance line, "You → Sam", the amount and the
// date, "Pay Sam directly" (Revolut, PayPal, a bank QR for a EUR group, the
// IBAN to copy), then Record. Everything it shows is SettleUpModel's.
import CoreImage.CIFilterBuiltins
import SwiftUI
import UIKit

@MainActor
struct SettleUpView: View {
    @Bindable var model: SettleUpModel
    let onDone: () -> Void
    @Environment(AppLanguage.self) private var language

    var body: some View {
        ScrollView {
            VStack(spacing: Theme.Space.s4) {
                if let message = model.message { Note(text: message, tone: Theme.Colors.textPrimary) }
                if model.others.isEmpty {
                    Panel { Note(text: language.t("groups:settle.addMemberFirst")) }
                } else {
                    Panel { fields }
                    Button {
                        Task { if await model.record() { onDone() } }
                    } label: {
                        if model.busy { ProgressView().tint(Theme.Colors.onAccent) } else { Text(language.t("groups:settle.record")) }
                    }
                    .buttonStyle(PrimaryButtonStyle())
                    .disabled(model.busy)
                    .accessibilityIdentifier("settle.record")
                }
            }
            .padding(Theme.Space.s4)
        }
        .scrollDismissesKeyboard(.interactively)
        .background(Theme.Colors.canvas.ignoresSafeArea())
        .navigationTitle(language.t("groups:settle.title"))
        .navigationBarTitleDisplayMode(.inline)
        .task(id: "\(model.otherId)|\(model.direction)") { await model.loadPayInfo() }
    }

    private var fields: some View {
        let state = model.state
        return VStack(alignment: .leading, spacing: Theme.Space.s4) {
            if !model.suggestions.isEmpty { suggestions }
            HStack(spacing: Theme.Space.s2) {
                ChoiceButton(label: language.t("groups:settle.iPaid"), on: model.direction == "out") { model.setDirection("out") }
                ChoiceButton(label: language.t("groups:settle.iReceived"), on: model.direction == "in") { model.setDirection("in") }
            }
            FormRow(label: language.t(model.direction == "out" ? "groups:settle.paidTo" : "groups:settle.receivedFrom") + " *",
                    help: state?.otherLine) {
                Menu {
                    Picker("", selection: Binding(get: { model.otherId }, set: { model.pickOther($0) })) {
                        ForEach(model.others, id: \.self) { Text(model.name($0)).tag($0) }
                    }
                } label: {
                    HStack {
                        Text(model.name(model.otherId)).lineLimit(1)
                        Spacer(minLength: 0)
                        Image(systemName: "chevron.up.chevron.down").font(.system(size: 11))
                    }
                    .fieldStyle()
                }
            }
            if let parties = state?.parties {
                HStack(spacing: Theme.Space.s2) {
                    Text(parties.from)
                    Image(systemName: "arrow.right").font(.system(size: 13)).foregroundStyle(Theme.Colors.textMuted)
                    Text(parties.to)
                }
                .font(Theme.Fonts.body(15, weight: .semibold, lang: language.current))
                .foregroundStyle(Theme.Colors.textPrimary)
                .frame(maxWidth: .infinity)
            }
            HStack(alignment: .top, spacing: Theme.Space.s3) {
                FormRow(label: language.t("groups:settle.amount", ["currency": .string(model.currency)]) + " *") {
                    TextField("", text: Binding(get: { model.amount }, set: { model.setAmount($0) }))
                        .keyboardType(.decimalPad)
                        .fieldStyle()
                        .accessibilityIdentifier("settle.amount")
                }
                FormRow(label: language.t("groups:settle.date")) {
                    DayField(label: language.t("groups:settle.date"), iso: $model.settledAt)
                }
                .fixedSize()
            }
            if let pay = model.payShortcut { PayShortcutBox(parts: pay) }
        }
    }

    private var suggestions: some View {
        VStack(alignment: .leading, spacing: Theme.Space.s2) {
            Label(language.t("groups:settle.suggested"), systemImage: "wand.and.stars")
                .font(Theme.Fonts.body(14, weight: .semibold, lang: language.current))
                .foregroundStyle(Theme.Colors.accentFg)
            ForEach(model.suggestions) { suggestion in
                HStack(spacing: Theme.Space.s1) {
                    Button { model.apply(suggestion) } label: {
                        RichText(nodes: model.rich(suggestion.text))
                            .frame(maxWidth: .infinity, minHeight: 40, alignment: .leading)
                            .padding(.horizontal, Theme.Space.s2)
                            .background(model.picked == suggestion.index ? Theme.Colors.subtle : Color.clear)
                            .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.md, style: .continuous))
                    }
                    .buttonStyle(.plain)
                    .accessibilityAddTraits(model.picked == suggestion.index ? .isSelected : [])
                    if let remind = suggestion.remind {
                        Button { Task { await model.remind(remind.memberId) } } label: {
                            Image(systemName: "bell.badge")
                                .font(.system(size: 17))
                                .foregroundStyle(Theme.Colors.textPrimary)
                                .frame(width: 40, height: 40)
                        }
                        .accessibilityLabel(remind.label)
                    }
                }
            }
        }
        .padding(Theme.Space.s3)
        .overlay(RoundedRectangle(cornerRadius: Theme.Radius.lg, style: .continuous).stroke(Theme.Colors.border, lineWidth: 1))
    }
}

/// "Pay Sam directly" (payShortcutParts): what the box would offer, or the
/// links, the bank QR (drawn on the device from the core's EPC payload) and
/// the IBAN to copy.
struct PayShortcutBox: View {
    let parts: JSONValue
    @Environment(AppLanguage.self) private var language
    @State private var showQr = false
    @State private var copied = false

    var body: some View {
        VStack(alignment: .leading, spacing: Theme.Space.s2) {
            Label(parts["title"]?.stringValue ?? "", systemImage: parts["kind"] == "hint" ? "info.circle" : "creditcard")
                .font(Theme.Fonts.body(14, weight: .semibold, lang: language.current))
                .foregroundStyle(Theme.Colors.textPrimary)
            if parts["kind"] == "hint" {
                Note(text: parts["note"]?.stringValue ?? "")
            } else {
                HStack(spacing: Theme.Space.s2) {
                    if let link = parts["revolut"]?.stringValue, let url = URL(string: link) {
                        Link(destination: url) { linkLabel("Revolut") }
                    }
                    if let link = parts["paypal"]?.stringValue, let url = URL(string: link) {
                        Link(destination: url) { linkLabel("PayPal") }
                    }
                }
                HStack(spacing: Theme.Space.s3) {
                    if parts["qr"]?.stringValue != nil {
                        Button(language.t(showQr ? "groups:pay.hideQr" : "groups:pay.showQr")) { showQr.toggle() }
                    }
                    if let iban = parts["iban"]?.stringValue {
                        Button(language.t("groups:pay.copyIban")) {
                            UIPasteboard.general.string = iban
                            copied = true
                        }
                    }
                }
                .font(Theme.Fonts.body(14, weight: .semibold, lang: language.current))
                .tint(Theme.Colors.accentFg)
                if copied { Note(text: language.t("groups:pay.ibanCopied"), tone: Theme.Colors.positive) }
                if showQr, let payload = parts["qr"]?.stringValue, let image = QRImage.make(payload) {
                    VStack(spacing: Theme.Space.s2) {
                        Image(uiImage: image)
                            .interpolation(.none)
                            .resizable()
                            .frame(width: 200, height: 200)
                            .padding(Theme.Space.s2)
                            .background(Color.white)
                            .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.md))
                            .accessibilityLabel(language.t("groups:pay.qrAlt"))
                        Note(text: parts["qrCaption"]?.stringValue ?? "")
                    }
                    .frame(maxWidth: .infinity)
                }
                Note(text: parts["after"]?.stringValue ?? "")
            }
        }
        .padding(Theme.Space.s3)
        .frame(maxWidth: .infinity, alignment: .leading)
        .overlay(RoundedRectangle(cornerRadius: Theme.Radius.lg, style: .continuous).stroke(Theme.Colors.border, lineWidth: 1))
    }

    private func linkLabel(_ brand: String) -> some View {
        HStack(spacing: 4) {
            Text(brand)
            Image(systemName: "arrow.up.right.square").font(.system(size: 12))
        }
        .font(Theme.Fonts.body(14, weight: .bold, lang: language.current))
        .foregroundStyle(Theme.Colors.onAccent)
        .padding(.horizontal, Theme.Space.s3)
        .frame(minHeight: 34)
        .background(Theme.Colors.accentSolid)
        .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.lg, style: .continuous))
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
