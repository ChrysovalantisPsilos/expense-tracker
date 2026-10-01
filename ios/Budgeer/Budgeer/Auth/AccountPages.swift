// The signed-out pages beside Sign in, as the web's: Sign up (email and
// password with the password's rules, the Terms and Privacy tick the web
// records as consent, the hobby-project line, Sign up with Google behind
// the same tick), Check your inbox (signing in by itself once the link is
// opened, Log in, resend it or use a different email), Forgot password
// (the reset link by email), an email link that can't be used (expired or
// used already: what to do), and the new password a reset link leads to. The
// Terms of Use and the Privacy Notice open in Safari inside the app.
import BudgeerCore
import SwiftUI

/// A page pushed over Sign in.
enum AuthPage: Hashable {
    case signUp
    case forgot
    /// An auth email's link that couldn't be used, by its type.
    case expired(String)
}

/// Sign in and its pages, one stack.
@MainActor
struct AuthFlowView: View {
    @Bindable var signIn: SignInViewModel
    let session: SessionStore
    let access: AccountAccess
    let site: String
    @State private var path: [AuthPage] = []
    @State private var signUp: SignUpModel?
    @State private var forgot: ForgotPasswordModel?

    var body: some View {
        NavigationStack(path: $path) {
            SignInView(model: signIn, session: session, onSignUp: openSignUp, onForgot: openForgot)
                .toolbar(.hidden, for: .navigationBar)
                .navigationDestination(for: AuthPage.self) { page in
                    switch page {
                    case .signUp:
                        if let signUp {
                            SignUpView(model: signUp, session: session, access: access, site: site) { email in
                                if let email { signIn.email = email }
                                path.removeAll()
                            }
                        }
                    case .forgot:
                        if let forgot {
                            ForgotPasswordView(model: forgot) { path.removeAll() }
                        }
                    case .expired(let type):
                        ExpiredLinkView(type: type) { to in
                            switch to {
                            case "/forgot-password": openForgot()
                            case "/login?signup=1": openSignUp()
                            default: path.removeAll()
                            }
                        }
                    }
                }
        }
        .tint(NativeStyle.tint)
        // An email link opened in the app that couldn't be used: what to do.
        .onChange(of: session.linkProblem, initial: true) { _, type in
            guard let type else { return }
            session.dismissLinkProblem()
            path = [.expired(type)]
        }
    }

    private func openSignUp() {
        signUp = SignUpModel(access: access, site: site)
        path = [.signUp]
    }

    private func openForgot() {
        forgot = ForgotPasswordModel(access: access, site: site)
        path = [.forgot]
    }
}

// MARK: An email link that can't be used

/// The web's LinkExpired: what happened in plain words, and the ways on
/// (confirmLink.expiredLinkHelp: a new reset link, or log in / sign up again).
@MainActor
struct ExpiredLinkView: View {
    let type: String
    /// One of the help's pages (/forgot-password, /login, /login?signup=1).
    let go: (String) -> Void
    @Environment(AppLanguage.self) private var language

    var body: some View {
        let help = ExpiredLinkHelp.of(type)
        ScrollView {
            VStack(spacing: 18) {
                Image(systemName: "exclamationmark.triangle.fill")
                    .font(.system(size: 40))
                    .foregroundStyle(NativeStyle.warning)
                    .padding(.top, 24)
                Text(language.t("auth:expired.title"))
                    .font(NativeStyle.title(24, lang: language.current))
                    .multilineTextAlignment(.center)
                if let help {
                    Text(help.text)
                        .foregroundStyle(.secondary)
                        .multilineTextAlignment(.center)
                        .accessibilityIdentifier("expired.text")
                    ForEach(Array(help.actions.enumerated()), id: \.element) { index, action in
                        Button { go(action.to) } label: {
                            Text(action.label).frame(maxWidth: .infinity)
                        }
                        .nativeGlassButton(prominent: index == 0)
                        .accessibilityIdentifier("expired.\(index)")
                    }
                }
            }
            .padding(.horizontal, 24)
            .padding(.bottom, 32)
        }
        .background(NativeStyle.canvas.ignoresSafeArea())
        .navigationBarTitleDisplayMode(.inline)
    }
}

// MARK: A new password (a reset link)

/// The web's ResetPassword, full screen while a reset link's session waits
/// for its new password: the new password twice, then Update password.
@MainActor
struct ResetPasswordView: View {
    @Bindable var model: ResetPasswordModel
    @Environment(AppLanguage.self) private var language

