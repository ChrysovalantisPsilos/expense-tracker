// Passkeys, as the website's (supabase-js' passkey API over Supabase Auth's
// /passkeys endpoints): the server starts a WebAuthn ceremony and names its
// relying party (the site's own host: www.budgeer.com on PROD,
// dev.budgeer.com on TEST), the system's passkey sheet answers it
// (AuthenticationServices; the app may, because the site lists it under
// webcredentials and the app claims the host in its Associated Domains), and
// the answer goes back as the JSON a browser sends. So a passkey made on the
// website signs in here, and one made here signs in on the website.
import AuthenticationServices
import BudgeerCore
import Foundation
import UIKit

/// A WebAuthn ceremony the server started: its id and the options a browser
/// would hand to navigator.credentials (challenge, rpId or rp, user, …).
struct PasskeyChallenge: Sendable, Equatable {
    let id: String
    let options: JSONValue
}

/// The sheet's answer to a challenge, as the browser's PublicKeyCredential JSON.
struct PasskeyCredential: Sendable, Equatable {
    let challengeId: String
    let credential: JSONValue
}

/// The options were not a ceremony the sheet can run, or it answered nothing usable.
struct PasskeyProblem: Error, Equatable, CustomStringConvertible {
    let description: String
}

/// True when the person closed the passkey sheet (nothing to report).
func isPasskeyCancel(_ error: Error) -> Bool {
    (error as? ASAuthorizationError)?.code == .canceled
}

/// How adding a passkey went.
enum PasskeyAdded: Equatable {
    case added
    /// The sheet was closed: nothing to say.
    case cancelled
    /// Why not, in the web's words.
    case failed(String)
}

extension AccountSecurity {
    /// A new passkey for the signed-in account, wherever it's offered
    /// (Settings › Security, the setup wizard, the ask after signing in), as
    /// the web's registerPasskey: a sign-in in the last few minutes first
    /// (reauth.isRecentClaims), the server's options, the system's sheet,
    /// the passkey saved.
    @MainActor
    func addPasskey(sheet: PasskeySheet, core: BudgeerCore, now: Date) async -> PasskeyAdded {
        let ms = (now.timeIntervalSince1970 * 1000).rounded()
        guard let claims = await tokenClaims(),
              (try? core.call("reauth", "isRecentClaims", [claims, JSONValue.double(ms)]) as Bool) == true else {
            return .failed(core.text("common:errors.reauth.addPasskey"))
        }
        do {
            let challenge = try await passkeyOptions()
            let answer = try await sheet.createPasskey(challenge.options)
            try await savePasskey(PasskeyCredential(challengeId: challenge.id, credential: answer))
            return .added
        } catch {
            if isPasskeyCancel(error) { return .cancelled }
            return .failed(UserMessage.of(error, fallback: core.text("settings:passkeys.addFailed"), core: core))
        }
    }
}

/// The system's passkey sheet: behind a protocol so the view models can be tested.
@MainActor
protocol PasskeySheet: AnyObject {
    /// Sign in: one of the relying party's passkeys for the request options.
    func usePasskey(_ options: JSONValue) async throws -> JSONValue
    /// Add: a new passkey for the creation options.
    func createPasskey(_ options: JSONValue) async throws -> JSONValue
}

/// Base64url without padding, as WebAuthn's JSON writes bytes.
enum Base64URL {
    static func encode(_ data: Data) -> String {
        data.base64EncodedString()
            .replacingOccurrences(of: "+", with: "-").replacingOccurrences(of: "/", with: "_")
            .replacingOccurrences(of: "=", with: "")
    }

    static func decode(_ text: String) -> Data? {
        var base64 = text.replacingOccurrences(of: "-", with: "+").replacingOccurrences(of: "_", with: "/")
        while base64.count % 4 != 0 { base64.append("=") }
        return Data(base64Encoded: base64)
    }
}

/// The sheet's answers as supabase-js serialises a browser's
/// (serializeCredentialRequestResponse / serializeCredentialCreationResponse).
enum PasskeyJSON {
    static func assertion(credentialID: Data, clientData: Data, authenticatorData: Data, signature: Data,
                          userID: Data?, attachment: String = "platform") -> JSONValue {
        let id = Base64URL.encode(credentialID)
        var response: JSONValue = [
            "authenticatorData": .string(Base64URL.encode(authenticatorData)),
            "clientDataJSON": .string(Base64URL.encode(clientData)),
            "signature": .string(Base64URL.encode(signature)),
        ]
        if let userID, !userID.isEmpty { response = response.with("userHandle", .string(Base64URL.encode(userID))) }
        return ["id": .string(id), "rawId": .string(id), "response": response, "type": "public-key",
                "clientExtensionResults": [:], "authenticatorAttachment": .string(attachment)]
    }

