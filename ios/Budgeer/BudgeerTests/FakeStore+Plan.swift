// Plan mode's, the salary page's, net worth's and the statement's reads and
// writes on the fake store: what the test sets is what the server holds (a
// saved plan or corrections become what the next read answers), and every
// write is recorded in order.
import Foundation
@testable import Budgeer

extension FakeStore {
    func recurringPlan() async throws -> JSONValue {
        if let readError = planReadError { throw readError }
        return ["plan": savedPlan, "undo": planUndo]
    }

    func saveRecurringPlan(_ plan: JSONValue, empty: Bool) async throws {
        if let writeError { throw writeError }
        planWrites.append((empty ? "clear" : "save", plan))
        savedPlan = empty ? .null : plan
    }

    func applyRecurringPlan(apply: JSONValue, remaining: JSONValue?) async throws {
        if let writeError { throw writeError }
        planWrites.append(("apply", ["apply": apply, "remaining": remaining ?? .null]))
        savedPlan = remaining ?? .null
        planUndo = ["applied_at": "2026-09-15T09:30:00.000Z", "change_count": .int(apply["changes"]?.arrayValue?.count ?? 0)]
    }

    func undoRecurringPlan() async throws -> Int {
        if let writeError { throw writeError }
        planWrites.append(("undo", .null))
        planUndo = .null
        return 2
    }

    func planWhatIf(text: String, labels: JSONValue) async throws -> JSONValue {
        whatIfLines.append(text)
        return try whatIfResult.get()
    }

    func salaryHistory() async throws -> JSONValue { salaryNotes }

    func saveSalaryHistory(_ notes: JSONValue) async throws {
        if let writeError { throw writeError }
        planWrites.append(("salary", notes))
        salaryNotes = notes
    }

    func saveNetWorthAccount(_ account: JSONValue) async throws {
        if let writeError { throw writeError }
        savingsWrites.append(("saveAccount", account))
    }

    func deleteNetWorthAccount(id: String) async throws {
        if let writeError { throw writeError }
        savingsWrites.append(("deleteAccount", .string(id)))
    }

    func statement(from: String, to: String, format: String) async throws -> Data {
        if let writeError { throw writeError }
        planWrites.append(("statement", ["from": .string(from), "to": .string(to), "format": .string(format)]))
        return Data("%PDF-1.7 fake".utf8)
    }
}
