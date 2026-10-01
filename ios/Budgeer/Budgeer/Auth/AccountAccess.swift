// The signed-out account calls after the web's AuthProvider: signing up
// (with the consent the web sends as the account's metadata), sending the
// confirmation again, and asking for a password reset. Behind a protocol so
// the sign-up, Check your inbox and Forgot password pages can be tested
// with a fake. Signing in afterwards is AuthService's.
import Foundation

protocol AccountAccess: Sendable {
    /// signUp with legal.signupConsentMetadata's { accepted_privacy,
    /// accepted_terms } as the user's metadata, the confirmation link going
    /// to the website (`redirect`): true when a session came back
    /// (confirmation off: already signed in), false when the email must be
    /// confirmed first. A refusal is a SignInError.
    func signUp(email: String, password: String, metadata: JSONValue, redirect: URL) async throws -> Bool
    /// resendConfirmation: the sign-up's confirmation email again.
    func resendConfirmation(email: String, redirect: URL) async throws
    /// sendPasswordReset: the reset link to `email` (the same answer whether
    /// or not it has an account), opening the website's reset page.
    func sendPasswordReset(email: String, redirect: URL) async throws
}
