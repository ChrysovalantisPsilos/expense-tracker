// The offline reads: the last good answer of every read, on disk, so a
// screen opens without a connection (the web's service worker serves its
// cached reads the same way, shared/lib/offlineReads.js). Network first: a
// read that works replaces the stored answer; one that fails falls back to
// it, and fails only when nothing was ever stored. One folder per signed-in
// user, cleared on sign-out. Answers are the server's JSON as it came.
import Foundation

actor QueryCache {
    private let folder: URL
    private let files = FileManager.default

    init(folder: URL) {
        self.folder = folder
    }

    /// Caches/queries: the system may clear it when space runs low, which
    /// only costs an offline start.
    static func standard() -> QueryCache {
        let caches = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask).first
            ?? URL(fileURLWithPath: NSTemporaryDirectory())
        return QueryCache(folder: caches.appendingPathComponent("queries", isDirectory: true))
    }

    /// The stored answer for `key`, if any.
    func load(_ key: String) -> JSONValue? {
        guard let data = try? Data(contentsOf: file(key)) else { return nil }
        return try? JSONValue.parse(data)
    }

    func store(_ key: String, _ value: JSONValue) {
        do {
            try files.createDirectory(at: folder, withIntermediateDirectories: true)
            let data = try JSONEncoder().encode(value)
            // The app container's default protection class applies (locked
            // until the device is first unlocked).
            try data.write(to: file(key), options: [.atomic])
        } catch {
            // A full disk only costs the offline copy.
        }
    }

    /// Forget everything (sign-out: the next account must not see this one's).
    func clear() {
        try? files.removeItem(at: folder)
    }

    /// Network first, the stored answer when the network fails.
    nonisolated func read(_ key: String, fetch: () async throws -> JSONValue) async throws -> JSONValue {
        do {
            let value = try await fetch()
            await store(key, value)
            return value
        } catch {
            if let hit = await load(key) { return hit }
            throw error
        }
    }

    private func file(_ key: String) -> URL {
        folder.appendingPathComponent(QueryCache.fileName(key))
    }

    /// A key's file: its 64-bit FNV-1a hash in hex (keys hold ids and dates).
    static func fileName(_ key: String) -> String {
        var hash: UInt64 = 0xCBF2_9CE4_8422_2325
        for byte in key.utf8 {
            hash ^= UInt64(byte)
            hash = hash &* 0x0000_0100_0000_01B3
        }
        return String(hash, radix: 16) + ".json"
    }
}
