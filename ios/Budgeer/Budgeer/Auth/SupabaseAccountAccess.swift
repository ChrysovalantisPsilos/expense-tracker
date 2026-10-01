// AccountAccess over supabase-swift: the same Supabase Auth calls as the
// web's AuthProvider (signUp, resend, resetPasswordForEmail).
import Foundation
import Supabase

final class SupabaseAccountAccess: AccountAccess {
    private let client: SupabaseClient

    init(client: SupabaseClient) {
        self.client = client
    }

    func signUp(email: String, password: String, metadata: JSONValue, redirect: URL) async throws -> Bool {
        let data = try JSONDecoder().decode([String: AnyJSON].self, from: JSONEncoder().encode(metadata))
        let response = try await refusal {
            try await client.auth.signUp(email: email, password: password, data: data, redirectTo: redirect)
        }
        return response.session != nil
    }

    func resendConfirmation(email: String, redirect: URL) async throws {
        try await refusal { try await client.auth.resend(email: email, type: .signup, emailRedirectTo: redirect) }
    }

    func sendPasswordReset(email: String, redirect: URL) async throws {
        try await refusal { try await client.auth.resetPasswordForEmail(email, redirectTo: redirect) }
    }

    /// Supabase Auth's refusal as the sign-in's (its code and message), anything else as the network's.
    private func refusal<T>(_ work: () async throws -> T) async throws -> T {
        do {
            return try await work()
        } catch let error as AuthError {
            throw SignInError.rejected(code: error.errorCode.rawValue, message: error.message)
        } catch {
            throw SignInError.network(error.localizedDescription)
        }
    }
}
