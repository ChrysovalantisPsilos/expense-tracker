// Everything the app makes once from its configuration: the Supabase
// client, the auth service behind the session store (and Settings › Security's
// account calls), the offline cache, the live-refresh hub and its realtime
// feed, the Face ID lock, a join link waiting to be shown, where an opened
// link leads (AppLinks), and the data layer every screen reads through
// (SupabaseStore). Views get what they
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
    /// Signing up, the confirmation again, a password reset (signed out).
    let access: AccountAccess
    /// The Face ID lock (this device's choice).
    let lock = AppLock()
    /// An invite link the app was opened with (budgeer://join/<token>, or the website's /join/<token>).
    let joinInbox = JoinInbox()
    /// Push on this iPhone (the permission, the device token on the server).
    let push: PushModel

    init(config: AppConfig) {
        self.config = config
        client = SupabaseClientProvider.make(config)
        session = SessionStore(auth: SupabaseAuthService(client: client, config: config))
        security = SupabaseAccountSecurity(client: client, config: config)
        access = SupabaseAccountAccess(client: client)
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

    /// A link the app was opened with (the website's, or budgeer://): an
    /// invite waits for the Groups tab, a page for the signed-in frame (as a
    /// tapped notification's), an auth email's link signs in.
    func open(_ url: URL) {
        switch AppLink.of(url, hosts: config.linkHosts) {
        case .join(let token): joinInbox.token = token
        case .page(let path): PushInbox.shared.path = path
        case .email(let link): Task { await session.openEmailLink(link) }
        case nil: break
        }
    }

    /// Signed out: stop the realtime feed and forget the offline copies, so
    /// the next account never sees this one's.
    func signedOut() async {
        await feed.stop()
        await cache.clear()
    }
}
