// Everything the app makes once from its configuration: the Supabase
// client, the auth service behind the session store (and Settings › Security's
// account calls), the offline cache, the live-refresh hub and its realtime
// feed, the Face ID lock, a join link waiting to be shown, and the data
// layer every screen reads through (SupabaseStore). Views get what they
// need from here; nothing else makes a client.
import Foundation
import Supabase

@MainActor
final class AppContainer {
    let config: AppConfig
    let client: SupabaseClient
    let session: SessionStore
    let cache: QueryCache
    let live: LiveHub
    let feed: RealtimeFeed
    let data: DataLayer
    /// Settings › Security's sign-in methods and password.
    let security: AccountSecurity
    /// The Face ID lock (this device's choice).
    let lock = AppLock()
    /// An invite link the app was opened with (budgeer://join/<token>).
    let joinInbox = JoinInbox()
    /// Push on this iPhone (the permission, the device token on the server).
    let push: PushModel

    init(config: AppConfig) {
        self.config = config
        client = SupabaseClientProvider.make(config)
        session = SessionStore(auth: SupabaseAuthService(client: client))
        security = SupabaseAccountSecurity(client: client, config: config)
        cache = QueryCache.standard()
        let live = LiveHub()
        self.live = live
        feed = RealtimeFeed(client: client, hub: live)
        // A write refreshes every screen showing its table at once.
        let store = SupabaseStore(client: client, cache: cache, announce: { table in
            Task { @MainActor in live.changed([table]) }
        })
        data = DataLayer(store)
        let push = PushModel(data: data, system: ApplePushSystem(), environment: config.apnsEnvironment)
        self.push = push
        // Signing out forgets this iPhone's token while the session still can.
        session.beforeSignOut = { await push.forget() }
    }

    /// Signed out: stop the realtime feed and forget the offline copies, so
    /// the next account never sees this one's.
    func signedOut() async {
        await feed.stop()
        await cache.clear()
    }
}