    static func registration(credentialID: Data, clientData: Data, attestation: Data,
                             attachment: String = "platform") -> JSONValue {
        let id = Base64URL.encode(credentialID)
        return ["id": .string(id), "rawId": .string(id),
                "response": ["attestationObject": .string(Base64URL.encode(attestation)),
                             "clientDataJSON": .string(Base64URL.encode(clientData)),
                             "transports": ["internal", "hybrid"]],
                "type": "public-key", "clientExtensionResults": [:], "authenticatorAttachment": .string(attachment)]
    }

    /// The credential ids of an options list (allowCredentials, excludeCredentials).
    static func ids(_ list: JSONValue?) -> [Data] {
        (list?.arrayValue ?? []).compactMap { $0["id"]?.stringValue.flatMap(Base64URL.decode) }
    }
}

/// The window a system sheet stands on.
@MainActor
func keyWindowAnchor() -> ASPresentationAnchor {
    UIApplication.shared.connectedScenes
        .compactMap { $0 as? UIWindowScene }
        .flatMap(\.windows)
        .first { $0.isKeyWindow } ?? ASPresentationAnchor()
}

/// The system's passkey sheet (iCloud Keychain or the person's passkey app),
/// for the relying party the server's options name.
@MainActor
final class PasskeyAuthorizer: NSObject, PasskeySheet, ASAuthorizationControllerDelegate,
    ASAuthorizationControllerPresentationContextProviding {
    private var continuation: CheckedContinuation<ASAuthorization, Error>?
    private var controller: ASAuthorizationController?

    func usePasskey(_ options: JSONValue) async throws -> JSONValue {
        guard let rp = options["rpId"]?.stringValue,
              let challenge = options["challenge"]?.stringValue.flatMap(Base64URL.decode) else {
            throw PasskeyProblem(description: "The sign-in options name no relying party or challenge")
        }
        let request = ASAuthorizationPlatformPublicKeyCredentialProvider(relyingPartyIdentifier: rp)
            .createCredentialAssertionRequest(challenge: challenge)
        request.allowedCredentials = PasskeyJSON.ids(options["allowCredentials"])
            .map { ASAuthorizationPlatformPublicKeyCredentialDescriptor(credentialID: $0) }
        if let preference = options["userVerification"]?.stringValue {
            request.userVerificationPreference = ASAuthorizationPublicKeyCredentialUserVerificationPreference(rawValue: preference)
        }
        let authorization = try await perform(request)
        guard let answer = authorization.credential as? ASAuthorizationPlatformPublicKeyCredentialAssertion,
              let authenticatorData = answer.rawAuthenticatorData, let signature = answer.signature else {
            throw PasskeyProblem(description: "The passkey sheet gave no assertion")
        }
        return PasskeyJSON.assertion(credentialID: answer.credentialID, clientData: answer.rawClientDataJSON,
                                     authenticatorData: authenticatorData, signature: signature, userID: answer.userID,
                                     attachment: Self.attachment(answer.attachment))
    }

    func createPasskey(_ options: JSONValue) async throws -> JSONValue {
        guard let rp = options["rp"]?["id"]?.stringValue,
              let challenge = options["challenge"]?.stringValue.flatMap(Base64URL.decode),
              let userID = options["user"]?["id"]?.stringValue.flatMap(Base64URL.decode),
              let name = options["user"]?["name"]?.stringValue else {
            throw PasskeyProblem(description: "The creation options name no relying party, challenge or user")
        }
        let request = ASAuthorizationPlatformPublicKeyCredentialProvider(relyingPartyIdentifier: rp)
            .createCredentialRegistrationRequest(challenge: challenge, name: name, userID: userID)
        if let preference = options["authenticatorSelection"]?["userVerification"]?.stringValue {
            request.userVerificationPreference = ASAuthorizationPublicKeyCredentialUserVerificationPreference(rawValue: preference)
        }
        if #available(iOS 17.4, *) {
            // A passkey this account already has on the device isn't made twice.
            request.excludedCredentials = PasskeyJSON.ids(options["excludeCredentials"])
                .map { ASAuthorizationPlatformPublicKeyCredentialDescriptor(credentialID: $0) }
        }
        let authorization = try await perform(request)
        guard let answer = authorization.credential as? ASAuthorizationPlatformPublicKeyCredentialRegistration,
              let attestation = answer.rawAttestationObject else {
            throw PasskeyProblem(description: "The passkey sheet gave no new passkey")
        }
        return PasskeyJSON.registration(credentialID: answer.credentialID, clientData: answer.rawClientDataJSON,
                                        attestation: attestation, attachment: Self.attachment(answer.attachment))
    }

    /// WebAuthn's word for where the passkey lives: this iPhone (iCloud
    /// Keychain, a passkey app) or another device (a phone's QR code).
    private static func attachment(_ value: ASAuthorizationPublicKeyCredentialAttachment) -> String {
        value == .crossPlatform ? "cross-platform" : "platform"
    }

    private func perform(_ request: ASAuthorizationRequest) async throws -> ASAuthorization {
        let controller = ASAuthorizationController(authorizationRequests: [request])
        controller.delegate = self
        controller.presentationContextProvider = self
        self.controller = controller
        return try await withCheckedThrowingContinuation { continuation in
            self.continuation = continuation
            controller.performRequests()
        }
    }

    nonisolated func authorizationController(controller: ASAuthorizationController,
                                             didCompleteWithAuthorization authorization: ASAuthorization) {
        MainActor.assumeIsolated {
            continuation?.resume(returning: authorization)
            continuation = nil
            self.controller = nil
        }
    }

    nonisolated func authorizationController(controller: ASAuthorizationController, didCompleteWithError error: Error) {
        MainActor.assumeIsolated {
            continuation?.resume(throwing: error)
            continuation = nil
            self.controller = nil
        }
    }

    nonisolated func presentationAnchor(for controller: ASAuthorizationController) -> ASPresentationAnchor {
        MainActor.assumeIsolated { keyWindowAnchor() }
    }
}

