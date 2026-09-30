// AuthService over supabase-swift. The session lives in the Keychain
// (supabase-swift's default local storage on iOS) and is refreshed by the
// client; the app never sees the tokens. The legal check is the same RPC
// the web calls (my_legal_status, migration 0072).
import Foundation
import Supabase

final class SupabaseAuthService: AuthService {
    private let client: SupabaseClient

    init(client: SupabaseClient) {
        self.client = client
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
        case .google, .apple, .passkey:
            throw SignInError.unsupported(method)
        }
    }

    func signOut() async throws {
        try await client.auth.signOut()
    }

    func legalStatus() async throws -> LegalStatus {
        try await client.rpc("my_legal_status").execute().value
    }
}

private extension AuthUser {
    init(_ user: User) {
        self.init(id: user.id, email: user.email)
    }
}
