// The import's and the backup's reads and writes on the fake store: the
// rules change as they're written, a save of rows counts the ones whose id
// wasn't saved before (as save_transactions with p_ignore_duplicates does),
// and every write is recorded in order.
import Foundation
@testable import Budgeer

extension FakeStore {
    func importRules() async throws -> JSONValue { importRuleRows }

    func saveImportRule(pattern: String, categoryId: String) async throws {
        if let writeError { throw writeError }
        importWrites.append(("saveRule", ["pattern": .string(pattern), "category_id": .string(categoryId)]))
        let id = JSONValue.string("rule-\((importRuleRows.arrayValue ?? []).count + 1)")
        importRuleRows = .array((importRuleRows.arrayValue ?? []) + [[
            "id": id, "pattern": .string(pattern), "category_id": .string(categoryId), "created_at": "2026-09-15T10:00:00.000Z",
        ]])
    }

    func updateImportRule(id: String, pattern: String, categoryId: String) async throws {
        if let error = ruleUpdateError ?? writeError { throw error }
        importWrites.append(("updateRule", ["id": .string(id), "pattern": .string(pattern), "category_id": .string(categoryId)]))
        importRuleRows = .array((importRuleRows.arrayValue ?? []).map { row in
            row["id"]?.stringValue == id ? row.with("pattern", .string(pattern)).with("category_id", .string(categoryId)) : row
        })
    }

    func deleteImportRule(id: String) async throws {
        if let writeError { throw writeError }
        importWrites.append(("deleteRule", .string(id)))
        importRuleRows = .array((importRuleRows.arrayValue ?? []).filter { $0["id"]?.stringValue != id })
    }

    func saveTransactions(_ rows: JSONValue) async throws -> Int {
        if let writeError { throw writeError }
        let known = Set(importWrites.filter { $0.name == "saveTransactions" }
            .flatMap { $0.args.arrayValue ?? [] }.compactMap { $0["client_uuid"]?.stringValue })
        importWrites.append(("saveTransactions", rows))
        return (rows.arrayValue ?? []).filter { !known.contains($0["client_uuid"]?.stringValue ?? "") }.count
    }

    func suggestCategories(merchants: JSONValue, labels: JSONValue) async throws -> JSONValue { try ideasResult.get() }

    func backupProfile() async throws -> JSONValue { backupProfileRow }

    func countTransactions() async throws -> Int {
        if let transactionCount { return transactionCount }
        return try await transactions(TxnQuery()).arrayValue?.count ?? 0
    }

    func createCategories(_ rows: JSONValue) async throws {
        if let writeError { throw writeError }
        guard !(rows.arrayValue ?? []).isEmpty else { return }
        importWrites.append(("createCategories", rows))
        // The new categories exist from now on, with ids.
        let made = (rows.arrayValue ?? []).enumerated().map { index, row in row.with("id", .string("new-\(index + 1)")) }
        if case .success(let all) = allCategoriesResult { allCategoriesResult = .success(.array((all.arrayValue ?? []) + made)) }
    }

    func saveBudget(categoryId: String, amountMinor: Int, currency: String, period: String) async throws {
        if let writeError { throw writeError }
        importWrites.append(("saveBudget", ["categoryId": .string(categoryId), "amountMinor": .int(amountMinor),
                                            "currency": .string(currency), "period": .string(period)]))
    }
}