/// Supabase Auth's /passkeys endpoints, as supabase-js calls them (the
/// supabase-swift this app pins has no passkey API yet).
struct PasskeyServer: Sendable {
    let config: AppConfig
    var http: URLSession = .shared

    /// Sign in, first half: the request options for any of the site's passkeys.
    func signInChallenge() async throws -> PasskeyChallenge {
        try challenge(try await send("POST", "passkeys/authentication/options", token: nil, body: [:]))
    }

    /// Sign in, second half: the sheet's answer for a session's tokens.
    func signIn(_ answer: PasskeyCredential) async throws -> (accessToken: String, refreshToken: String) {
        let session = try await send("POST", "passkeys/authentication/verify", token: nil, body: body(answer))
        guard let access = session["access_token"]?.stringValue, let refresh = session["refresh_token"]?.stringValue else {
            throw ServerError(code: nil, message: "The passkey sign-in gave no session")
        }
        return (access, refresh)
    }

    /// The signed-in account's passkeys (a bare list, or { passkeys }: authMethods.passkeyRows reads either).
    func list(token: String) async throws -> JSONValue {
        try await send("GET", "passkeys", token: token, body: nil)
    }

    /// Add, first half: the creation options for this account.
    func addChallenge(token: String) async throws -> PasskeyChallenge {
        try challenge(try await send("POST", "passkeys/registration/options", token: token, body: [:]))
    }

    /// Add, second half: the new passkey saved.
    func add(_ answer: PasskeyCredential, token: String) async throws {
        _ = try await send("POST", "passkeys/registration/verify", token: token, body: body(answer))
    }

    func remove(id: String, token: String) async throws {
        guard let escaped = id.addingPercentEncoding(withAllowedCharacters: .alphanumerics.union(CharacterSet(charactersIn: "-_"))) else { return }
        _ = try await send("DELETE", "passkeys/\(escaped)", token: token, body: nil)
    }

    private func body(_ answer: PasskeyCredential) -> JSONValue {
        ["challenge_id": .string(answer.challengeId), "credential": answer.credential]
    }

    private func challenge(_ answer: JSONValue) throws -> PasskeyChallenge {
        guard let id = answer["challenge_id"]?.stringValue, let options = answer["options"], !options.isNull else {
            throw ServerError(code: nil, message: "The passkey options were incomplete")
        }
        return PasskeyChallenge(id: id, options: options)
    }

    /// One call to Supabase Auth: the answer's JSON (null when empty), or its
    /// refusal as a ServerError with the error code supabase-js reads.
    private func send(_ method: String, _ path: String, token: String?, body: JSONValue?) async throws -> JSONValue {
        var request = URLRequest(url: config.supabaseURL.appendingPathComponent("auth/v1/\(path)"))
        request.httpMethod = method
        request.setValue(config.supabaseAnonKey, forHTTPHeaderField: "apikey")
        request.setValue("Bearer \(token ?? config.supabaseAnonKey)", forHTTPHeaderField: "Authorization")
        // The error codes (error_code), as supabase-js asks for them.
        request.setValue("2024-01-01", forHTTPHeaderField: "X-Supabase-Api-Version")
        if let body {
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.httpBody = try JSONEncoder().encode(body)
        }
        let (data, response) = try await http.data(for: request)
        let status = (response as? HTTPURLResponse)?.statusCode ?? 0
        let payload = data.isEmpty ? JSONValue.null : ((try? JSONValue.parse(data)) ?? .null)
        guard (200..<300).contains(status) else {
            let code = payload["error_code"]?.stringValue ?? payload["code"]?.stringValue
            throw ServerError(code: code, message: payload["msg"]?.stringValue ?? payload["message"]?.stringValue
                              ?? "Supabase Auth answered \(status)")
        }
        return payload
    }
}
