// Sign-in, the web's Login page's words and order: email and password, then
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
    @Environment(AppAppearance.self) private var appearance
    @Environment(\.colorScheme) private var scheme
    @State private var showPassword = false
    @FocusState private var focus: Field?

    private enum Field { case email, password }

    var body: some View {
        VStack(spacing: 0) {
            topBar
            ScrollView {
                VStack(spacing: Theme.Space.s6) {
                    card
                    Text(language.t("common:hobby.disclaimer"))
                        .kitText(12, color: Theme.Colors.textMuted)
                        .multilineTextAlignment(.center)
                }
                .padding(.horizontal, Theme.Space.s4)
                .padding(.top, Theme.Space.s12)
                .padding(.bottom, Theme.Space.s8)
            }
            .scrollBounceBehavior(.basedOnSize)
            .scrollDismissesKeyboard(.interactively)
        }
        .background(Theme.Colors.canvas.ignoresSafeArea())
    }

    /// The public pages' bar (PublicHeader on a phone): the mark, and the
    /// light/dark switch.
    private var topBar: some View {
        HStack {
            BrandMark(size: 26)
            Spacer()
            Button {
                appearance.toggle(from: scheme)
            } label: {
                LucideIcon(icon: scheme == .dark ? .sun : .moon, size: 18)
                    .foregroundStyle(Theme.Colors.textMuted)
                    .frame(width: 44, height: 44)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel(language.t("shell:toggleTheme"))
        }
        .padding(.horizontal, Theme.Space.s4)
        .padding(.vertical, Theme.Space.s1)
    }

    private var card: some View {
        VStack(alignment: .leading, spacing: Theme.Space.s4) {
            VStack(spacing: Theme.Space.s2) {
                Text(language.t("auth:login.title"))
                    .kitHeading(24, tracking: -0.02)
                Text(language.t("auth:login.subtitle"))
                    .kitText(16, color: Theme.Colors.textMuted)
                    .multilineTextAlignment(.center)
            }
            .frame(maxWidth: .infinity)
            .padding(.bottom, Theme.Space.s2)
            FormRow(label: language.t("auth:email"), required: true) {
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
            FormRow(label: language.t("auth:password.label"), required: true) {
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
                        LucideIcon(icon: showPassword ? .eyeOff : .eye, size: 18)
                            .foregroundStyle(Theme.Colors.textMuted)
                            .frame(width: 32, height: 32)
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel(language.t(showPassword ? "auth:password.hide" : "auth:password.show"))
                }
                .padding(.trailing, -8)
                .fieldStyle()
            }
            if let site, let url = URL(string: site + "/forgot-password") {
                HStack {
                    Spacer()
                    Link(language.t("auth:login.forgot"), destination: url)
                        .font(Theme.Fonts.body(14, weight: .semibold, lang: language.current))
                        .foregroundStyle(Theme.Colors.accentFg)
                }
                .padding(.top, -Theme.Space.s2)
            }
            if let key = model.errorKey {
                Text(language.t(key))
                    .kitText(14, .semibold, color: Theme.Colors.negative)
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
            // As on the web, Log in stays live; an empty form simply isn't sent.
            .disabled(model.submitting || model.googleBusy)
            .accessibilityIdentifier("signin.submit")
            divider
            Button {
                Task { await model.signInWithGoogle(session: session) }
            } label: {
                HStack(spacing: Theme.Space.s2) {
                    if model.googleBusy {
                        ProgressView().tint(Color(hex: 0x2D3748))
                    } else {
                        GoogleMark(size: 20)
                    }
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
                .frame(maxWidth: .infinity)
                .padding(.top, Theme.Space.s2)
            }
        }
        .padding(Theme.Space.s5)
        .panelSurface()
    }

    /// "or continue with" between hairlines.
    private var divider: some View {
        HStack(spacing: Theme.Space.s3) {
            Rectangle().fill(Theme.Colors.border).frame(height: 1)
            Text(language.t("auth:orContinue"))
                .kitText(12, color: Theme.Colors.textMuted)
                .fixedSize()
            Rectangle().fill(Theme.Colors.border).frame(height: 1)
        }
    }
}

/// "Don't have an account? Sign up": the words, the action in the accent.
private struct SignUpLine: View {
    let nodes: JSONValue
    @Environment(AppLanguage.self) private var language

    var body: some View {
        (nodes.arrayValue ?? []).reduce(Text("")) { line, node in
            if let plain = node.stringValue { return line + Text(plain).foregroundColor(Theme.Colors.textMuted) }
            let inner = (node["children"]?.arrayValue ?? []).compactMap(\.stringValue).joined()
            return line + Text(inner).foregroundColor(Theme.Colors.accentFg).fontWeight(.semibold)
        }
        .font(Theme.Fonts.body(14, lang: language.current))
        .multilineTextAlignment(.center)
    }
}

/// Google's button, as the web draws it: white in both themes (the mark is
/// made for a light surface), Chakra's gray.700 text and gray.300 hairline.
struct GoogleButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        GoogleButtonBody(label: configuration.label, pressed: configuration.isPressed)
    }
}

private struct GoogleButtonBody<Label: View>: View {
    let label: Label
    let pressed: Bool
    @Environment(\.isEnabled) private var isEnabled
    @Environment(AppLanguage.self) private var language

    var body: some View {
        label
            .font(Theme.Fonts.body(16, weight: .semibold, lang: language.current))
            .foregroundStyle(Color(hex: 0x2D3748))
            .frame(maxWidth: .infinity, minHeight: 40)
            .background(pressed ? Color(hex: 0xEDF2F7) : Color.white)
            .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.lg, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: Theme.Radius.lg, style: .continuous)
                .stroke(Color(hex: 0xCBD5E0), lineWidth: 1))
            .opacity(isEnabled ? 1 : 0.6)
    }
}
