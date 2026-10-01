// Settings › Account (AccountModel): your picture with Change photo (not on
// the shared demo account), your name and default currency with Save
// changes, then Getting paid with its own Save. Edits happen in place.
import PhotosUI
import SwiftUI

@MainActor
struct AccountView: View {
    @Bindable var model: AccountModel
    let email: String
    @Environment(AppLanguage.self) private var language
    @State private var pick: PhotosPickerItem?

    var body: some View {
        List {
            switch model.state {
            case .loading:
                Section { NativeLoading() }.listRowBackground(Color.clear)
            case .failed(let message):
                Section { NativeFailed(message: message) { await model.load() } }.listRowBackground(Color.clear)
            case .loaded:
                if let message = model.message {
                    Section { NativeNotice(text: message, warning: model.warning) }.listRowBackground(NativeStyle.card)
                }
                header
                profile
                payment
            }
        }
        .listStyle(.insetGrouped)
        .scrollContentBackground(.hidden)
        .background(NativeStyle.canvas)
        .scrollDismissesKeyboard(.interactively)
        .nativeTabBarRoom()
        .navigationTitle(language.t("settings:account.title"))
        .task { await model.load() }
        .onChange(of: pick) { _, item in
            guard let item else { return }
            Task {
                if let data = try? await item.loadTransferable(type: Data.self), let image = UIImage(data: data),
                   let jpeg = AccountView.jpeg(image) {
                    await model.uploadPhoto(jpeg)
                }
                pick = nil
            }
        }
    }

    /// Your picture, name and email, with Change photo.
    private var header: some View {
        Section {
            VStack(spacing: 10) {
                ZStack {
                    if let avatar = model.avatar { NativeAvatar(avatar: avatar, size: 84) }
                    if model.uploading { ProgressView() }
                }
                Text(model.savedName.isEmpty ? language.t("settings:yourName") : model.savedName)
                    .font(.title3.weight(.semibold))
                Text(email).font(.subheadline).foregroundStyle(.secondary)
                if !model.isDemo {
                    PhotosPicker(selection: $pick, matching: .images) {
                        Label(language.t("settings:account.changePhoto"), systemImage: "camera.fill")
                            .font(.subheadline.weight(.semibold))
                            .padding(.horizontal, 16)
                            .frame(minHeight: 36)
                            .nativeGlass(Capsule(), interactive: true)
                    }
                    .buttonStyle(.plain)
                    .disabled(model.uploading)
                    .accessibilityIdentifier("account.photo")
                }
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 8)
        }
        .listRowBackground(Color.clear)
    }

    /// Name and default currency, then Save changes.
    private var profile: some View {
        Section {
            HStack {
                Text(language.t("settings:account.name"))
                Spacer(minLength: 16)
                TextField(language.t("settings:yourName"), text: $model.name)
                    .multilineTextAlignment(.trailing)
                    .textContentType(.name)
                    .accessibilityIdentifier("account.name")
            }
            if model.currencyLocked {
                LabeledContent(language.t("settings:account.currency"), value: model.currency)
            } else {
                Picker(language.t("settings:account.currency"), selection: $model.currency) {
                    ForEach(model.currencyOptions, id: \.self) { code in Text(verbatim: code).tag(code) }
                }
                .accessibilityIdentifier("account.currency")
            }
            Button {
                Task { await model.saveProfile() }
            } label: {
                Text(language.t("settings:account.save")).fontWeight(.semibold)
            }
            .disabled(model.busy)
            .accessibilityIdentifier("account.save")
        } header: {
            NativeCapsHeader(title: language.t("settings:account.profile"))
        } footer: {
            if model.currencyLocked {
                Text([language.t("settings:account.currencyLocked"), language.t("settings:account.currencyLockedMore")]
                    .joined(separator: " "))
            }
        }
        .listRowBackground(NativeStyle.card)
    }

    /// Getting paid: the IBAN, Revolut tag and PayPal.me name, then Save.
    private var payment: some View {
        Section {
            field("settings:payment.iban", text: $model.iban, id: "account.iban")
            field("settings:payment.revolut", prompt: "settings:payment.revolutPlaceholder", text: $model.revolut,
                  id: "account.revolut")
            field("settings:payment.paypal", prompt: "settings:payment.paypalPlaceholder", text: $model.paypal,
                  id: "account.paypal")
            Button {
                Task { await model.savePayment() }
            } label: {
                Text(language.t("settings:account.save")).fontWeight(.semibold)
            }
            .disabled(model.busy)
            .accessibilityIdentifier("account.savePayment")
        } header: {
            NativeCapsHeader(title: language.t("settings:payment.title"))
        } footer: {
            Text(language.t("settings:payment.lead"))
        }
        .listRowBackground(NativeStyle.card)
    }

    private func field(_ label: String, prompt: String? = nil, text: Binding<String>, id: String) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(language.t(label)).font(.footnote).foregroundStyle(.secondary)
            TextField(prompt.map { language.t($0) } ?? "", text: text)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
                .accessibilityIdentifier(id)
        }
        .padding(.vertical, 2)
    }

    /// The photo as a JPEG at most 1024 px across (the avatars bucket's limit is generous; a profile picture needs no more).
    static func jpeg(_ image: UIImage) -> Data? {
        let side = max(image.size.width, image.size.height)
        let scale = min(1, 1024 / max(side, 1))
        let size = CGSize(width: image.size.width * scale, height: image.size.height * scale)
        let format = UIGraphicsImageRendererFormat()
        format.scale = 1
        let resized = UIGraphicsImageRenderer(size: size, format: format).image { _ in
            image.draw(in: CGRect(origin: .zero, size: size))
        }
        return resized.jpegData(compressionQuality: 0.85)
    }
}