    var body: some View {
        ScrollView {
            VStack(spacing: 18) {
                Image(systemName: "key.fill")
                    .font(.system(size: 36))
                    .foregroundStyle(NativeStyle.tint)
                    .padding(.top, 48)
                Text(language.t("auth:reset.title"))
                    .font(NativeStyle.title(24, lang: language.current))
                    .multilineTextAlignment(.center)
                VStack(alignment: .leading, spacing: 6) {
                    VStack(spacing: 0) {
                        SecureField(language.t("auth:password.new"), text: $model.password)
                            .textContentType(.newPassword)
                            .padding(.vertical, 14)
                            .accessibilityIdentifier("reset.password")
                        Divider()
                        SecureField(language.t("auth:password.confirmNew"), text: $model.confirm)
                            .textContentType(.newPassword)
                            .submitLabel(.go)
                            .onSubmit { Task { await model.submit() } }
                            .padding(.vertical, 14)
                            .accessibilityIdentifier("reset.confirm")
                    }
                    .padding(.horizontal, 16)
                    .background(NativeStyle.card, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
                    Text(language.t("auth:password.hint")).font(.footnote).foregroundStyle(.secondary)
                    if let problem = model.problem {
                        Text(problem)
                            .font(.footnote.weight(.semibold))
                            .foregroundStyle(NativeStyle.negative)
                            .accessibilityIdentifier("reset.problem")
                    }
                }
                Button {
                    Task { await model.submit() }
                } label: {
                    Group {
                        if model.busy { ProgressView().tint(Color.white) } else { Text(language.t("auth:password.update")) }
                    }
                    .frame(maxWidth: .infinity)
                }
                .nativeGlassButton(prominent: true)
                .disabled(!model.canSubmit)
                .accessibilityIdentifier("reset.submit")
            }
            .padding(.horizontal, 24)
            .padding(.bottom, 32)
        }
        .scrollDismissesKeyboard(.interactively)
        .background(NativeStyle.canvas.ignoresSafeArea())
    }
}

// MARK: Sign up

@MainActor
struct SignUpView: View {
    @Bindable var model: SignUpModel
    let session: SessionStore
    let access: AccountAccess
    let site: String
    /// Back to Log in (with the address, after Check your inbox).
    let logIn: (String?) -> Void
    @Environment(AppLanguage.self) private var language
    @State private var showPassword = false
    @State private var web: WebPage?
    @FocusState private var focus: Field?

    private enum Field { case email, password }

    var body: some View {
        ScrollView {
            VStack(spacing: 18) {
                VStack(spacing: 6) {
                    Text(language.t("auth:signup.title"))
                        .font(NativeStyle.title(24, lang: language.current))
                        .multilineTextAlignment(.center)
                    Text(language.t("auth:signup.subtitle"))
                        .foregroundStyle(.secondary)
                        .multilineTextAlignment(.center)
                }
                .padding(.top, 12)
                fields
                consent
                Text(language.t("common:hobby.disclaimer"))
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .frame(maxWidth: .infinity, alignment: .leading)
                if let error = model.serverError {
                    Text(error)
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(NativeStyle.negative)
                        .multilineTextAlignment(.center)
                        .accessibilityIdentifier("signup.error")
                }
                Button {
                    Task { await model.submit() }
                } label: {
                    Group {
                        if model.busy { ProgressView().tint(Color.white) } else { Text(language.t("common:actions.signUp")) }
                    }
                    .frame(maxWidth: .infinity)
                }
                .nativeGlassButton(prominent: true)
                .disabled(model.busy || model.googleBusy)
                .accessibilityIdentifier("signup.submit")
                AuthDivider()
                Button {
                    Task { await model.signUpWithGoogle(session: session) }
                } label: {
                    HStack(spacing: 8) {
                        if model.googleBusy { ProgressView().tint(Color(hex: 0x2D3748)) } else { GoogleMark(size: 20) }
                        Text(language.t("auth:signup.google"))
                    }
                }
                .buttonStyle(GoogleButtonStyle())
                .disabled(model.busy || model.googleBusy)
                .accessibilityIdentifier("signup.google")
                Button { logIn(nil) } label: {
                    SwitchLine(nodes: SettingsFigures.rich(language.t("auth:signup.switch")))
                }
                .buttonStyle(.plain)
                .accessibilityIdentifier("signup.login")
            }
            .padding(.horizontal, 24)
            .padding(.bottom, 32)
        }
        .scrollBounceBehavior(.basedOnSize)
        .scrollDismissesKeyboard(.interactively)
        .background(NativeStyle.canvas.ignoresSafeArea())
        .navigationBarTitleDisplayMode(.inline)
        .navigationDestination(item: $model.pending) { pending in
            VerifyEmailHost(pending: pending, session: session, access: access, site: site,
                            changeEmail: { model.pending = nil },
                            logIn: { logIn(pending.email) })
        }
        .sheet(item: $web) { page in SafariView(url: page.url).ignoresSafeArea() }
    }

