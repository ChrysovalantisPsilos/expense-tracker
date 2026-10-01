// The signed-out pages' state, after the web's Login (sign-up mode),
// VerifyEmail and ForgotPassword: the sign-up form's checks and the consent
// the web records (authChecks, legal.signupConsentMetadata), Check your inbox
// signing in by itself once the link is opened (confirmWait's schedule),
// the reset link's request (canSendReset), the new password a reset link
// leads to (ResetPassword), and what an unusable email link offers
// (confirmLink.expiredLinkHelp). The words of a refusal are the core's
// errors.userMessage over Supabase Auth's codes.
import Foundation
import Observation
import BudgeerCore

/// A sign-in or sign-up refusal as the web words it (errors.userMessage, AUTH_MESSAGES).
enum AuthWords {
    static func message(_ error: Error, fallbackKey: String = "auth:serverError", core: BudgeerCore = .shared) -> String {
        let shape: JSONValue
        switch error as? SignInError {
        case .rejected(let code, let message):
            shape = ["code": code.json, "message": .string(message)]
        case .network:
            // What a browser says when the request never got an answer.
            shape = ["message": "Failed to fetch"]
        default:
            shape = ["message": .string(String(describing: error))]
        }
        return (try? core.call("errors", "userMessage", [shape, JSONValue.string(core.text(fallbackKey))]))
            ?? core.text(fallbackKey)
    }
}

/// The website's address of a page ("/reset-password"), for an email's link.
enum SiteLink {
    static func url(_ site: String, _ path: String = "") -> URL? {
        URL(string: site + path)
    }
}

@MainActor
@Observable
final class SignUpModel {
    var email = ""
    var password = ""
    var accepted = false
    /// Field errors show from the first submit on, then follow the typing.
    private(set) var tried = false
    /// "Sign up with Google" without the tick: only the tick's error shows.
    private(set) var googleTried = false
    private(set) var busy = false
    private(set) var googleBusy = false
    /// A refusal (the address taken, a rate limit…), above the button.
    private(set) var serverError: String?
    /// Set once the account waits for its email to be confirmed: Check your inbox.
    var pending: PendingSignUp?

    private let access: AccountAccess
    private let site: String
    private let core: BudgeerCore

    init(access: AccountAccess, site: String, core: BudgeerCore = .shared) {
        self.access = access
        self.site = site
        self.core = core
    }

    /// authChecks.authErrors in sign-up mode: { email?, password?, consent? }.
    private func errors() -> [String: String] {
        let fields: JSONValue = ["mode": "signup", "email": .string(email), "password": .string(password),
                                 "accepted": .bool(accepted)]
        return (try? core.call("authChecks", "authErrors", [fields])) ?? [:]
    }

    /// What shows under each field (nothing before the first submit).
    var fieldErrors: [String: String] { tried ? errors() : [:] }

    var consentError: String? {
        if let shown = fieldErrors["consent"] { return shown }
        guard googleTried else { return nil }
        let fields: JSONValue = ["mode": "signup", "accepted": .bool(accepted)]
        return try? core.call("authChecks", "consentError", [fields]) as String?
    }

    /// The password's hint, until its error takes over.
    var passwordHint: String? { fieldErrors["password"] == nil ? core.text("auth:password.hint") : nil }

    /// Sign up: the checks first, then the account with the consent the web
    /// records (signupConsentMetadata). With a session the app takes over;
    /// otherwise Check your inbox.
    func submit() async {
        serverError = nil
        guard errors().isEmpty else {
            tried = true
            return
        }
        guard let redirect = SiteLink.url(site) else { return }
        busy = true
        defer { busy = false }
        do {
            let metadata = try core.json("legal", "signupConsentMetadata", [])
            let trimmed = email.trimmingCharacters(in: .whitespacesAndNewlines)
            let signedIn = try await access.signUp(email: trimmed, password: password, metadata: metadata, redirect: redirect)
            if !signedIn { pending = PendingSignUp(email: trimmed, password: password) }
        } catch {
            serverError = AuthWords.message(error, core: core)
        }
    }

    /// "Sign up with Google": the same tick first; the legal check follows the sign-in.
    func signUpWithGoogle(session: SessionStore) async {
        serverError = nil
        guard accepted else {
            googleTried = true
            return
        }
        googleBusy = true
        defer { googleBusy = false }
        do {
            try await session.signIn(with: .google)
        } catch SignInError.cancelled {
            // The user changed their mind.
        } catch {
            serverError = AuthWords.message(error, core: core)
        }
    }
}

/// A sign-up waiting for its email to be confirmed: the address, and the
/// password kept in memory only while Check your inbox is open.
struct PendingSignUp: Hashable, Identifiable {
    let email: String
    let password: String
    var id: String { email }
}

@MainActor
@Observable
final class VerifyEmailModel {
    enum Status: Equatable {
        case waiting
        /// Signed in: the app takes over.
        case done
        /// The quarter of an hour ran out, or the sign-in failed some other way: Log in.
        case gaveUp
    }

    let email: String
    private(set) var status: Status = .waiting
    /// Seconds before "resend it" works again.
    private(set) var cooldown = 0
    private(set) var message: String?
    private(set) var warning = false
    private var password: String?

    /// VerifyEmail's RESEND_COOLDOWN.
    static let resendCooldown = 60

    private let access: AccountAccess
    private let site: String
    private let core: BudgeerCore
    private let sleep: @Sendable (Double) async -> Void

