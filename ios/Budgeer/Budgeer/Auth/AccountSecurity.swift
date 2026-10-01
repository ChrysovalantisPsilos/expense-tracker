// Settings › Security's account calls, after the web's AuthProvider (the
// sign-in methods): the signed-in user and its identities as the web's
// authMethods reads them, when this session signed in (reauth), changing or
// setting the password, connecting or disconnecting Google (its web
// consent) or Apple (the system's sheet, its token linked), and the
// account's passkeys (listed, added, removed: Passkeys.swift). Behind a
// protocol so the security page can be tested with a fake. The rules
// (which methods show, what can be removed, how recent a sign-in must be)
// are the core's; this file only talks to Supabase Auth.
import Foundation
import Supabase

protocol AccountSecurity: Sendable {
    /// The signed-in user as the web's session.user: { email, app_metadata, user_metadata }.
    func accountUser() async throws -> JSONValue
    /// getUserIdentities: [{ provider, identity_id, identity_data: { email } }].
    func identities() async throws -> JSONValue
    /// The session token's claims (when it signed in), nil without a session.
    func tokenClaims() async -> JSONValue?
    /// changePassword: the current password checked by signing in with it,
    /// then the new one set with the current one (the server checks it again).
    func changePassword(current: String, next: String) async throws
    /// setFirstPassword: a first password for a Google- or Apple-only account (password_set in user_metadata).
    func setFirstPassword(_ password: String) async throws
    /// markPasswordSet: the account turned out to have one already.
    func markPasswordSet() async throws
    /// linkGoogle's first half: where Google's consent starts.
    func googleLinkURL() async throws -> URL
    /// linkGoogle's second half: Google's answer (the callback URL) into the session.
    func finishLink(_ callback: URL) async throws
    /// linkProvider('apple'), natively: Apple's identity token linked to this account.
    func linkApple(_ credential: AppleCredential) async throws
    /// unlinkIdentity for the provider's ('google', 'apple') identity.
    func unlink(provider: String) async throws
    /// passkey.list: the account's passkeys as the server lists them
    /// (authMethods.passkeyRows reads them); throws when passkeys are off.
    func passkeys() async throws -> JSONValue
    /// registerPasskey's first half: the server's options for a new passkey.
    func passkeyOptions() async throws -> PasskeyChallenge
    /// registerPasskey's second half: the sheet's new passkey saved.
    func savePasskey(_ answer: PasskeyCredential) async throws
    /// passkey.delete.
    func removePasskey(id: String) async throws
}

/// The current password was wrong (common:errors.auth.currentPasswordInvalid).
struct CurrentPasswordInvalid: Error {}

final class SupabaseAccountSecurity: AccountSecurity {
    private let client: SupabaseClient
    private let config: AppConfig
    private let http: URLSession

    private let passkeyServer: PasskeyServer

    init(client: SupabaseClient, config: AppConfig, http: URLSession = .shared) {
        self.client = client
        self.config = config
        self.http = http
        passkeyServer = PasskeyServer(config: config, http: http)
    }

    func accountUser() async throws -> JSONValue {
        let user = try await auth { try await client.auth.user() }
        return [
            "email": user.email.json,
            "app_metadata": try JSONValue.from(user.appMetadata),
            "user_metadata": try JSONValue.from(user.userMetadata),
        ]
    }

    func identities() async throws -> JSONValue {
        let list = try await auth { try await client.auth.userIdentities() }
        return .array(list.map { identity -> JSONValue in
            [
                "provider": .string(identity.provider),
                "identity_id": .string(identity.identityId.uuidString.lowercased()),
                "identity_data": ["email": (identity.identityData?["email"]?.stringValue).json],
            ]
        })
    }

