// What the app shows: nothing yet, sign-in, or the app, and between the
// two the legal check, which fails closed as on the web (legalGateMath):
// no screen of the app renders until the server says the Privacy Notice
// and Terms in force are accepted. The gate records an acceptance itself
// (accept_legal_documents), as the web's prompt does for an account made
// with Google or Apple.
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

    var user: AuthUser? {
        switch self {
        case .loading, .signedOut: return nil
        case .checkingLegal(let user), .legalRequired(let user, _), .legalCheckFailed(let user, _), .ready(let user): return user
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

    func signOut() async {
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
        guard let user else { state = .signedOut; return }
        state = .checkingLegal(user)
        do {
            let status = try await auth.legalStatus()
            state = status.needsAcceptance ? .legalRequired(user, status) : .ready(user)
        } catch {
            state = .legalCheckFailed(user, String(describing: error))
        }
    }
}
