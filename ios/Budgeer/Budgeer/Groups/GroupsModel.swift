// The Groups tab's state, after the web's Groups page: the user's groups as
// cards (their members, avatars and balance, from each group's summary,
// and the gallery's split of them), and the invites waiting for an answer
// (Accept / Decline). The reads and writes are the web's (groups,
// list_my_group_invites, group_member_avatars, group_balances,
// respond_to_invite); every figure and word is the core's
// (GroupsListFigures). A new group is NewGroupModel's.
import Foundation
import Observation
import BudgeerCore

@MainActor
@Observable
final class GroupsModel {
    enum State: Equatable {
        case loading
        case loaded(GroupsListFigures)
        case failed(String)
    }

    private(set) var state: State = .loading
    /// What the last action said when it failed (an invite's answer).
    private(set) var message: String?
    private(set) var busy = false

    private let data: DataLayer
    private let core: BudgeerCore
    let userId: String

    init(data: DataLayer, userId: String, core: BudgeerCore = .shared) {
        self.data = data
        self.userId = userId
        self.core = core
    }

    var figures: GroupsListFigures? {
        if case .loaded(let figures) = state { return figures }
        return nil
    }

    /// The groups and the invites, then each group's summary (an extra: a
    /// group whose summary fails still shows, as on the web).
    func load() async {
        do {
            async let groupsRead = data.groups.groups()
            async let invitesRead = data.groups.groupInvites()
            let groups = try await groupsRead
            let invites = try await invitesRead
            var summaries: [String: JSONValue] = [:]
            for group in groups.arrayValue ?? [] {
                guard let id = group["id"]?.stringValue else { continue }
                summaries[id] = try? await data.groups.groupSummary(id: id, balances: true)
            }
            state = .loaded(try GroupsListFigures.compute(groups: groups, summaries: summaries, invites: invites,
                                                          userId: userId, core: core))
        } catch {
            if case .loaded = state { return } // a failed refresh keeps the page
            state = .failed(UserMessage.of(error, core: core))
        }
    }

    /// Accept or decline an invite: the group's id to open after accepting.
    func respond(_ invite: InviteRow, accept: Bool) async -> String? {
        busy = true
        defer { busy = false }
        do {
            let group = try await data.groups.respondToInvite(id: invite.id, accept: accept)
            message = nil
            await load()
            return accept ? group : nil
        } catch {
            message = UserMessage.of(error, fallback: core.text("groups:list.answerFailed"), core: core)
            return nil
        }
    }
}
