// Everything the app makes once from its configuration: the Supabase
// client, the auth service behind the session store, and each feature's
// repository. Views get what they need from here; nothing else makes a
// client.
import Foundation
import Supabase

@MainActor
final class AppContainer {
    let config: AppConfig
    let client: SupabaseClient
    let session: SessionStore
    let home: HomeRepository

    init(config: AppConfig) {
        self.config = config
        client = SupabaseClientProvider.make(config)
        session = SessionStore(auth: SupabaseAuthService(client: client))
        home = SupabaseHomeRepository(client: client)
    }
}
