// AuthService over supabase-swift. The session lives in the Keychain
// (supabase-swift's default local storage on iOS) and is refreshed by the
// client; the app never sees the tokens. The legal check and acceptance are
// the same RPCs the web calls (my_legal_status, accept_legal_documents, 0072).
import BudgeerCore
import Foundation
#if canImport(AuthenticationServices)
import AuthenticationServices
#endif
import Supabase

final class SupabaseAuthService: AuthService {
    private let client: SupabaseClient
    private let passkeys: PasskeyServer

    init(client: SupabaseClient, config: AppConfig) {
        self.client = client
        passkeys = PasskeyServer(config: config)
    }

    func currentUser() async -> AuthUser? {
        // `session` refreshes an expired token; a stored session that cannot be
        // refreshed (revoked, offline for weeks) reads as signed out.
        guard let session = try? await client.auth.session else { return nil }
        return AuthUser(session.user)
    }

    var userChanges: AsyncStream<AuthUser?> {
        AsyncStream { [client] continuation in
            let task = Task {
                for await (event, session) in client.auth.authStateChanges {
                    switch event {
                    case .signedIn, .signedOut, .userDeleted, .userUpdated:
                        continuation.yield(session.map { AuthUser($0.user) })
                    default:
                        break
                    }
                }
                continuation.finish()
            }
            continuation.onTermination = { _ in task.cancel() }
        }
    }

    func signIn(_ method: SignInMethod) async throws -> AuthUser {
        switch method {
        case .password(let email, let password):
            do {
                let session = try await client.auth.signIn(email: email, password: password)
                return AuthUser(session.user)
            } catch let error as AuthError {
                // supabase-swift's AuthError (Auth module): the server's code and message.
                throw SignInError.rejected(code: error.errorCode.rawValue, message: error.message)
            } catch {
                throw SignInError.network(error.localizedDescription)
            }
        case .google:
            return try await signInWithGoogle()
        case .apple(let credential):
            return try await signInWithApple(credential)
        case .passkey(let answer):
            return try await signInWithPasskey(answer)
        }
    }

    func passkeyChallenge() async throws -> PasskeyChallenge {
        try await rejecting { try await passkeys.signInChallenge() }
    }

    /// The sheet's answer checked by Supabase Auth, and its session kept as
    /// any other sign-in's (the Keychain, refreshed by the client).
    private func signInWithPasskey(_ answer: PasskeyCredential) async throws -> AuthUser {
        try await rejecting {
            let tokens = try await passkeys.signIn(answer)
            let session = try await client.auth.setSession(accessToken: tokens.accessToken, refreshToken: tokens.refreshToken)
            return AuthUser(session.user)
        }
    }

    func verifyEmailLink(_ link: EmailLink) async throws -> AuthUser {
        guard let type = EmailOTPType(rawValue: link.type) else {
            throw SignInError.rejected(code: "otp_expired", message: "Not an email link this app knows")
        }
        return try await rejecting {
            AuthUser(try await client.auth.verifyOTP(tokenHash: link.tokenHash, type: type).user)
        }
    }

    func setNewPassword(_ password: String) async throws {
        _ = try await rejecting { try await client.auth.update(user: UserAttributes(password: password)) }
    }

    /// Supabase Auth's refusals as SignInError (its code and message), a
    /// request that never got an answer as a network error.
    private func rejecting<T>(_ work: () async throws -> T) async throws -> T {
        do {
            return try await work()
        } catch let error as AuthError {
            throw SignInError.rejected(code: error.errorCode.rawValue, message: error.message)
        } catch let error as ServerError {
            throw SignInError.rejected(code: error.code, message: error.message)
        } catch let error as SignInError {
            throw error
        } catch {
            throw SignInError.network(error.localizedDescription)
        }
    }

    /// Apple's identity token for a session (supabase-swift's id-token grant,
    /// checked by Supabase Auth against the nonce), then the name Apple gave
    /// on the first sign-in saved as the web saves a name.
    private func signInWithApple(_ credential: AppleCredential) async throws -> AuthUser {
        do {
            let session = try await client.auth.signInWithIdToken(
                credentials: OpenIDConnectCredentials(provider: .apple, idToken: credential.idToken, nonce: credential.nonce))
            if let name = credential.fullName { await saveAppleName(name, user: session.user) }
            return AuthUser(session.user)
        } catch let error as AuthError {
            throw SignInError.rejected(code: error.errorCode.rawValue, message: error.message)
        } catch {
            throw SignInError.network(error.localizedDescription)
        }
    }

    /// The name on the account (user_metadata.full_name, as Google's) and on
    /// the profile while it still has the sign-up's default name
    /// (authMethods.appleProfileName). Best effort: the sign-in stands without it.
    private func saveAppleName(_ name: String, user: User) async {
        _ = try? await client.auth.update(user: UserAttributes(data: ["full_name": .string(name)]))
        let uid = user.id.uuidString.lowercased()
        guard let row: [JSONValue] = try? await client.from("profiles").select("display_name").eq("id", value: uid).execute().value,
              let display = row.first?["display_name"] else { return }
        let args: JSONValue = ["displayName": display, "email": user.email.json, "fullName": .string(name)]
        guard let next = (try? BudgeerCore.shared.json("authMethods", "appleProfileName", [args]))?.stringValue else { return }
        _ = try? await client.from("profiles").update(["display_name": next]).eq("id", value: uid).execute()
    }

    /// Where Google sends the user back to (registered as a Redirect URL in
    /// both Supabase projects; the `budgeer` scheme is the app's, project.yml).
    static let callback = URL(string: "budgeer://auth-callback")!

    /// Google's consent in the system's web sheet (ASWebAuthenticationSession,
    /// which hands the callback back itself), then the code exchanged for a
    /// session: supabase-swift's OAuth flow, as the web's signInWithOAuth.
    private func signInWithGoogle() async throws -> AuthUser {
        #if canImport(AuthenticationServices)
        do {
            let session = try await client.auth.signInWithOAuth(provider: .google, redirectTo: SupabaseAuthService.callback)
            return AuthUser(session.user)
        } catch let error as ASWebAuthenticationSessionError where error.code == .canceledLogin {
            throw SignInError.cancelled
        } catch let error as AuthError {
            throw SignInError.rejected(code: error.errorCode.rawValue, message: error.message)
        } catch {
            throw SignInError.network(error.localizedDescription)
        }
        #else
        throw SignInError.unsupported(.google)
        #endif
    }

    func signOut() async throws {
        try await client.auth.signOut()
    }

    func legalStatus() async throws -> LegalStatus {
        try await client.rpc("my_legal_status").execute().value
    }

    func acceptLegal() async throws -> LegalStatus {
        try await client.rpc("accept_legal_documents").execute().value
    }
}

private extension AuthUser {
    init(_ user: User) {
        self.init(id: user.id, email: user.email)
    }
}
