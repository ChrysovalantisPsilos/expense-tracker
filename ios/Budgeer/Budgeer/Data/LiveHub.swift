// Live refresh, after the web's useLiveRefetch: a screen names the tables it
// shows and gets a (debounced) refresh whenever one of them changes: from
// Supabase Realtime (RealtimeFeed), from this app's own writes (the store's
// announce: realtime never delivers a filtered DELETE), on a realtime
// reconnect, and when the app comes back to the foreground (events missed
// while away are not replayed). Realtime is primary; nothing polls.
import Foundation

@MainActor
final class LiveHub {
    /// Every table the app's screens watch.
    static let tables: Set<String> = ["transactions", "categories", "recurring_rules", "budgets", "profiles"]

    private struct Watcher {
        let tables: Set<String>
        let refresh: @MainActor () async -> Void
    }

    private var watchers: [UUID: Watcher] = [:]
    private var pending: Set<String> = []
    private var timer: Task<Void, Never>?
    private let debounce: UInt64

    /// `debounceMs`: changes within this window refresh once (the web's 300 ms).
    init(debounceMs: UInt64 = 300) {
        debounce = debounceMs * 1_000_000
    }

    /// Refresh with `refresh` when any of `tables` changes, until `unwatch`.
    func watch(_ tables: Set<String>, refresh: @escaping @MainActor () async -> Void) -> UUID {
        let id = UUID()
        watchers[id] = Watcher(tables: tables, refresh: refresh)
        return id
    }

    func unwatch(_ id: UUID) {
        watchers[id] = nil
    }

    /// Something in `tables` changed: every screen showing one refreshes, once
    /// the burst is over.
    func changed(_ tables: Set<String>) {
        pending.formUnion(tables)
        timer?.cancel()
        let wait = debounce
        timer = Task { [weak self] in
            try? await Task.sleep(nanoseconds: wait)
            guard !Task.isCancelled else { return }
            await self?.flush()
        }
    }

    /// The app is back in the foreground, or realtime reconnected: catch up on everything.
    func catchUp() {
        changed(LiveHub.tables)
    }

    private func flush() async {
        let tables = pending
        pending = []
        let due = watchers.values.filter { !$0.tables.isDisjoint(with: tables) }
        for watcher in due {
            await watcher.refresh()
        }
    }
}
