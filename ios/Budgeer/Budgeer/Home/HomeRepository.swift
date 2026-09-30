// Home's reads, the same the web's Dashboard makes: the profile columns
// that shape the figures, the savings categories, and my_transactions with
// p_spread for the month (from the shifted fetch start, so a late-month
// salary that counts in it is included). Rows travel as plain JSON: the
// core's functions read their columns, the app never types them.
import Foundation
import Supabase

protocol HomeRepository: Sendable {
    /// profiles: base_currency, yearly_separate, salary_shift_from_day, salary_category_id.
    func profile() async throws -> JSONValue
    /// categories with is_savings (id, kind, is_savings).
    func savingsCategories() async throws -> JSONValue
    /// my_transactions(p_from, p_to, p_spread: true), newest first.
    func transactions(from: String?, to: String?) async throws -> JSONValue
}

final class SupabaseHomeRepository: HomeRepository {
    private let client: SupabaseClient

    init(client: SupabaseClient) {
        self.client = client
    }

    func profile() async throws -> JSONValue {
        let userId = try await client.auth.session.user.id
        return try await client.from("profiles")
            .select("base_currency, yearly_separate, salary_shift_from_day, salary_category_id")
            .eq("id", value: userId.uuidString)
            .single()
            .execute()
            .value
    }

    func savingsCategories() async throws -> JSONValue {
        try await client.from("categories")
            .select("id, kind, is_savings")
            .eq("is_savings", value: true)
            .execute()
            .value
    }

    func transactions(from: String?, to: String?) async throws -> JSONValue {
        let params: [String: JSONValue] = [
            "p_kind": .null, "p_from": from.map { .string($0) } ?? .null, "p_to": to.map { .string($0) } ?? .null,
            "p_category": .null, "p_limit": .null, "p_spread": .bool(true),
        ]
        return try await client.rpc("my_transactions", params: params).execute().value
    }
}
