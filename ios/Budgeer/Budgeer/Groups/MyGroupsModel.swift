// The groups Add's "Who's it for?" offers, after the web's myGroups.js: the
// ones the user is a member of, each with its members (and their avatars),
// most recently added to first, then newest first. The rules are
// quickAddMath's (memberGroups, byRecent, withRecent); the recently used
// list is this device's (the web keeps it in localStorage under the same
// name), only group ids.
import Foundation
import Observation
import BudgeerCore

@MainActor
@Observable
final class MyGroupsModel {
    /// The web's STORAGE_KEYS.recentGroups.
    static let recentKey = "budge:recentGroups"

    /// The groups, each with its `members` (memberGroups' rows), in the row's order.
    private(set) var groups: [JSONValue] = []

    private let data: DataLayer
    private let core: BudgeerCore
    private let userId: String
    private let defaults: UserDefaults

    init(data: DataLayer, userId: String, core: BudgeerCore = .shared, defaults: UserDefaults = .standard) {
        self.data = data
        self.userId = userId
        self.core = core
        self.defaults = defaults
    }

    /// The groups, then each one's members (no balances: the form only needs who is in it).
    func load() async {
        do {
            let list = try await data.groups.groups()
            var pairs: [JSONValue] = []
            for group in list.arrayValue ?? [] {
                guard let id = group["id"]?.stringValue,
                      let summary = try? await data.groups.groupSummary(id: id, balances: false) else { continue }
                let members = try core.json("groupFormat", "membersWithAvatars", [summary["members"] ?? [], summary["avatars"] ?? []])
                pairs.append([.string(id), ["members": members]])
            }
            // listGroupSummaries' Map<groupId, { members }>, as the core keeps a Map.
            let summaries: JSONValue = ["$": "map", "v": .array(pairs)]
            let mine = try core.json("quickAddMath", "memberGroups", [list, summaries, JSONValue.string(userId)])
            let ordered = try core.json("quickAddMath", "byRecent", [mine, MyGroupsModel.recent(defaults)])
            groups = ordered.arrayValue ?? []
        } catch {
            // Offline with nothing cached: Add is just Add.
        }
    }

    /// A group of the row by id.
    func group(_ id: String) -> JSONValue? {
        groups.first { $0["id"]?.stringValue == id }
    }

    /// The device's recently used group ids (unreadable storage: none).
    static func recent(_ defaults: UserDefaults = .standard) -> JSONValue {
        guard let text = defaults.string(forKey: recentKey), let ids = try? JSONValue.parse(text) else { return [] }
        return ids
    }

    /// The user just added an expense to `groupId`: it leads the row next time (withRecent).
    static func remember(groupId: String, core: BudgeerCore, defaults: UserDefaults = .standard) {
        guard let next = try? core.json("quickAddMath", "withRecent", [recent(defaults), JSONValue.string(groupId)]),
              let data = try? JSONEncoder().encode(next) else { return }
        defaults.set(String(decoding: data, as: UTF8.self), forKey: recentKey)
    }
}
