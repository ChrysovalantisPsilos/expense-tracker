// Sign-in, the session and the legal check, behind one protocol so the view
// models can be tested with a fake. Email and password, Google (through the
// system's web sheet, as the web's OAuth redirect), Apple (the system's
// Sign in with Apple sheet, its identity token exchanged for a session) and
// a passkey (the server's challenge answered by the system's passkey sheet,
// Passkeys.swift), and an auth email's link opened in the app (its token
// verified, as the web's /auth/confirm page does).
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
    /// The passkey sheet's answer to the server's sign-in challenge.
    case passkey(PasskeyCredential)
}

/// An auth email's link (confirmLink.parseConfirmLink): its token hash and
/// type (signup, email, magiclink, recovery, email_change).
struct EmailLink: Decodable, Equatable, Sendable {
    let tokenHash: String
    let type: String
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
    /// A passkey sign-in's first half: the server's challenge for the sheet.
    func passkeyChallenge() async throws -> PasskeyChallenge
    /// An auth email's link: its token verified for a session (verifyOtp, as
    /// the web's ConfirmLink); a reset link's session then sets a new password.
    func verifyEmailLink(_ link: EmailLink) async throws -> AuthUser
    /// The new password of a reset (the recovery session's updateUser).
    func setNewPassword(_ password: String) async throws
    func signOut() async throws
    /// my_legal_status for the signed-in user.
    func legalStatus() async throws -> LegalStatus
    /// accept_legal_documents: the versions in force accepted now (recorded
    /// as consent, source 'prompt', as the web's legal prompt does); the new status.
    func acceptLegal() async throws -> LegalStatus
}
