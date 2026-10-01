// Sign-in, the web's Login page's words and order under the wordmark (its
// mark drawing itself as the website's loader does): email and password, then
// "or continue with" and the Google button (Google's own look: white, the
// four-colour G, "Sign in with Google"). Passkeys come with their phase.
import BudgeerCore
import SwiftUI

@MainActor
@Observable
final class SignInViewModel {
    var email = ""
    var password = ""
    private(set) var submitting = false
    /// Google's sheet is open (or its answer is being checked).
    private(set) var googleBusy = false
    /// A "ns:key" of the message to show, or nil.
    private(set) var errorKey: String?

    var canSubmit: Bool {
        !submitting && !googleBusy && !email.trimmingCharacters(in: .whitespaces).isEmpty && !password.isEmpty
    }

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

    /// "Sign in with Google": the legal check follows as for email. Closing
    /// Google's sheet is no error.
    func signInWithGoogle(session: SessionStore) async {
        guard !submitting, !googleBusy else { return }
        googleBusy = true
        errorKey = nil
        defer { googleBusy = false }
        do {
            try await session.signIn(with: .google)
        } catch SignInError.cancelled {
            // The user changed their mind.
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
        case .unsupported, .cancelled: return "common:errors.generic"
        }
    }
}

@MainActor
struct SignInView: View {
    @Bindable var model: SignInViewModel
    let session: SessionStore
    /// The website (Forgot password and Sign up open there); nil leaves them out.
    var site: String? = nil
    @Environment(AppLanguage.self) private var language
    @State private var showPassword = false
    @FocusState private var focus: Field?

    private enum Field { case email, password }

    var body: some View {
        ScrollView {
            VStack(spacing: 22) {
                // The wordmark, playing the website's loading ring once.
                BrandIntro()
                    .padding(.top, 48)
                    .padding(.bottom, 10)
                VStack(spacing: 6) {
                    Text(language.t("auth:login.title"))
                        .font(NativeStyle.title(24, lang: language.current))
                        .multilineTextAlignment(.center)
                    Text(language.t("auth:login.subtitle"))
                        .foregroundStyle(.secondary)
                        .multilineTextAlignment(.center)
                }
                fields
                if let key = model.errorKey {
                    Text(language.t(key))
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(NativeStyle.negative)
                        .multilineTextAlignment(.center)
                        .accessibilityIdentifier("signin.error")
                }
                Button {
                    Task { await model.submit(session: session) }
                } label: {
                    Group {
                        if model.submitting { ProgressView().tint(Color.white) } else { Text(language.t("common:actions.logIn")) }
                    }
                    .frame(maxWidth: .infinity)
                }
                .nativeGlassButton(prominent: true)
                // As on the web, Log in stays live; an empty form simply isn't sent.
                .disabled(model.submitting || model.googleBusy)
                .accessibilityIdentifier("signin.submit")
                divider
                Button {
                    Task { await model.signInWithGoogle(session: session) }
                } label: {
                    HStack(spacing: 8) {
                        if model.googleBusy { ProgressView().tint(Color(hex: 0x2D3748)) } else { GoogleMark(size: 20) }
                        Text(language.t("auth:login.google"))
                    }
                }
                .buttonStyle(GoogleButtonStyle())
                .disabled(model.submitting || model.googleBusy)
                .accessibilityIdentifier("signin.google")
                if let site, let url = URL(string: site + "/login?signup=1") {
                    Link(destination: url) {
                        SignUpLine(nodes: (try? BudgeerCore.shared.json("translate", "parseRich", [language.t("auth:login.switch")]))
                                   ?? [.string(language.t("auth:login.switch"))])
                    }
                }
                Text(language.t("common:hobby.disclaimer"))
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
                    .padding(.top, 8)
            }
            .padding(.horizontal, 24)
            .padding(.bottom, 32)
        }
        .scrollBounceBehavior(.basedOnSize)
        .scrollDismissesKeyboard(.interactively)
        .background(NativeStyle.canvas.ignoresSafeArea())
    }

    /// Email and password in one inset card, then "Forgot password?".
    private var fields: some View {
        VStack(alignment: .trailing, spacing: 8) {
            VStack(spacing: 0) {
                TextField(language.t("auth:email"), text: $model.email)
                    .textContentType(.emailAddress)
                    .keyboardType(.emailAddress)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                    .submitLabel(.next)
                    .focused($focus, equals: .email)
                    .onSubmit { focus = .password }
                    .padding(.vertical, 14)
                    .accessibilityIdentifier("signin.email")
                Divider()
                HStack(spacing: 8) {
                    Group {
                        if showPassword {
                            TextField(language.t("auth:password.label"), text: $model.password)
                        } else {
                            SecureField(language.t("auth:password.label"), text: $model.password)
                        }
                    }
                    .textContentType(.password)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                    .submitLabel(.go)
                    .focused($focus, equals: .password)
                    .onSubmit { Task { await model.submit(session: session) } }
                    .accessibilityIdentifier("signin.password")
                    Button { showPassword.toggle() } label: {
                        Image(systemName: showPassword ? "eye.slash" : "eye")
                            .foregroundStyle(.secondary)
                            .frame(width: 44, height: 44)
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel(language.t(showPassword ? "auth:password.hide" : "auth:password.show"))
                }
            }
            .padding(.horizontal, 16)
            .background(NativeStyle.card, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
            if let site, let url = URL(string: site + "/forgot-password") {
                Link(language.t("auth:login.forgot"), destination: url)
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(NativeStyle.tint)
            }
        }
    }

    /// "or continue with" between hairlines.
    private var divider: some View {
        HStack(spacing: 12) {
            Rectangle().fill(Color.primary.opacity(0.12)).frame(height: 1)
            Text(language.t("auth:orContinue")).font(.caption).foregroundStyle(.secondary).fixedSize()
            Rectangle().fill(Color.primary.opacity(0.12)).frame(height: 1)
        }
    }
}

/// "Don't have an account? Sign up": the words, the action in the accent.
private struct SignUpLine: View {
    let nodes: JSONValue

    var body: some View {
        (nodes.arrayValue ?? []).reduce(Text(verbatim: "")) { line, node in
            if let plain = node.stringValue { return line + Text(plain).foregroundColor(.secondary) }
            let inner = (node["children"]?.arrayValue ?? []).compactMap(\.stringValue).joined()
            return line + Text(inner).foregroundColor(NativeStyle.tint).fontWeight(.semibold)
        }
        .font(.subheadline)
        .multilineTextAlignment(.center)
    }
}

/// Google's button, as Google asks it drawn: white in both themes (the mark
/// is made for a light surface), dark grey words and a light grey hairline.
struct GoogleButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        GoogleButtonBody(label: configuration.label, pressed: configuration.isPressed)
    }
}

private struct GoogleButtonBody<Label: View>: View {
    let label: Label
    let pressed: Bool
    @Environment(\.isEnabled) private var isEnabled

    var body: some View {
        label
            .font(.body.weight(.semibold))
            .foregroundStyle(Color(hex: 0x2D3748))
            .frame(maxWidth: .infinity, minHeight: 48)
            .background(pressed ? Color(hex: 0xEDF2F7) : Color.white, in: Capsule())
            .overlay(Capsule().stroke(Color(hex: 0xCBD5E0), lineWidth: 1))
            .opacity(isEnabled ? 1 : 0.6)
    }
}
