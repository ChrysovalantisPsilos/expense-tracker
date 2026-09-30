// Every repository at once, answering what the test sets and recording what
// the screens asked and wrote. Rows are the JSON the server would send.
import Foundation
@testable import Budgeer

final class FakeStore: ProfileRepository, CategoriesRepository, TransactionsRepository, RecurringRepository,
    BudgetsRepository, FxRepository, AiRepository, @unchecked Sendable {
    // Reads.
    var profileResult: Result<JSONValue, Error> = .success(["base_currency": "EUR"])
    var vouchersResult: Result<JSONValue, Error> = .success(.null)
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
    /// Set to make every write fail.
    var writeError: Error?

    init() {}

    func profile() async throws -> JSONValue { try profileResult.get() }
    func mealVouchers() async throws -> JSONValue { try vouchersResult.get() }

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

    var data: DataLayer { DataLayer(self) }
}
