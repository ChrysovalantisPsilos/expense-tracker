// The one Supabase client, built from the configuration's URL and public
// anon key (AppConfig). Data access goes through the feature repositories
// (HomeRepository, …), never straight from a view.
import Foundation
import Supabase

enum SupabaseClientProvider {
    static func make(_ config: AppConfig) -> SupabaseClient {
        SupabaseClient(supabaseURL: config.supabaseURL, supabaseKey: config.supabaseAnonKey)
    }
}
