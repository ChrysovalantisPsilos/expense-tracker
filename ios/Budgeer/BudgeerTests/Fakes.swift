// The fakes the view-model tests run against: an auth service and a data
// store (FakeStore) whose answers the test sets, and the parity fixtures'
// inputs (Fixtures/*.json, written from the web's functions by mobile-core/).
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

    /// What accept_legal_documents answers (nil: the accepted status).
    var acceptResult: Result<LegalStatus, Error>?
    private(set) var accepted = 0

    func acceptLegal() async throws -> LegalStatus {
        accepted += 1
        let status = try (acceptResult ?? .success(.accepted)).get()
        legal = .success(status)
        return status
    }

    /// What the service reports from outside (a token that died, a sign-in elsewhere).
    func change(to user: AuthUser?) { emit.yield(user) }
}

/// The device owner's check, answered by the test.
final class FakeOwner: OwnerCheck, @unchecked Sendable {
    var available = true
    var answer = true
    private(set) var asked: [String] = []

    func check(reason: String) async -> Bool {
        asked.append(reason)
        return answer
    }
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

/// A fixture file (Fixtures/<name>.json) from the test bundle.
func fixtureData(_ name: String) throws -> Data {
    let url = try XCTUnwrap(Bundle(for: FakeStore.self).url(forResource: name, withExtension: "json"), "\(name).json")
    return try Data(contentsOf: url)
}

extension FakeStore {
    /// A store answering Home's reads with the fixture's inputs.
    convenience init(home fixture: HomeFixture) {
        self.init()
        profileResult = .success(fixture.input.profile)
        savingsResult = .success(fixture.input.categories)
        rowsResult = .success(fixture.input.rows)
        rulesResult = .success(fixture.input.rules)
        for (currency, rate) in fixture.input.rates.objectValue ?? [:] {
            if let value = rate.doubleValue { rates["\(currency)>EUR"] = value }
        }
    }
}

/// Fixtures/home.json: the inputs and, per language and view (this month,
/// a past month), the figures the web's functions give.
struct HomeFixture: Decodable {
    struct View: Decodable {
        let name: String
        let periodValue: String?
    }
    struct Input: Decodable {
        let now: String
        let oldest: String?
        let profile: JSONValue
        let categories: JSONValue
        let rows: JSONValue
        let rules: JSONValue
        let rates: JSONValue
        let views: [View]
    }
    let input: Input
    let expected: [String: [String: HomeFigures]]

    static func load() throws -> HomeFixture {
        try JSONDecoder().decode(HomeFixture.self, from: fixtureData("home"))
    }

    var now: Date {
        ISO8601DateFormatter.fractional.date(from: input.now)!
    }

    /// This month's figures in `lang`.
    func thisMonth(_ lang: String = "en") -> HomeFigures? { expected[lang]?["thisMonth"] }

    func homeInput(periodValue: String? = nil) -> HomeInput {
        HomeInput(rows: input.rows, profile: input.profile, categories: input.categories, rules: input.rules,
                  rates: input.rates, now: now, periodValue: periodValue, oldest: input.oldest)
    }
}

extension ISO8601DateFormatter {
    static let fractional: ISO8601DateFormatter = {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return formatter
    }()
}
