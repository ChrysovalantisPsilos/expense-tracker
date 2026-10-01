// What the app shows: nothing yet, sign-in, or the app, and between the
// two the legal check, which fails closed as on the web (legalGateMath):
// no screen of the app renders until the server says the Privacy Notice
// and Terms in force are accepted. The gate records an acceptance itself
// (accept_legal_documents), as the web's prompt does for an account made
// with Google or Apple. An auth email's link opened in the app (a Universal
// Link) signs in as the web's /auth/confirm does; a reset link's session
// asks for the new password before anything else, as the web's
// ResetPassword does while `recovering`.
import Foundation
import Observation

enum SessionState: Equatable {
    /// Reading the stored session.
    case loading
    case signedOut
    /// Signed in, asking the server whether the legal documents are accepted.
    case checkingLegal(AuthUser)
    /// The server says the versions in force are not accepted: the gate.
    case legalRequired(AuthUser, LegalStatus)
    /// The check could not reach the server: retry or sign out, nothing else.
    case legalCheckFailed(AuthUser, String)
    /// Signed in and cleared: the app.
    case ready(AuthUser)
    /// Signed in by a password-reset link: the new password first.
    case recovering(AuthUser)

    var user: AuthUser? {
        switch self {
        case .loading, .signedOut: return nil
        case .checkingLegal(let user), .legalRequired(let user, _), .legalCheckFailed(let user, _), .ready(let user),
             .recovering(let user): return user
        }
    }
}

@MainActor
@Observable
final class SessionStore {
    private(set) var state: SessionState = .loading
    private let auth: AuthService
    private var listening: Task<Void, Never>?
    /// Runs while still signed in, just before a sign-out (the app forgets
    /// this phone's push registration on the server).
    var beforeSignOut: (@MainActor () async -> Void)?
    /// The type of an auth email's link that couldn't be used (expired, used
    /// already): the sign-in screen shows what to do (confirmLink.expiredLinkHelp).
    private(set) var linkProblem: String?
    /// A reset link was opened: its session goes to the new password first.
    private var recovering = false
    /// The email links' tokens already sent (each is single-use; a link can
    /// reach the app twice, as a URL and as a browsing activity).
    private var verified: Set<String> = []

    init(auth: AuthService) {
        self.auth = auth
    }

    /// Read the stored session, then follow sign-ins and sign-outs from the
    /// service (a token that expires for good, an account deleted elsewhere).
    func start() async {
        await settle(await auth.currentUser())
        listening?.cancel()
        listening = Task { [weak self] in
            guard let self else { return }
            for await user in auth.userChanges {
                if Task.isCancelled { return }
                // The same user again (a token refresh, a sign-in this store
                // just settled) changes nothing.
                if let user, user.id == state.user?.id { continue }
                await settle(user)
            }
        }
    }

    func signIn(email: String, password: String) async throws {
        try await signIn(with: .password(email: email, password: password))
    }

    /// Any way in (email, Google, Apple): the legal check follows, the same for each.
    func signIn(with method: SignInMethod) async throws {
        let user = try await auth.signIn(method)
        await settle(user)
    }

    /// A passkey sign-in's first half: the server's challenge for the system's sheet.
    func passkeyChallenge() async throws -> PasskeyChallenge {
        try await auth.passkeyChallenge()
    }

    /// An auth email's link opened in the app. Signed in already, it is left
    /// alone (the web's signed-in app sends /auth/confirm Home); otherwise its
    /// token signs in, a reset link to the new password first, and a link that
    /// can't be used says so on the sign-in screen.
    func openEmailLink(_ link: EmailLink) async {
        guard !verified.contains(link.tokenHash) else { return }
        verified.insert(link.tokenHash)
        if state.user != nil { return }
        if state == .loading, await auth.currentUser() != nil { return }
        linkProblem = nil
        recovering = link.type == "recovery"
        do {
            await settle(try await auth.verifyEmailLink(link))
        } catch {
            recovering = false
            linkProblem = link.type
            if state.user == nil { state = .signedOut }
        }
    }

    /// The expired-link page was shown.
    func dismissLinkProblem() {
        linkProblem = nil
    }

    /// The reset's new password saved: on into the app (the legal check first).
    /// Throws the server's refusal; the page says it.
    func finishRecovery(password: String) async throws {
        guard case .recovering(let user) = state else { return }
        try await auth.setNewPassword(password)
        recovering = false
        await settle(user)
    }

    func signOut() async {
        recovering = false
        if state.user != nil, let beforeSignOut { await beforeSignOut() }
        try? await auth.signOut()
        state = .signedOut
    }

    /// The gate's "I agree": the versions in force accepted, then the app
    /// (or the gate again if the server still says otherwise). Throws when
    /// the server refused or couldn't be reached; the gate says so.
    func acceptLegal() async throws {
        guard let user = state.user else { return }
        let status = try await auth.acceptLegal()
        state = status.needsAcceptance ? .legalRequired(user, status) : .ready(user)
    }

    /// Ask the server again after a failed legal check, or after the user
    /// accepted on the web.
    func recheckLegal() async {
        guard let user = state.user else { return }
        await settle(user)
    }

    private func settle(_ user: AuthUser?) async {
        guard let user else {
            recovering = false
            state = .signedOut
            return
        }
        if recovering { state = .recovering(user); return }
        state = .checkingLegal(user)
        do {
            let status = try await auth.legalStatus()
            state = status.needsAcceptance ? .legalRequired(user, status) : .ready(user)
        } catch {
            state = .legalCheckFailed(user, String(describing: error))
        }
    }
}
