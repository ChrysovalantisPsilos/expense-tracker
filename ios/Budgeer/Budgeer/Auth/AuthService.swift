// Sign-in, the session and the legal check, behind one protocol so the view
// models can be tested with a fake. Email and password is the one method
// wired so far; Google, Apple and passkeys are cases the service refuses
// until their phase (the web has Google and passkeys; Apple was dropped by
// the owner), so the screens can be laid out for them now.
import Foundation

/// A way into an account.
enum SignInMethod: Sendable, Equatable {
    case password(email: String, password: String)
    case google
    case apple
    case passkey
}

struct AuthUser: Equatable, Sendable {
    let id: UUID
    let email: String?
}

/// my_legal_status: the versions in force, the ones this account accepted,
/// and whether the app must not go on (the web's legalGateMath).
struct LegalStatus: Decodable, Equatable, Sendable {
    let privacyVersion: String?
    let termsVersion: String?
    let privacyAccepted: String?
    let termsAccepted: String?
    let needsAcceptance: Bool

    enum CodingKeys: String, CodingKey {
        case privacyVersion = "privacy_version"
        case termsVersion = "terms_version"
        case privacyAccepted = "privacy_accepted"
        case termsAccepted = "terms_accepted"
        case needsAcceptance = "needs_acceptance"
    }

    /// A first acceptance (nothing accepted yet) rather than an update.
    var isFirstAcceptance: Bool { privacyAccepted == nil && termsAccepted == nil }
}

enum SignInError: Error, Equatable, Sendable {
    /// A method not wired in this phase.
    case unsupported(SignInMethod)
    /// Supabase Auth refused, with its error code when it gave one
    /// (invalid_credentials, email_not_confirmed, …) and its message.
    case rejected(code: String?, message: String)
    case network(String)
}

protocol AuthService: Sendable {
    /// The signed-in user from the stored (Keychain) session, if any.
    func currentUser() async -> AuthUser?
    /// The user after each sign-in and sign-out, nil when signed out.
    var userChanges: AsyncStream<AuthUser?> { get }
    func signIn(_ method: SignInMethod) async throws -> AuthUser
    func signOut() async throws
    /// my_legal_status for the signed-in user.
    func legalStatus() async throws -> LegalStatus
}
