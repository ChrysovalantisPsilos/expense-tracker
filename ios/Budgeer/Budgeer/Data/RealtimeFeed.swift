// The realtime side of LiveHub: one channel for the signed-in user with a
// postgres_changes listener per watched table, filtered to their own rows as
// the web's owned queries are (user_id, or id for the profile), and the
// groups' tables unfiltered as the web's group pages listen. Each change
// is handed to the hub; a re-subscribe after the first (a reconnect, when
// events may have been missed) is a catch-up. Realtime is an enhancement: a
// channel that never joins only costs live updates.
import Foundation
import Supabase

@MainActor
final class RealtimeFeed {
    private let client: SupabaseClient
    private let hub: LiveHub
    private var channel: RealtimeChannelV2?
    private var tasks: [Task<Void, Never>] = []

    init(client: SupabaseClient, hub: LiveHub) {
        self.client = client
        self.hub = hub
    }

    func start(userId: UUID) async {
        await stop()
        let uid = userId.uuidString.lowercased()
        let channel = client.channel("owned-\(uid)")
        let hub = self.hub
        for table in LiveHub.owned.sorted() {
            let column = table == "profiles" ? "id" : "user_id"
            let changes = channel.postgresChange(AnyAction.self, schema: "public", table: table,
                                                 filter: .eq(column, value: uid))
            tasks.append(Task {
                for await _ in changes { hub.changed([table]) }
            })
        }
        // The groups' tables, unfiltered: the server only sends what Row Level
        // Security lets this user see (their groups, their invites).
        for table in LiveHub.shared.sorted() {
            let filter: RealtimePostgresFilter? = nil
            let changes = channel.postgresChange(AnyAction.self, schema: "public", table: table, filter: filter)
            tasks.append(Task {
                for await _ in changes { hub.changed([table]) }
            })
        }
        let status = channel.statusChange
        tasks.append(Task {
            var joined = false
            for await state in status where state == .subscribed {
                if joined { hub.catchUp() }
                joined = true
            }
        })
        self.channel = channel
        try? await channel.subscribeWithError()
    }

    func stop() async {
        tasks.forEach { $0.cancel() }
        tasks = []
        if let channel {
            await client.removeChannel(channel)
        }
        channel = nil
    }
}
