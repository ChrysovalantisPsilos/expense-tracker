// The reads and writes only Settings › Your data makes, after the web's
// backup.js: the profile's backed-up settings (PROFILE_FIELDS), the head
// count a backup is checked against, and the restore's category and budget
// writes. Everything else a backup reads or restores goes through the other
// repositories, as backup.js goes through the other features' modules.
import Foundation
import Supabase

extension SupabaseStore: BackupRepository {
    /// backup.js PROFILE_FIELDS: the profile settings a backup carries.
    static let backupProfileColumns = "display_name, base_currency, notify_email, notify_push, yearly_separate, "
        + "salary_shift_from_day, salary_category_id"

    func backupProfile() async throws -> JSONValue {
        let uid = try userId()
        return try await refusal {
            try await client.from("profiles").select(SupabaseStore.backupProfileColumns).eq("id", value: uid)
                .single().execute().value
        }
    }

    func countTransactions() async throws -> Int {
        let response: PostgrestResponse<Void> = try await refusal {
            try await client.from("transactions").select("id", head: true, count: .exact).execute()
        }
        return response.count ?? 0
    }

    func createCategories(_ rows: JSONValue) async throws {
        guard let list = rows.arrayValue, !list.isEmpty else { return }
        let uid = JSONValue.string(try userId())
        try await refusal {
            try await client.from("categories").insert(JSONValue.array(list.map { $0.with("user_id", uid) })).execute()
        }
        announce("categories")
    }

    func saveBudget(categoryId: String, amountMinor: Int, currency: String, period: String) async throws {
        let params: [String: JSONValue] = [
            "p_category": .string(categoryId), "p_amount": .int(amountMinor),
            "p_currency": .string(currency), "p_period": .string(period),
        ]
        try await refusal { try await client.rpc("save_budget", params: params).execute() }
        announce("budgets")
    }
}