    init(pending: PendingSignUp, access: AccountAccess, site: String, core: BudgeerCore = .shared,
         sleep: @escaping @Sendable (Double) async -> Void = { ms in
             try? await Task.sleep(nanoseconds: UInt64(ms * 1_000_000))
         }) {
        email = pending.email
        password = pending.password
        self.access = access
        self.site = site
        self.core = core
        self.sleep = sleep
    }

    /// The web's confirmWait: try the password sign-in on its schedule (6 s,
    /// then 15 s) until the link has been opened, here or on any device, or
    /// a quarter of an hour has passed; anything but "not confirmed yet"
    /// stops it. The password is forgotten when the wait ends.
    func wait(session: SessionStore) async {
        var elapsed = 0.0
        defer { password = nil }
        while status == .waiting, let password, !Task.isCancelled {
            if (try? core.call("confirmWait", "shouldGiveUp", [elapsed]) as Bool) != false {
                status = .gaveUp
                return
            }
            let delay = (try? core.call("confirmWait", "nextDelay", [elapsed]) as Double) ?? 15_000
            await sleep(delay)
            if Task.isCancelled { return }
            elapsed += delay
            do {
                try await session.signIn(email: email, password: password)
                status = .done
            } catch {
                let shape: JSONValue
                if case SignInError.rejected(let code, _) = error {
                    shape = ["error": ["code": code.json]]
                } else {
                    shape = ["error": ["code": .null]]
                }
                let outcome: String = (try? core.call("confirmWait", "attemptOutcome", [shape])) ?? "stop"
                if outcome != "wait" { status = .gaveUp }
            }
        }
    }

    /// "resend it": the confirmation again, then a minute before the next.
    func resend() async {
        guard cooldown == 0, let redirect = SiteLink.url(site) else { return }
        do {
            try await access.resendConfirmation(email: email, redirect: redirect)
            warning = false
            message = core.text("auth:verify.resent")
            cooldown = VerifyEmailModel.resendCooldown
        } catch {
            warning = true
            message = "\(core.text("auth:verify.resendFailed")) · \(AuthWords.message(error, fallbackKey: "common:errors.generic", core: core))"
        }
    }

    /// The resend countdown, a second at a time.
    func tick() {
        if cooldown > 0 { cooldown -= 1 }
    }

    /// "use a different email" / Log in: the wait stops.
    func stop() {
        if status == .waiting { status = .gaveUp }
        password = nil
    }
}

@MainActor
@Observable
final class ForgotPasswordModel {
    var email = ""
    private(set) var busy = false
    /// The link was asked for: the same answer whether or not the address has an account.
    private(set) var sent = false

    private let access: AccountAccess
    private let site: String
    private let core: BudgeerCore

    init(access: AccountAccess, site: String, core: BudgeerCore = .shared) {
        self.access = access
        self.site = site
        self.core = core
    }

    /// authChecks.canSendReset.
    var canSend: Bool { !busy && ((try? core.call("authChecks", "canSendReset", [email]) as Bool) ?? false) }

    /// The trimmed address the link went to.
    var address: String { email.trimmingCharacters(in: .whitespacesAndNewlines) }

    /// Send reset link: fire and forget, as on the web (Supabase answers the
    /// same either way, so nobody learns which addresses have accounts). The
    /// email's link opens this app's new-password page where it is installed
    /// (a Universal Link to /auth/confirm), else the website's.
    func send() async {
        guard canSend, let redirect = SiteLink.url(site, "/reset-password") else { return }
        busy = true
        try? await access.sendPasswordReset(email: address, redirect: redirect)
        busy = false
        sent = true
    }
}

/// The web's ResetPassword: a reset link's session sets a new password
/// (the sign-up rules, then the two fields matching: authMethods.newPasswordError),
/// then the app goes on.
@MainActor
@Observable
final class ResetPasswordModel {
    var password = ""
    var confirm = ""
    private(set) var busy = false
    /// Why the password wasn't set, under the fields.
    private(set) var problem: String?

    private let session: SessionStore
    private let core: BudgeerCore

    init(session: SessionStore, core: BudgeerCore = .shared) {
        self.session = session
        self.core = core
    }

    var canSubmit: Bool { !busy && !password.isEmpty && !confirm.isEmpty }

    func submit() async {
        guard canSubmit else { return }
        let args: [JSONValue] = [.string(password), .string(confirm), "auth:password.mismatch"]
        if let rule = (try? core.json("authMethods", "newPasswordError", args))?.stringValue {
            problem = rule
            return
        }
        busy = true
        defer { busy = false }
        do {
            try await session.finishRecovery(password: password)
            problem = nil
        } catch {
            problem = AuthWords.message(error, fallbackKey: "auth:reset.failed", core: core)
        }
    }
}

/// An email link that can't be used (confirmLink.expiredLinkHelp): what
/// happened, and the ways on (a new reset link; log in or sign up again).
struct ExpiredLinkHelp: Decodable, Equatable {
    struct Action: Decodable, Equatable, Hashable {
        let label: String
        /// The web's page: /forgot-password, /login or /login?signup=1.
        let to: String
    }
    let text: String
    let actions: [Action]

    static func of(_ type: String, core: BudgeerCore = .shared) -> ExpiredLinkHelp? {
        try? core.call("confirmLink", "expiredLinkHelp", [type])
    }
}
