// What a first sign-in needs from the store (WelcomeModel): the default
// categories, as the web's ensureSeeded (shared/lib/categories.js) seeds them.
import Foundation
import Supabase

extension SupabaseStore {
    func ensureDefaultCategories() async throws {
        let response: PostgrestResponse<Void> = try await refusal {
            try await client.from("categories").select("id", head: true, count: .exact).execute()
        }
        guard (response.count ?? 0) == 0 else { return }
        try await refusal { try await client.rpc("seed_default_categories").execute() }
        announce("categories")
    }
}