    /// Email and password in one inset card; each field's error (or the password's hint) under it.
    private var fields: some View {
        VStack(alignment: .leading, spacing: 6) {
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
                    .accessibilityIdentifier("signup.email")
                Divider()
                HStack(spacing: 8) {
                    Group {
                        if showPassword {
                            TextField(language.t("auth:password.label"), text: $model.password)
                        } else {
                            SecureField(language.t("auth:password.label"), text: $model.password)
                        }
                    }
                    .textContentType(.newPassword)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                    .submitLabel(.done)
                    .focused($focus, equals: .password)
                    .accessibilityIdentifier("signup.password")
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
            ForEach(["email", "password"], id: \.self) { field in
                if let error = model.fieldErrors[field] {
                    Text(error).font(.footnote).foregroundStyle(NativeStyle.negative)
                }
            }
            if let hint = model.passwordHint {
                Text(hint).font(.footnote).foregroundStyle(.secondary)
            }
        }
    }

    /// "I'm 16 or older and I accept the Terms of Use and the Privacy Notice.":
    /// the tick, and the sentence with each document's link (in Safari inside the app).
    private var consent: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(alignment: .top, spacing: 12) {
                Button {
                    model.accepted.toggle()
                } label: {
                    Image(systemName: model.accepted ? "checkmark.square.fill" : "square")
                        .font(.title3)
                        .foregroundStyle(model.accepted ? NativeStyle.tint : Color.secondary)
                        .frame(width: 30, height: 30)
                }
                .buttonStyle(.plain)
                .accessibilityLabel(Text(RichLine.make(language.t("auth:signup.consent"))))
                .accessibilityAddTraits(model.accepted ? .isSelected : [])
                .accessibilityIdentifier("signup.consent")
                Text(RichLine.make(language.t("auth:signup.consent"), links: [
                    "terms": RichLine.action("terms"), "privacy": RichLine.action("privacy"),
                ]))
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .frame(maxWidth: .infinity, alignment: .leading)
                .environment(\.openURL, OpenURLAction { url in
                    web = WebPage(url.host() == "terms" ? "/terms" : "/privacy", site: site)
                    return .handled
                })
            }
            if let error = model.consentError {
                Text(error).font(.footnote).foregroundStyle(NativeStyle.negative)
            }
        }
    }
}

// MARK: Check your inbox

@MainActor
private struct VerifyEmailHost: View {
    let pending: PendingSignUp
    let session: SessionStore
    let access: AccountAccess
    let site: String
    let changeEmail: () -> Void
    let logIn: () -> Void
    @State private var model: VerifyEmailModel?

    var body: some View {
        Group {
            if let model {
                VerifyEmailView(model: model, session: session, changeEmail: changeEmail, logIn: logIn)
            } else {
                LoadingView()
            }
        }
        .onAppear {
            if model == nil { model = VerifyEmailModel(pending: pending, access: access, site: site) }
        }
    }
}

@MainActor
struct VerifyEmailView: View {
    let model: VerifyEmailModel
    let session: SessionStore
    let changeEmail: () -> Void
    let logIn: () -> Void
    @Environment(AppLanguage.self) private var language

    var body: some View {
        ScrollView {
            VStack(spacing: 18) {
                Image(systemName: "envelope.badge")
                    .font(.system(size: 40))
                    .foregroundStyle(NativeStyle.tint)
                    .padding(.top, 24)
                Text(language.t("auth:verify.title"))
                    .font(NativeStyle.title(24, lang: language.current))
                VStack(spacing: 2) {
                    Text(language.t("auth:verify.sentTo")).foregroundStyle(.secondary)
                    Text(model.email).fontWeight(.bold)
                }
                .multilineTextAlignment(.center)
                status
                VStack(spacing: 8) {
                    if let message = model.message {
                        NativeNotice(text: message, warning: model.warning)
                    }
                    noEmail
                }
            }
            .padding(.horizontal, 24)
            .padding(.bottom, 32)
        }
        .background(NativeStyle.canvas.ignoresSafeArea())
        .navigationBarTitleDisplayMode(.inline)
        .task { await model.wait(session: session) }
        .task {
            while !Task.isCancelled {
                try? await Task.sleep(nanoseconds: 1_000_000_000)
                model.tick()
            }
        }
        .onDisappear { model.stop() }
    }

