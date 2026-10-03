// Settings' reads and writes on the fake store (the profile's columns, the
// payment details, the photo, the categories, privacy), and a fake of the
// account's sign-in calls (AccountSecurity).
import Foundation
@testable import Budgeer

extension FakeStore {
    func updateProfile(_ fields: JSONValue) async throws {
        if let writeError { throw writeError }
        settingsWrites.append(("updateProfile", fields))
        if case .success(let profile) = profileResult {
            var next = profile
            for (key, value) in fields.objectValue ?? [:] { next = next.with(key, value) }
            profileResult = .success(next)
        }
    }

    func baseCurrencyLocked() async throws -> Bool { currencyLocked }

    func myPaymentInfo() async throws -> JSONValue { myPayment }

    func savePaymentInfo(_ details: JSONValue) async throws {
        if let writeError { throw writeError }
        settingsWrites.append(("savePaymentInfo", details))
    }

    func uploadAvatar(data: Data, contentType: String, ext: String) async throws -> String {
        if let writeError { throw writeError }
        settingsWrites.append(("uploadAvatar", ["contentType": .string(contentType), "ext": .string(ext)]))
        return "https://example.supabase.co/storage/v1/object/public/avatars/u/avatar.\(ext)?t=\(data.count)"
    }

    func allCategories() async throws -> JSONValue { try allCategoriesResult.get() }

    func createCategory(_ row: JSONValue) async throws {
        if let writeError { throw writeError }
        settingsWrites.append(("createCategory", row))
    }

    func updateCategory(id: String, fields: JSONValue) async throws {
        if let writeError { throw writeError }
        settingsWrites.append(("updateCategory", ["id": .string(id), "fields": fields]))
    }

    func countCategoryUse(id: String) async throws -> Int { categoryUse }

    func deleteCategory(id: String, moveTo: String?) async throws -> Int {
        if let writeError { throw writeError }
        settingsWrites.append(("deleteCategory", ["id": .string(id), "moveTo": moveTo.json]))
        return movedOnDelete
    }

    func consents() async throws -> JSONValue { consentRows }

    func exportMyData() async throws -> JSONValue { exported }

    func sendPrivacyRequest(_ request: JSONValue) async throws {
        if let writeError { throw writeError }
        settingsWrites.append(("sendPrivacyRequest", request))
    }

    func deleteAccount(password: String?) async throws {
        if let deleteAccountError { throw deleteAccountError }
        settingsWrites.append(("deleteAccount", ["password": password.json]))
    }

    func startFresh(password: String?) async throws {
        if let startFreshError { throw startFreshError }
        settingsWrites.append(("startFresh", ["password": password.json]))
    }

    /// The writes of one kind, in order.
    func writes(_ name: String) -> [JSONValue] {
        settingsWrites.filter { $0.name == name }.map(\.args)
    }
}

/// The signed-in account's sign-in calls, answered by the test.
final class FakeSecurity: AccountSecurity, @unchecked Sendable {
    var user: JSONValue = ["email": "sam@example.com", "app_metadata": ["providers": ["email"]], "user_metadata": [:]]
    var identityRows: JSONValue = [["provider": "email", "identity_id": "i-email", "identity_data": ["email": "sam@example.com"]]]
    /// The token's claims: signed in a minute before TestData.now unless set.
    var claims: JSONValue? = ["iat": .int(Int(TestData.now.timeIntervalSince1970) - 60)]
    var changeError: Error?
    var firstError: Error?
    private(set) var calls: [String] = []

    func accountUser() async throws -> JSONValue { user }
    func identities() async throws -> JSONValue { identityRows }
    func tokenClaims() async -> JSONValue? { claims }

    func changePassword(current: String, next: String) async throws {
        calls.append("change:\(current)>\(next)")
        if let changeError { throw changeError }
    }

    func setFirstPassword(_ password: String) async throws {
        calls.append("first:\(password)")
        if let firstError { throw firstError }
        user = user.with("user_metadata", ["password_set": true])
    }

    func markPasswordSet() async throws {
        calls.append("markSet")
        user = user.with("user_metadata", ["password_set": true])
    }

    func googleLinkURL() async throws -> URL {
        calls.append("linkURL")
        return URL(string: "https://example.supabase.co/auth/v1/user/identities/authorize?provider=google")!
    }

    func finishLink(_ callback: URL) async throws {
        calls.append("finishLink")
        identityRows = .array((identityRows.arrayValue ?? []) + [
            ["provider": "google", "identity_id": "i-google", "identity_data": ["email": "sam@gmail.com"]],
        ])
    }

    func linkApple(_ credential: AppleCredential) async throws {
        calls.append("linkApple:\(credential.idToken)")
        identityRows = .array((identityRows.arrayValue ?? []) + [
            ["provider": "apple", "identity_id": "i-apple", "identity_data": ["email": "x7k2@privaterelay.appleid.com"]],
        ])
    }

    func unlink(provider: String) async throws {
        calls.append("unlink:\(provider)")
        identityRows = .array((identityRows.arrayValue ?? []).filter { $0["provider"]?.stringValue != provider })
    }

    /// The server's passkey list (a failure: passkeys are off for the project).
    var passkeyList: Result<JSONValue, Error> = .success([])

    func passkeys() async throws -> JSONValue { try passkeyList.get() }

    func passkeyOptions() async throws -> PasskeyChallenge {
        calls.append("passkeyOptions")
        return .add
    }

    func savePasskey(_ answer: PasskeyCredential) async throws {
        calls.append("savePasskey:\(answer.challengeId)")
        let list = (try? passkeyList.get())?.arrayValue ?? []
        passkeyList = .success(.array(list + [["id": "pk-new", "friendly_name": "iPhone", "created_at": "2026-09-15T09:00:00Z"]]))
    }

    func removePasskey(id: String) async throws {
        calls.append("removePasskey:\(id)")
        let list = (try? passkeyList.get())?.arrayValue ?? []
        passkeyList = .success(.array(list.filter { $0["id"]?.stringValue != id }))
    }
}
