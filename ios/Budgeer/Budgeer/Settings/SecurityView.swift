// Settings › Security (SecurityModel): "Log in again" when a fresh sign-in
// is needed, the sign-in methods with Connect / Disconnect for Google and
// Apple and "Set a password" for an account without one, Change password, and the
// danger zone's Delete account, which asks once more in a sheet (the only
// confirmation here). On the shared demo account, the demo note instead.
import AuthenticationServices
import SwiftUI

@MainActor
struct SecurityView: View {
    @Bindable var model: SecurityModel
    @Environment(AppLanguage.self) private var language
    @Environment(\.webAuthenticationSession) private var webAuthenticationSession
    @State private var deleting = false
    @State private var apple = AppleAuthorizer()

    var body: some View {
        List {
            switch model.state {
            case .loading:
                Section { NativeLoading() }.listRowBackground(Color.clear)
            case .failed(let message):
                Section { NativeFailed(message: message) { await model.load() } }.listRowBackground(Color.clear)
            case .loaded:
                if model.isDemo {
                    Section { DemoNotice(text: language.t("settings:security.demo")) }.listRowBackground(NativeStyle.card)
                } else {
                    page
                }
            }
        }
        .listStyle(.insetGrouped)
        .scrollContentBackground(.hidden)
        .background(NativeStyle.canvas)
        .scrollDismissesKeyboard(.interactively)
        .nativeTabBarRoom()
        .navigationTitle(language.t("settings:security.title"))
        .task { await model.load() }
        .sheet(isPresented: $deleting) {
            DeleteAccountSheet(model: model).environment(language)
        }
    }

    @ViewBuilder private var page: some View {
        if let message = model.message {
            Section { NativeNotice(text: message, warning: model.warning) }.listRowBackground(NativeStyle.card)
        }
        if let reauth = model.reauthText {
            Section {
                ReauthRow(text: reauth) { Task { await model.logInAgain() } }
            }
            .listRowBackground(NativeStyle.card)
        }
        methods
        if model.settingFirst { firstPassword }
        if model.hasPassword { changePassword }
        Section {
            Button(role: .destructive) {
                model.deleteValue = ""
                deleting = true
            } label: {
                Label(language.t("settings:deleteAccount.open"), systemImage: "trash")
            }
            .accessibilityIdentifier("security.delete")
        } header: {
            Text(language.t("settings:deleteAccount.dangerZone").capsLabel)
                .textCase(nil)
                .foregroundStyle(NativeStyle.negative)
        } footer: {
            Text(language.t("settings:deleteAccount.lead"))
        }
        .listRowBackground(NativeStyle.card)
    }

    // MARK: Sign-in methods

    private var methods: some View {
        Section {
            ForEach(model.methods) { method in
                HStack(spacing: 14) {
                    if method.key == "google" {
                        GoogleMark(size: 18)
                            .frame(width: 30, height: 30)
                            .background(Theme.Colors.subtle, in: RoundedRectangle(cornerRadius: 7, style: .continuous))
                    } else if method.key == "apple" {
                        Image(systemName: "apple.logo")
                            .font(.system(size: 16, weight: .medium))
                            .foregroundStyle(.primary)
                            .frame(width: 30, height: 30)
                            .background(Theme.Colors.subtle, in: RoundedRectangle(cornerRadius: 7, style: .continuous))
                    } else {
                        NativeIconTile(symbol: method.key == "password" ? "key.fill" : "person.badge.key.fill",
                                       color: NativeTone.sand)
                    }
                    VStack(alignment: .leading, spacing: 2) {
                        Text(method.label)
                        Text(method.detail).font(.footnote).foregroundStyle(.secondary).lineLimit(1)
                    }
                    Spacer(minLength: 8)
                    action(method)
                }
                .padding(.vertical, 2)
            }
        } header: {
            NativeCapsHeader(title: language.t("settings:signIn.title"))
        } footer: {
            VStack(alignment: .leading, spacing: 6) {
                Text(language.t("settings:signIn.subtitle"))
                ForEach(model.methods.filter { $0.connected && model.blocks[$0.key] != nil }) { method in
                    Text(model.blocks[method.key] ?? "")
                }
            }
        }
        .listRowBackground(NativeStyle.card)
    }

    @ViewBuilder private func action(_ method: SignInMethodRow) -> some View {
        if method.key == "google" || method.key == "apple" {
            if method.connected {
                Button(language.t("settings:signIn.disconnect")) { Task { await model.disconnect(method.key) } }
                    .buttonStyle(.bordered)
                    .disabled(model.blocks[method.key] != nil || model.busy)
                    .accessibilityIdentifier("security.disconnect.\(method.key)")
            } else {
                Button(language.t("settings:signIn.connect")) {
                    if method.key == "apple" { connectApple() } else { connectGoogle() }
                }
                .buttonStyle(.borderedProminent)
                .disabled(model.busy)
                .accessibilityIdentifier("security.connect.\(method.key)")
            }
        } else if method.key == "password" && !method.connected && !model.settingFirst {
            Button(language.t("settings:signIn.setPassword")) { model.settingFirst = true }
                .buttonStyle(.borderedProminent)
                .accessibilityIdentifier("security.setPassword")
        }
    }

    /// Google's consent in the system's web sheet, then back into the session.
    private func connectGoogle() {
        Task {
            guard let url = await model.googleLinkURL() else { return }
            do {
                let callback = try await webAuthenticationSession.authenticate(
                    using: url, callbackURLScheme: SupabaseAuthService.callback.scheme ?? "")
                await model.finishLink(callback)
            } catch let error as ASWebAuthenticationSessionError where error.code == .canceledLogin {
                // Closed: nothing to say.
            } catch {
                model.linkFailed("google")
            }
        }
    }