    /// Waiting (it goes on by itself), or a plain Log in once it gave up.
    private var status: some View {
        VStack(spacing: 6) {
            if model.status == .gaveUp {
                Text(language.t("auth:verify.stillWaiting")).fontWeight(.bold)
                Text(language.t("auth:verify.logInBody")).font(.subheadline).foregroundStyle(.secondary)
                Button(language.t("common:actions.logIn")) { logIn() }
                    .nativeGlassButton(prominent: true)
                    .padding(.top, 6)
                    .accessibilityIdentifier("verify.login")
            } else {
                HStack(spacing: 10) {
                    ProgressView()
                    Text(language.t("auth:verify.waiting")).fontWeight(.bold)
                }
                Text(language.t("auth:verify.waitingBody")).font(.subheadline).foregroundStyle(.secondary)
            }
        }
        .multilineTextAlignment(.center)
        .frame(maxWidth: .infinity)
        .padding(16)
        .background(NativeStyle.card, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
        .accessibilityElement(children: .combine)
    }

    /// "No email? Check spam, then resend it (or "resend in 42s") or use a
    /// different email", both actions in the line.
    private var noEmail: some View {
        let resend = model.cooldown > 0
            ? language.t("auth:verify.resendIn", ["seconds": .int(model.cooldown)])
            : language.t("auth:verify.resend")
        return Text(RichLine.make(language.t("auth:verify.noEmail"),
                                  links: model.cooldown > 0 ? ["change": RichLine.action("change")]
                                      : ["resend": RichLine.action("resend"), "change": RichLine.action("change")],
                                  fills: ["resend": resend]))
            .font(.subheadline)
            .foregroundStyle(.secondary)
            .multilineTextAlignment(.center)
            .environment(\.openURL, OpenURLAction { url in
                if url.host() == "resend" {
                    Task { await model.resend() }
                } else {
                    model.stop()
                    changeEmail()
                }
                return .handled
            })
            .accessibilityIdentifier("verify.noEmail")
    }
}

/// Words with tags (translate.parseRich) as one attributed line: a tag in
/// `links` becomes that link, a tag in `fills` is those words; any other
/// tag keeps its words.
enum RichLine {
    static func make(_ text: String, links: [String: URL] = [:], fills: [String: String] = [:]) -> AttributedString {
        var line = AttributedString()
        for node in SettingsFigures.rich(text).arrayValue ?? [] {
            if let plain = node.stringValue {
                line += AttributedString(plain)
                continue
            }
            let tag = node["tag"]?.stringValue ?? ""
            var part = AttributedString(fills[tag] ?? (node["children"]?.arrayValue ?? []).compactMap(\.stringValue).joined())
            if let url = links[tag] {
                part.link = url
            } else if fills[tag] != nil {
                part.inlinePresentationIntent = .stronglyEmphasized
            }
            line += part
        }
        return line
    }

    /// A link the page handles itself (openURL), by name.
    static func action(_ name: String) -> URL {
        URL(string: "budgeer-page://\(name)")!
    }
}

// MARK: Forgot password

@MainActor
struct ForgotPasswordView: View {
    @Bindable var model: ForgotPasswordModel
    let back: () -> Void
    @Environment(AppLanguage.self) private var language

    var body: some View {
        ScrollView {
            VStack(spacing: 18) {
                if model.sent {
                    Image(systemName: "envelope.open")
                        .font(.system(size: 40))
                        .foregroundStyle(NativeStyle.tint)
                        .padding(.top, 24)
                    Text(language.t("auth:forgot.sentTitle"))
                        .font(NativeStyle.title(24, lang: language.current))
                    Text(RichLine.make(language.t("auth:forgot.sent"), fills: ["email": model.address]))
                        .foregroundStyle(.secondary)
                        .multilineTextAlignment(.center)
                        .accessibilityIdentifier("forgot.sent")
                } else {
                    VStack(spacing: 6) {
                        Text(language.t("auth:forgot.title"))
                            .font(NativeStyle.title(24, lang: language.current))
                        Text(language.t("auth:forgot.subtitle"))
                            .foregroundStyle(.secondary)
                    }
                    .multilineTextAlignment(.center)
                    .padding(.top, 12)
                    TextField(language.t("auth:email"), text: $model.email)
                        .textContentType(.emailAddress)
                        .keyboardType(.emailAddress)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                        .submitLabel(.send)
                        .onSubmit { Task { await model.send() } }
                        .padding(.horizontal, 16)
                        .padding(.vertical, 14)
                        .background(NativeStyle.card, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
                        .accessibilityIdentifier("forgot.email")
                    Button {
                        Task { await model.send() }
                    } label: {
                        Group {
                            if model.busy { ProgressView().tint(Color.white) } else { Text(language.t("auth:forgot.send")) }
                        }
                        .frame(maxWidth: .infinity)
                    }
                    .nativeGlassButton(prominent: true)
                    .disabled(!model.canSend)
                    .accessibilityIdentifier("forgot.send")
                }
                Button {
                    back()
                } label: {
                    Label(language.t("auth:backToLogIn"), systemImage: "arrow.left")
                }
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(NativeStyle.tint)
                .padding(.top, 4)
                .accessibilityIdentifier("forgot.back")
            }
            .padding(.horizontal, 24)
            .padding(.bottom, 32)
        }
        .background(NativeStyle.canvas.ignoresSafeArea())
        .navigationBarTitleDisplayMode(.inline)
    }
}
