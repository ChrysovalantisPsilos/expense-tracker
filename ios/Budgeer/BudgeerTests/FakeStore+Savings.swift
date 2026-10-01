// Savings' and meal vouchers' reads and writes on the fake store: the
// net-worth accounts, the goals, and the vouchers' setup (a save becomes
// what the next read answers, as on the server).
import Foundation
@testable import Budgeer

extension FakeStore {
    func accounts() async throws -> JSONValue { accountRows }

    func goals() async throws -> JSONValue { goalRows }

    func saveGoal(_ goal: JSONValue) async throws {
        if let writeError { throw writeError }
        savingsWrites.append(("saveGoal", goal))
    }

    func deleteGoal(id: String) async throws {
        if let writeError { throw writeError }
        savingsWrites.append(("deleteGoal", .string(id)))
    }

    func saveMealVouchers(_ settings: JSONValue) async throws {
        if let writeError { throw writeError }
        savingsWrites.append(("saveMealVouchers", settings))
        vouchersResult = .success(settings)
    }
}