    /// Apple's own sheet, then its token linked to this account.
    private func connectApple() {
        Task {
            guard await model.mayConnect() else { return }
            do {
                await model.connectApple(try await apple.authorize())
            } catch {
                if !isAppleCancel(error) { model.linkFailed("apple") }
            }
        }
    }

    // MARK: Passwords

    /// A first password for a Google-only account.
    private var firstPassword: some View {
        Section {
            SecureField(language.t("auth:password.new"), text: $model.next)
                .textContentType(.newPassword)
                .accessibilityIdentifier("security.firstNew")
            SecureField(language.t("auth:password.confirm"), text: $model.confirm)
                .textContentType(.newPassword)
            HStack {
                Button(language.t("common:actions.cancel")) {
                    model.settingFirst = false
                    model.next = ""
                    model.confirm = ""
                }
                .buttonStyle(.borderless)
                Spacer()
                Button(language.t("settings:signIn.firstPassword.submit")) { Task { await model.setFirstPassword() } }
                    .buttonStyle(.borderedProminent)
                    .disabled(!model.canSetFirst)
                    .accessibilityIdentifier("security.firstSubmit")
            }
        } header: {
            NativeCapsHeader(title: language.t("settings:signIn.setPassword"))
        } footer: {
            Text([language.t("settings:signIn.firstPassword.lead", ["email": .string(model.email)]),
                  language.t("auth:password.hint")].joined(separator: " "))
        }
        .listRowBackground(NativeStyle.card)
    }

    private var changePassword: some View {
        Section {
            SecureField(language.t("settings:password.current"), text: $model.current)
                .textContentType(.password)
                .accessibilityIdentifier("security.current")
            SecureField(language.t("auth:password.new"), text: $model.next)
                .textContentType(.newPassword)
                .accessibilityIdentifier("security.new")
            SecureField(language.t("auth:password.confirmNew"), text: $model.confirm)
                .textContentType(.newPassword)
                .accessibilityIdentifier("security.confirm")
            Button {
                Task { await model.changePassword() }
            } label: {
                Text(language.t("auth:password.update")).fontWeight(.semibold)
            }
            .disabled(!model.canChangePassword)
            .accessibilityIdentifier("security.update")
        } header: {
            NativeCapsHeader(title: language.t("settings:password.title"))
        } footer: {
            Text(language.t("auth:password.hint"))
        }
        .listRowBackground(NativeStyle.card)
    }
}

/// "Please sign in again to …" with Log in again (ReauthNotice).
struct ReauthRow: View {
    let text: String
    let logIn: () -> Void
    @Environment(AppLanguage.self) private var language

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(text).font(.subheadline).foregroundStyle(.secondary)
            Button(action: logIn) {
                Label(language.t("settings:reauth.logInAgain"), systemImage: "arrow.right.circle.fill")
                    .font(.subheadline.weight(.semibold))
            }
            .buttonStyle(.bordered)
            .accessibilityIdentifier("security.logInAgain")
        }
        .padding(.vertical, 4)
    }
}

/// Delete your account? What goes and what stays, then the password (or a
/// fresh sign-in and DELETE typed), and Delete.
@MainActor
struct DeleteAccountSheet: View {
    @Bindable var model: SecurityModel
    @Environment(AppLanguage.self) private var language
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            List {
                Section {
                    Text(language.t("settings:deleteAccount.warning")).font(.subheadline)
                }
                .listRowBackground(NativeStyle.card)
                Section {
                    ForEach(model.deletionScope.deleted, id: \.self) { line in
                        Label(line, systemImage: "minus.circle").font(.subheadline)
                    }
                } header: {
                    NativeCapsHeader(title: language.t("settings:deleteAccount.deletedList"))
                }
                .listRowBackground(NativeStyle.card)
                Section {
                    ForEach(model.deletionScope.stays, id: \.self) { line in
                        Label(line, systemImage: "person.2").font(.subheadline)
                    }
                } header: {
                    NativeCapsHeader(title: language.t("settings:deleteAccount.staysList"))
                }
                .listRowBackground(NativeStyle.card)
                if let check = model.deleteCheck {
                    Section {
                        if check.needsReauth {
                            ReauthRow(text: language.t("common:errors.reauth.deleteAccount")) {
                                dismiss()
                                Task { await model.logInAgain() }
                            }
                        } else if check.password {
                            SecureField(check.placeholder, text: $model.deleteValue)
                                .textContentType(.password)
                                .accessibilityIdentifier("security.deleteValue")
                        } else {
                            TextField(check.placeholder, text: $model.deleteValue)
                                .textInputAutocapitalization(.characters)
                                .autocorrectionDisabled()
                                .accessibilityIdentifier("security.deleteValue")
                        }
                    } header: {
                        if !check.needsReauth { NativeCapsHeader(title: check.label) }
                    } footer: {
                        if let message = model.message, model.warning { Text(message).foregroundStyle(NativeStyle.negative) }
                    }
                    .listRowBackground(NativeStyle.card)
                }
            }
            .listStyle(.insetGrouped)
            .scrollContentBackground(.hidden)
            .background(NativeStyle.canvas)
            .navigationTitle(language.t("settings:deleteAccount.confirmTitle"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(language.t("common:actions.cancel")) { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button(role: .destructive) {
                        Task { if await model.deleteAccount() { dismiss() } }
                    } label: {
                        if model.busy {
                            ProgressView()
                        } else {
                            Text(language.t("settings:deleteAccount.submit")).fontWeight(.semibold)
                        }
                    }
                    .tint(NativeStyle.negative)
                    .disabled(!(model.deleteCheck?.canSubmit ?? false) || model.busy)
                    .accessibilityIdentifier("security.deleteConfirm")
                }
            }
        }
    }
}