    func tokenClaims() async -> JSONValue? {
        guard let token = try? await client.auth.session.accessToken else { return nil }
        // A JWT's middle part: base64url JSON.
        let parts = token.split(separator: ".")
        guard parts.count >= 2 else { return nil }
        var base64 = String(parts[1]).replacingOccurrences(of: "-", with: "+").replacingOccurrences(of: "_", with: "/")
        while base64.count % 4 != 0 { base64.append("=") }
        guard let data = Data(base64Encoded: base64) else { return nil }
        return try? JSONValue.parse(data)
    }

    func changePassword(current: String, next: String) async throws {
        guard let email = client.auth.currentUser?.email else { throw CurrentPasswordInvalid() }
        do {
            _ = try await client.auth.signIn(email: email, password: current)
        } catch {
            throw CurrentPasswordInvalid()
        }
        // The project asks for the current password on a change; supabase-swift's
        // UserAttributes has no field for it, so this is GoTrue's own PUT /user,
        // as supabase-js sends it ({ password, current_password }).
        let session = try await client.auth.session
        var request = URLRequest(url: config.supabaseURL.appendingPathComponent("auth/v1/user"))
        request.httpMethod = "PUT"
        request.setValue(config.supabaseAnonKey, forHTTPHeaderField: "apikey")
        request.setValue("Bearer \(session.accessToken)", forHTTPHeaderField: "Authorization")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONEncoder().encode(["password": next, "current_password": current])
        let (data, response) = try await http.data(for: request)
        let status = (response as? HTTPURLResponse)?.statusCode ?? 0
        guard (200..<300).contains(status) else {
            let payload = try? JSONValue.parse(data)
            let code = payload?["error_code"]?.stringValue ?? payload?["code"]?.stringValue
            if code == "current_password_invalid" { throw CurrentPasswordInvalid() }
            throw ServerError(code: code, message: payload?["msg"]?.stringValue ?? payload?["message"]?.stringValue ?? "")
        }
        _ = try? await client.auth.refreshSession()
    }

    func setFirstPassword(_ password: String) async throws {
        _ = try await auth {
            try await client.auth.update(user: UserAttributes(password: password, data: ["password_set": .bool(true)]))
        }
    }

    func markPasswordSet() async throws {
        _ = try await auth { try await client.auth.update(user: UserAttributes(data: ["password_set": .bool(true)])) }
    }

    func googleLinkURL() async throws -> URL {
        try await auth {
            try await client.auth.getLinkIdentityURL(provider: .google, redirectTo: SupabaseAuthService.callback).url
        }
    }

    func finishLink(_ callback: URL) async throws {
        _ = try await auth { try await client.auth.session(from: callback) }
    }

    func linkApple(_ credential: AppleCredential) async throws {
        _ = try await auth {
            try await client.auth.linkIdentityWithIdToken(
                credentials: OpenIDConnectCredentials(provider: .apple, idToken: credential.idToken, nonce: credential.nonce))
        }
    }

    func unlink(provider: String) async throws {
        try await auth {
            let list = try await client.auth.userIdentities()
            guard let identity = list.first(where: { $0.provider == provider }) else { return }
            try await client.auth.unlinkIdentity(identity)
        }
    }

    func passkeys() async throws -> JSONValue {
        try await passkeyServer.list(token: try await client.auth.session.accessToken)
    }

    func passkeyOptions() async throws -> PasskeyChallenge {
        try await passkeyServer.addChallenge(token: try await client.auth.session.accessToken)
    }

    func savePasskey(_ answer: PasskeyCredential) async throws {
        try await passkeyServer.add(answer, token: try await client.auth.session.accessToken)
    }

    func removePasskey(id: String) async throws {
        try await passkeyServer.remove(id: id, token: try await client.auth.session.accessToken)
    }

    /// Supabase Auth's refusal in the web's shape (its error code and message).
    private func auth<T>(_ work: () async throws -> T) async throws -> T {
        do {
            return try await work()
        } catch let error as AuthError {
            throw ServerError(code: error.errorCode.rawValue, message: error.message)
        }
    }
}
