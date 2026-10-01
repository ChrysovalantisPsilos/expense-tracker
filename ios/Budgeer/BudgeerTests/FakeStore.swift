// Every repository at once, answering what the test sets and recording what
// the screens asked and wrote. Rows are the JSON the server would send.
import Foundation
@testable import Budgeer

final class FakeStore: ProfileRepository, CategoriesRepository, TransactionsRepository, RecurringRepository,
    BudgetsRepository, FxRepository, AiRepository, GroupsRepository, @unchecked Sendable {
    // The groups' reads (GroupsRepository, in FakeStore+Groups.swift).
    var groupsResult: Result<JSONValue, Error> = .success([])
    var invitesResult: Result<JSONValue, Error> = .success([])
    /// Each group's { members, avatars, balances }, by id.
    var summaries: [String: JSONValue] = [:]
    /// Each group's detail ({ group, members, avatars, balances, ledger }), by id.
    var details: [String: JSONValue] = [:]
    var activityRows: JSONValue = []
    var commentCountRows: JSONValue = []
    var commentRows: JSONValue = []
    var paymentInfo: JSONValue = [:]
    /// What the groups' writes did, in order: "rpc-name" plus its arguments.
    var groupWrites: [(name: String, args: JSONValue)] = []
    /// invite_user_to_group's answer.
    var inviteStatus = "invited"
    /// Set to make the send-invite email fail.
    var emailError: Error?

    // Reads.
    var profileResult: Result<JSONValue, Error> = .success(["base_currency": "EUR"])
    var vouchersResult: Result<JSONValue, Error> = .success(.null)
    var notificationsResult: Result<JSONValue, Error> = .success([])
    private(set) var markedRead = 0
    /// Every active category; categories(kind:) keeps the ones of that kind.
    var categoriesResult: Result<JSONValue, Error> = .success([])
    var savingsResult: Result<JSONValue, Error> = .success([])
    /// my_transactions' answer (rowsFor, when set, answers per query).
    var rowsResult: Result<JSONValue, Error> = .success([])
    var rowsFor: ((TxnQuery) -> JSONValue)?
    var oldest: Result<String?, Error> = .success(nil)
    var newestIncomeRows: JSONValue = []
    var rulesResult: Result<JSONValue, Error> = .success([])
    /// my_budgets per month ('YYYY-MM-01'); [] for any other.
    var budgetsByPeriod: [String: JSONValue] = [:]
    var budgetsError: Error?
    /// "USD>EUR" → the rate (fx.rate); a pair not here has no rate.
    var rates: [String: Double] = [:]
    var aiResult: Result<JSONValue, Error> = .success(.null)
    /// my_month_summary's answer, and the months written.
    var summaryResult: Result<JSONValue, Error> = .success(.null)
    private(set) var summariesWritten: [String] = []

    // What the screens did.
    private(set) var queries: [TxnQuery] = []
    private(set) var inserted: [JSONValue] = []
    private(set) var updated: [(id: String, fields: JSONValue)] = []
    private(set) var deleted: [String] = []
    private(set) var savedRules: [(id: String?, fields: JSONValue)] = []
    private(set) var deletedRules: [String] = []
    private(set) var budgetEdits: [(categoryId: String, amountMinor: Int, currency: String, period: String)] = []
    private(set) var budgetDeletes: [(categoryId: String, period: String)] = []
    private(set) var copies: [String] = []
    private(set) var aiLines: [String] = []
    /// profiles.language writes (nil = follow the device).
    private(set) var savedLanguages: [String?] = []
    /// Set to make every write fail.
    var writeError: Error?

    init() {}

    func profile() async throws -> JSONValue { try profileResult.get() }
    func saveLanguage(_ language: String?) async throws {
        if let writeError { throw writeError }
        savedLanguages.append(language)
    }
    func mealVouchers() async throws -> JSONValue { try vouchersResult.get() }
    func notifications() async throws -> JSONValue { try notificationsResult.get() }
    func markNotificationsRead() async throws {
        if let writeError { throw writeError }
        markedRead += 1
    }

    func categories(kind: String?) async throws -> JSONValue {
        let all = try categoriesResult.get().arrayValue ?? []
        guard let kind else { return .array(all) }
        return .array(all.filter { $0["kind"]?.stringValue == kind })
    }

    func savingsCategories() async throws -> JSONValue { try savingsResult.get() }

    func transactions(_ query: TxnQuery) async throws -> JSONValue {
        queries.append(query)
        if let rowsFor { return rowsFor(query) }
        return try rowsResult.get()
    }

    func oldestDate() async throws -> String? { try oldest.get() }
    func newestIncome(categoryId: String, since: String) async throws -> JSONValue { newestIncomeRows }

    func insert(_ row: JSONValue) async throws {
        if let writeError { throw writeError }
        inserted.append(row)
    }

    func update(id: String, fields: JSONValue) async throws {
        if let writeError { throw writeError }
        updated.append((id, fields))
    }

    func delete(id: String) async throws {
        if let writeError { throw writeError }
        deleted.append(id)
    }

    func rules() async throws -> JSONValue { try rulesResult.get() }

    func save(id: String?, fields: JSONValue) async throws {
        if let writeError { throw writeError }
        savedRules.append((id, fields))
    }

    func deleteRule(id: String) async throws {
        if let writeError { throw writeError }
        deletedRules.append(id)
    }

    func budgets(period: String) async throws -> JSONValue {
        if let budgetsError { throw budgetsError }
        return budgetsByPeriod[period] ?? []
    }

    func edit(categoryId: String, amountMinor: Int, currency: String, period: String) async throws {
        if let writeError { throw writeError }
        budgetEdits.append((categoryId, amountMinor, currency, period))
    }

    func delete(categoryId: String, period: String) async throws {
        if let writeError { throw writeError }
        budgetDeletes.append((categoryId, period))
    }

    func copyPrevious(period: String) async throws -> Int {
        if let writeError { throw writeError }
        copies.append(period)
        return 2
    }

    func budgetPeriods() async throws -> JSONValue {
        .array(budgetsByPeriod.keys.sorted().map { JSONValue.string($0) })
    }

    func rate(from: String, to: String, date: String?) async -> JSONValue? {
        if from == to { return ["rate": 1, "date": .string(date ?? "2026-09-15")] }
        guard let rate = rates["\(from)>\(to)"] else { return nil }
        return ["rate": .double(rate), "date": .string(date ?? "2026-09-15")]
    }

    func series(from: String, to: String, first: String, last: String) async -> JSONValue {
        guard let rate = rates["\(from)>\(to)"] else { return [] }
        return [[.string(first), .double(rate)]]
    }

    func parseEntry(text: String, today: String, labels: JSONValue) async throws -> JSONValue {
        aiLines.append(text)
        return try aiResult.get()
    }

    func monthSummary(month: String) async throws -> JSONValue { try summaryResult.get() }

    func writeMonthSummary(month: String, lang: String, labels: JSONValue) async throws {
        if let writeError { throw writeError }
        summariesWritten.append(month)
    }

    var data: DataLayer { DataLayer(self) }
}

/// The fake data several tests share: an instant in September 2026 and the
/// user's categories (two of each kind, one income category for savings).
enum TestData {
    static let now = ISO8601DateFormatter.fractional.date(from: "2026-09-15T10:00:00.000Z")!

    static let categories: JSONValue = [
        ["id": "c-food", "name": "Groceries", "kind": "expense", "icon": .null, "color": .null,
         "default_key": "groceries", "is_archived": false, "is_savings": false],
        ["id": "c-fun", "name": "Fun", "kind": "expense", "icon": .null, "color": "teal",
         "default_key": .null, "is_archived": false, "is_savings": false],
        ["id": "c-pay", "name": "Salary", "kind": "income", "icon": .null, "color": .null,
         "default_key": "salary", "is_archived": false, "is_savings": false],
        ["id": "c-sav", "name": "Savings", "kind": "income", "icon": .null, "color": .null,
         "default_key": "savings", "is_archived": false, "is_savings": true],
    ]
}
