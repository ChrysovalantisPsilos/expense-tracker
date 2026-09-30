// Email and password sign-in, the web's Login page's words. Google, Apple
// and passkeys come with their phase, and with them the web's "or continue
// with" divider under the form: an empty one would promise nothing.
import SwiftUI

@MainActor
@Observable
final class SignInViewModel {
    var email = ""
    var password = ""
    private(set) var submitting = false
    /// A "ns:key" of the message to show, or nil.
    private(set) var errorKey: String?

    var canSubmit: Bool { !submitting && !email.trimmingCharacters(in: .whitespaces).isEmpty && !password.isEmpty }

    func submit(session: SessionStore) async {
        guard canSubmit else { return }
        submitting = true
        errorKey = nil
        defer { submitting = false }
        do {
            try await session.signIn(email: email.trimmingCharacters(in: .whitespaces), password: password)
        } catch {
            errorKey = SignInViewModel.messageKey(for: error)
        }
    }

    /// Supabase Auth's codes → the web's copy (shared/lib/errors.js AUTH_MESSAGES).
    static func messageKey(for error: Error) -> String {
        guard let authError = error as? SignInError else { return "common:errors.generic" }
        switch authError {
        case .rejected(let code, _):
            switch code {
            case "invalid_credentials": return "common:errors.auth.invalidCredentials"
            case "email_not_confirmed": return "common:errors.auth.emailNotConfirmed"
            case "over_request_rate_limit": return "common:errors.tooMany"
            case "email_address_invalid": return "common:errors.emailInvalid"
            default: return "auth:serverError"
            }
        case .network: return "common:errors.connection"
        case .unsupported: return "common:errors.generic"
        }
    }
}

@MainActor
struct SignInView: View {
    @Bindable var model: SignInViewModel
    let session: SessionStore
    @Environment(AppLanguage.self) private var language
    @State private var showPassword = false
    @FocusState private var focus: Field?

    private enum Field { case email, password }

    var body: some View {
        ScrollView {
            VStack(spacing: Theme.Space.s6) {
                header
                form
                Text(language.t("common:hobby.disclaimer"))
                    .font(Theme.Fonts.body(12, lang: language.current))
                    .foregroundStyle(Theme.Colors.textMuted)
                    .multilineTextAlignment(.center)
            }
            .padding(Theme.Space.s5)
            .padding(.top, Theme.Space.s10)
        }
        .scrollBounceBehavior(.basedOnSize)
        .background(Theme.Colors.canvas.ignoresSafeArea())
    }

    private var header: some View {
        VStack(spacing: Theme.Space.s2) {
            Image(systemName: "b.circle.fill")
                .font(.system(size: 44, weight: .bold))
                .foregroundStyle(Theme.Palette.brand500)
                .accessibilityHidden(true)
            Text(language.t("auth:login.title"))
                .font(Theme.Fonts.heading(26, weight: .bold, lang: language.current))
                .kerning(-0.26)
                .foregroundStyle(Theme.Colors.textPrimary)
            Text(language.t("auth:login.subtitle"))
                .font(Theme.Fonts.body(15, lang: language.current))
                .foregroundStyle(Theme.Colors.textMuted)
                .multilineTextAlignment(.center)
        }
    }

    private var form: some View {
        VStack(alignment: .leading, spacing: Theme.Space.s4) {
            VStack(alignment: .leading, spacing: Theme.Space.s2) {
                FieldLabel(text: language.t("auth:email"))
                TextField("", text: $model.email)
                    .textContentType(.emailAddress)
                    .keyboardType(.emailAddress)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                    .submitLabel(.next)
                    .focused($focus, equals: .email)
                    .onSubmit { focus = .password }
                    .fieldStyle()
                    .accessibilityIdentifier("signin.email")
            }
            VStack(alignment: .leading, spacing: Theme.Space.s2) {
                FieldLabel(text: language.t("auth:password.label"))
                HStack(spacing: Theme.Space.s2) {
                    Group {
                        if showPassword {
                            TextField("", text: $model.password)
                        } else {
                            SecureField("", text: $model.password)
                        }
                    }
                    .textContentType(.password)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                    .submitLabel(.go)
                    .focused($focus, equals: .password)
                    .onSubmit { Task { await model.submit(session: session) } }
                    .accessibilityIdentifier("signin.password")
                    Button {
                        showPassword.toggle()
                    } label: {
                        Image(systemName: showPassword ? "eye.slash" : "eye")
                            .foregroundStyle(Theme.Colors.textMuted)
                            .frame(width: 32, height: 32)
                    }
                    .accessibilityLabel(language.t(showPassword ? "auth:password.hide" : "auth:password.show"))
                }
                .fieldStyle()
            }
            if let key = model.errorKey {
                Text(language.t(key))
                    .font(Theme.Fonts.body(14, weight: .semibold, lang: language.current))
                    .foregroundStyle(Theme.Colors.negative)
                    .accessibilityIdentifier("signin.error")
            }
            Button {
                Task { await model.submit(session: session) }
            } label: {
                if model.submitting {
                    ProgressView().tint(Theme.Colors.onAccent)
                } else {
                    Text(language.t("common:actions.logIn"))
                }
            }
            .buttonStyle(PrimaryButtonStyle())
            .disabled(!model.canSubmit)
            .accessibilityIdentifier("signin.submit")
        }
        .padding(Theme.Space.s5)
        .background(Theme.Colors.surface)
        .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.xxl, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: Theme.Radius.xxl, style: .continuous).stroke(Theme.Colors.border, lineWidth: 1))
        .shadow(color: Theme.Shadow.softColor, radius: Theme.Shadow.softRadius, y: Theme.Shadow.softY)
    }
}
