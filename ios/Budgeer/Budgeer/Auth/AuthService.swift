// Sign-in, the session and the legal check, behind one protocol so the view
// models can be tested with a fake. Email and password, Google (through the
// system's web sheet, as the web's OAuth redirect) and Apple (the system's
// Sign in with Apple sheet, its identity token exchanged for a session) are
// wired; passkeys are a case the service refuses (they stay the website's).
import Foundation

/// What Sign in with Apple answered: its identity token, the nonce whose
/// SHA-256 the request carried (Supabase checks the token's against it), and
/// the person's name, which Apple gives only on the first sign-in.
struct AppleCredential: Sendable, Equatable {
    let idToken: String
    let nonce: String
    var fullName: String? = nil
}

/// A way into an account.
enum SignInMethod: Sendable, Equatable {
    case password(email: String, password: String)
    case google
    case apple(AppleCredential)
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
    /// The user closed the provider's sheet: nothing to report.
    case cancelled
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
    /// accept_legal_documents: the versions in force accepted now (recorded
    /// as consent, source 'prompt', as the web's legal prompt does); the new status.
    func acceptLegal() async throws -> LegalStatus
}
