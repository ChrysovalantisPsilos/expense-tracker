// The fakes the view-model tests run against: an auth service and a Home
// repository whose answers the test sets, and the parity fixture's inputs
// (Fixtures/home.json, written by mobile-core/homeFigures.mjs).
import Foundation
import XCTest
@testable import Budgeer

final class FakeAuthService: AuthService, @unchecked Sendable {
    var user: AuthUser?
    var legal: Result<LegalStatus, Error> = .success(LegalStatus.accepted)
    var signInResult: Result<AuthUser, Error>
    private(set) var signedOut = 0
    private(set) var signIns: [SignInMethod] = []
    private let changes: AsyncStream<AuthUser?>
    private let emit: AsyncStream<AuthUser?>.Continuation

    init(user: AuthUser? = nil, signInResult: Result<AuthUser, Error> = .success(.sample)) {
        self.user = user
        self.signInResult = signInResult
        let stream = AsyncStream<AuthUser?>.makeStream()
        changes = stream.stream
        emit = stream.continuation
    }

    func currentUser() async -> AuthUser? { user }
    var userChanges: AsyncStream<AuthUser?> { changes }

    func signIn(_ method: SignInMethod) async throws -> AuthUser {
        signIns.append(method)
        let user = try signInResult.get()
        self.user = user
        return user
    }

    func signOut() async throws {
        signedOut += 1
        user = nil
    }

    func legalStatus() async throws -> LegalStatus { try legal.get() }

    /// What the service reports from outside (a token that died, a sign-in elsewhere).
    func change(to user: AuthUser?) { emit.yield(user) }
}

extension AuthUser {
    static let sample = AuthUser(id: UUID(uuidString: "0BADBEEF-0000-4000-8000-000000000001")!, email: "sam@example.com")
}

extension LegalStatus {
    static let accepted = LegalStatus(privacyVersion: "2026-09-29", termsVersion: "2026-09-23",
                                      privacyAccepted: "2026-09-29", termsAccepted: "2026-09-23", needsAcceptance: false)
    static let outdated = LegalStatus(privacyVersion: "2026-09-29", termsVersion: "2026-09-23",
                                      privacyAccepted: "2026-09-23", termsAccepted: "2026-09-23", needsAcceptance: true)
    static let fresh = LegalStatus(privacyVersion: "2026-09-29", termsVersion: "2026-09-23",
                                   privacyAccepted: nil, termsAccepted: nil, needsAcceptance: true)
}

struct FakeError: Error, CustomStringConvertible {
    let description: String
}

final class FakeHomeRepository: HomeRepository, @unchecked Sendable {
    var profileResult: Result<JSONValue, Error>
    var categoriesResult: Result<JSONValue, Error>
    var rowsResult: Result<JSONValue, Error>
    private(set) var windows: [(from: String?, to: String?)] = []

    init(fixture: HomeFixture) {
        profileResult = .success(fixture.input.profile)
        categoriesResult = .success(fixture.input.categories)
        rowsResult = .success(fixture.input.rows)
    }

    func profile() async throws -> JSONValue { try profileResult.get() }
    func savingsCategories() async throws -> JSONValue { try categoriesResult.get() }
    func transactions(from: String?, to: String?) async throws -> JSONValue {
        windows.append((from, to))
        return try rowsResult.get()
    }
}

/// Fixtures/home.json: the inputs and the figures the web's functions give.
struct HomeFixture: Decodable {
    struct Input: Decodable {
        let now: String
        let profile: JSONValue
        let categories: JSONValue
        let rows: JSONValue
    }
    let input: Input
    let expected: [String: HomeFigures]

    static func load() throws -> HomeFixture {
        let url = try XCTUnwrap(Bundle(for: FakeHomeRepository.self).url(forResource: "home", withExtension: "json"))
        return try JSONDecoder().decode(HomeFixture.self, from: Data(contentsOf: url))
    }

    var now: Date {
        ISO8601DateFormatter.fractional.date(from: input.now)!
    }

    var homeInput: HomeInput {
        HomeInput(rows: input.rows, profile: input.profile, categories: input.categories, now: now)
    }
}

extension ISO8601DateFormatter {
    static let fractional: ISO8601DateFormatter = {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return formatter
    }()
}
