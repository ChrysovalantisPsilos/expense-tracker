// Sign in with Apple: the system's sheet (AuthenticationServices), asked for
// the name and email, with a fresh random nonce whose SHA-256 goes in the
// request; Apple's identity token carries that hash, and Supabase Auth
// checks it against the raw nonce we send with the token (a token can't be
// replayed from another request). Two ways in: the sign-in screen's button
// (SignInWithAppleButton, Apple's own look) and Settings › Security's
// Connect (AppleAuthorizer, no button of Apple's needed there).
import AuthenticationServices
import CryptoKit
import Foundation
import SwiftUI

/// A one-time nonce: the raw value for Supabase, its SHA-256 (hex) for Apple.
struct AppleNonce {
    let raw: String
    var hashed: String { SHA256.hash(data: Data(raw.utf8)).map { String(format: "%02x", $0) }.joined() }

    init() {
        var bytes = [UInt8](repeating: 0, count: 32)
        if SecRandomCopyBytes(kSecRandomDefault, bytes.count, &bytes) != errSecSuccess {
            // The system's generator never fails in practice; fall back to Swift's.
            bytes = (0..<32).map { _ in UInt8.random(in: .min ... .max) }
        }
        raw = Data(bytes).base64EncodedString()
            .replacingOccurrences(of: "+", with: "-").replacingOccurrences(of: "/", with: "_")
            .replacingOccurrences(of: "=", with: "")
    }

    /// Apple's answer as the app's credential: the token, this nonce, and the
    /// name when Apple gave one (first sign-in only), as the device writes names.
    func credential(from authorization: ASAuthorization) -> AppleCredential? {
        guard let apple = authorization.credential as? ASAuthorizationAppleIDCredential,
              let data = apple.identityToken, let token = String(data: data, encoding: .utf8) else { return nil }
        var name: String?
        if let parts = apple.fullName {
            let formatted = PersonNameComponentsFormatter.localizedString(from: parts, style: .default)
                .trimmingCharacters(in: .whitespacesAndNewlines)
            name = formatted.isEmpty ? nil : formatted
        }
        return AppleCredential(idToken: token, nonce: raw, fullName: name)
    }
}

/// True when the person closed Apple's sheet (nothing to report).
func isAppleCancel(_ error: Error) -> Bool {
    (error as? ASAuthorizationError)?.code == .canceled
}

/// The sign-in screen's "Sign in with Apple": Apple's button (black, or white
/// in dark mode, as Apple asks), a pill like the others.
struct AppleSignInButton: View {
    let onCredential: (AppleCredential) -> Void
    let onFailure: (Error) -> Void
    @Environment(\.colorScheme) private var scheme
    @State private var nonce = AppleNonce()

    var body: some View {
        SignInWithAppleButton(.signIn) { request in
            nonce = AppleNonce()
            request.requestedScopes = [.fullName, .email]
            request.nonce = nonce.hashed
        } onCompletion: { result in
            switch result {
            case .success(let authorization):
                if let credential = nonce.credential(from: authorization) { onCredential(credential) }
                else { onFailure(SignInError.rejected(code: nil, message: "Apple gave no identity token")) }
            case .failure(let error):
                onFailure(error)
            }
        }
        .signInWithAppleButtonStyle(scheme == .dark ? .white : .black)
        .frame(height: 48)
        .clipShape(Capsule())
        .id(scheme)
    }
}

/// Apple's sheet without a button of its own (Settings › Security's Connect):
/// the credential, or the error (isAppleCancel when closed).
@MainActor
final class AppleAuthorizer: NSObject, ASAuthorizationControllerDelegate, ASAuthorizationControllerPresentationContextProviding {
    private var continuation: CheckedContinuation<AppleCredential, Error>?
    private var nonce = AppleNonce()

    func authorize() async throws -> AppleCredential {
        nonce = AppleNonce()
        let request = ASAuthorizationAppleIDProvider().createRequest()
        request.requestedScopes = [.fullName, .email]
        request.nonce = nonce.hashed
        let controller = ASAuthorizationController(authorizationRequests: [request])
        controller.delegate = self
        controller.presentationContextProvider = self
        return try await withCheckedThrowingContinuation { continuation in
            self.continuation = continuation
            controller.performRequests()
        }
    }

    nonisolated func authorizationController(controller: ASAuthorizationController,
                                             didCompleteWithAuthorization authorization: ASAuthorization) {
        MainActor.assumeIsolated {
            if let credential = nonce.credential(from: authorization) {
                continuation?.resume(returning: credential)
            } else {
                continuation?.resume(throwing: SignInError.rejected(code: nil, message: "Apple gave no identity token"))
            }
            continuation = nil
        }
    }

    nonisolated func authorizationController(controller: ASAuthorizationController, didCompleteWithError error: Error) {
        MainActor.assumeIsolated {
            continuation?.resume(throwing: error)
            continuation = nil
        }
    }

    nonisolated func presentationAnchor(for controller: ASAuthorizationController) -> ASPresentationAnchor {
        MainActor.assumeIsolated {
            UIApplication.shared.connectedScenes
                .compactMap { $0 as? UIWindowScene }
                .flatMap(\.windows)
                .first { $0.isKeyWindow } ?? ASPresentationAnchor()
        }
    }
}
