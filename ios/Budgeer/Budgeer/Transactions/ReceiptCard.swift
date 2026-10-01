// The receipt on Add, in place: a pill beside the day and the currency
// (Scan a receipt: Take a photo or Choose a photo), then a card under the
// amount while the phone reads it, the check (what was read, to correct;
// Cancel or Use these) and, once used, the photo's thumbnail with the web's
// note and Remove. The words and rules are ReceiptModel's (the core's).
import PhotosUI
import SwiftUI
import UIKit

/// "Scan a receipt": the camera (when the phone has one) or the library.
@MainActor
struct ReceiptPill: View {
    let camera: () -> Void
    let library: () -> Void
    @Environment(AppLanguage.self) private var language

    var body: some View {
        Menu {
            if CameraPicker.available {
                Button(action: camera) { Label(language.t("ios:native.receipt.camera"), systemImage: "camera") }
            }
            Button(action: library) { Label(language.t("ios:native.receipt.library"), systemImage: "photo.on.rectangle") }
        } label: {
            Image(systemName: "doc.text.viewfinder")
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(NativeStyle.tint)
                .frame(width: 44, height: 34)
                .background(Color.primary.opacity(0.07), in: Capsule())
        }
        .accessibilityLabel(language.t("common:receipt.scan"))
        .accessibilityIdentifier("add.receipt")
    }
}

/// Reading, the check, or the receipt used.
@MainActor
struct ReceiptCard: View {
    @Bindable var receipt: ReceiptModel
    let photo: UIImage?
    let use: () -> Void
    @Environment(AppLanguage.self) private var language

    var body: some View {
        switch receipt.stage {
        case .idle:
            if let problem = receipt.problem { NativeNotice(text: problem, warning: true) }
        case .reading:
            HStack(spacing: 12) {
                ProgressView()
                Text(language.t("common:receipt.reading")).font(.subheadline).foregroundStyle(.secondary)
                Spacer(minLength: 0)
            }
            .padding(16)
            .background(NativeStyle.card, in: RoundedRectangle(cornerRadius: 22, style: .continuous))
        case .check:
            check
        case .done:
            HStack(alignment: .top, spacing: 12) {
                thumbnail(size: 56)
                Text(language.t("common:receipt.readNote"))
                    .font(.footnote)
                    .foregroundStyle(.secondary)
                    .frame(maxWidth: .infinity, alignment: .leading)
                Button { receipt.clear() } label: {
                    Image(systemName: "xmark")
                        .font(.footnote.weight(.bold))
                        .frame(width: 32, height: 32)
                        .nativeGlass(Circle(), interactive: true)
                }
                .buttonStyle(.plain)
                .accessibilityLabel(language.t("common:receipt.remove"))
            }
            .padding(12)
            .background(NativeStyle.card, in: RoundedRectangle(cornerRadius: 22, style: .continuous))
        }
    }

    // MARK: The check

    private var check: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .top, spacing: 12) {
                thumbnail(size: 48)
                VStack(alignment: .leading, spacing: 3) {
                    Text(language.t("common:receipt.checkTitle")).font(.headline)
                    Text(receipt.note).font(.footnote).foregroundStyle(.secondary)
                }
            }
            VStack(spacing: 0) {
                row(language.t("common:receipt.merchant")) {
                    TextField(language.t("common:receipt.merchant"), text: $receipt.merchant)
                        .multilineTextAlignment(.trailing)
                        .accessibilityIdentifier("receipt.merchant")
                }
                Divider()
                row(language.t("common:receipt.total")) {
                    TextField("0", text: Binding(get: { receipt.total }, set: { receipt.setTotal($0) }))
                        .keyboardType(.decimalPad)
                        .multilineTextAlignment(.trailing)
                        .monospacedDigit()
                        .accessibilityIdentifier("receipt.total")
                    Picker(language.t("common:receipt.currency"), selection: $receipt.currency) {
                        ForEach(receipt.currencyOptions, id: \.self) { code in
                            Text(verbatim: code.isEmpty ? "—" : code).tag(code)
                        }
                    }
                    .pickerStyle(.menu)
                    .labelsHidden()
                    .fixedSize()
                }
                Divider()
                row(language.t("common:receipt.date")) {
                    if receipt.date.isEmpty {
                        Button { receipt.date = ISODay.string(Date()) } label: { Text(verbatim: "—") }
                    } else {
                        DatePicker("", selection: Binding(get: { ISODay.date(receipt.date) ?? Date() },
                                                          set: { receipt.date = ISODay.string($0) }),
                                   displayedComponents: .date)
                            .labelsHidden()
                    }
                }
            }
            .padding(.horizontal, 14)
            .background(Theme.Colors.subtle, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
            HStack(spacing: 10) {
                Button { receipt.clear() } label: {
                    Text(language.t("common:actions.cancel")).frame(maxWidth: .infinity)
                }
                .nativeGlassButton()
                Button(action: use) {
                    Label(language.t("common:receipt.use"), systemImage: "checkmark").frame(maxWidth: .infinity)
                }
                .nativeGlassButton(prominent: true)
                .accessibilityIdentifier("receipt.use")
            }
        }
        .padding(16)
        .background(NativeStyle.card, in: RoundedRectangle(cornerRadius: 22, style: .continuous))
    }

    private func row<Content: View>(_ title: String, @ViewBuilder content: () -> Content) -> some View {
        HStack(spacing: 10) {
            Text(title).foregroundStyle(.secondary)
            Spacer(minLength: 8)
            content()
        }
        .frame(minHeight: 44)
    }

    @ViewBuilder private func thumbnail(size: CGFloat) -> some View {
        Group {
            if let photo {
                Image(uiImage: photo).resizable().scaledToFill()
            } else {
                Image(systemName: "doc.text").font(.title3).foregroundStyle(NativeStyle.tint)
            }
        }
        .frame(width: size, height: size)
        .background(Theme.Colors.subtle)
        .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
        .accessibilityLabel(language.t("common:receipt.alt"))
    }
}

/// Picking and reading the receipt's photo for the Add sheet: the camera as a
/// full-screen cover, the library as the system's picker, then Vision.
@MainActor
struct ReceiptCapture: ViewModifier {
    let receipt: ReceiptModel
    @Binding var camera: Bool
    @Binding var library: Bool
    @Binding var photo: UIImage?
    @State private var pick: PhotosPickerItem?

    func body(content: Content) -> some View {
        content
            .photosPicker(isPresented: $library, selection: $pick, matching: .images)
            .fullScreenCover(isPresented: $camera) {
                CameraPicker { image in
                    camera = false
                    if let image { read(image) }
                }
                .ignoresSafeArea()
            }
            .onChange(of: pick) { _, item in
                guard let item else { return }
                pick = nil
                Task {
                    if let data = try? await item.loadTransferable(type: Data.self), let image = UIImage(data: data) {
                        read(image)
                    } else {
                        receipt.failed(opening: true)
                    }
                }
            }
    }

    private func read(_ image: UIImage) {
        photo = image
        receipt.started()
        Task {
            do {
                let boxes = try await ReceiptReader.boxes(in: image)
                receipt.read(boxes: boxes)
            } catch {
                receipt.failed()
            }
        }
    }
}
