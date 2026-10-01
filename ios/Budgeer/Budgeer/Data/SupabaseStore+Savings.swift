// Savings' and meal vouchers' reads and writes over the one client, after the
// web's shared/lib/accounts.js (the net-worth accounts: their savings ones are
// the Savings total), features/savings/savings.js (the goals, encrypted at
// rest: read through my_goals, written through save_goal) and
// features/vouchers/vouchers.js (saving the setup): the same RPCs and tables,
// argument for argument. Each write is announced so the screens showing its
// table refresh at once.
import Foundation
import Supabase

extension SupabaseStore: SavingsRepository {
    func accounts() async throws -> JSONValue {
        try await cached("accounts") {
            try await refusal { try await client.rpc("my_accounts").execute().value }
        }
    }

    func goals() async throws -> JSONValue {
        try await cached("goals") {
            try await refusal { try await client.rpc("my_goals").execute().value }
        }
    }

    func saveGoal(_ goal: JSONValue) async throws {
        // savings.js saveGoal: every field, the encrypting RPC rewrites them all.
        let params: [String: JSONValue] = [
            "p_id": goal["id"] ?? .null, "p_name": goal["name"] ?? .null,
            "p_target": goal["target_minor"] ?? .null, "p_saved": goal["saved_minor"] ?? .null,
            "p_currency": goal["currency"] ?? .null, "p_target_date": goal["target_date"] ?? .null,
        ]
        try await refusal { try await client.rpc("save_goal", params: params).execute() }
        announce("savings_goals")
    }

    func deleteGoal(id: String) async throws {
        try await refusal { try await client.from("savings_goals").delete().eq("id", value: id).execute() }
        announce("savings_goals")
    }

    func saveMealVouchers(_ settings: JSONValue) async throws {
        try await refusal { try await client.rpc("save_meal_vouchers", params: ["p": settings]).execute() }
        announce("meal_vouchers")
    }
}
