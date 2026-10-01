// One group's state, after the web's GroupDetail and its pages (members,
// edit group): the group read as useGroup reads it (getGroup, the activity
// log) with its comment counts and the comments themselves (the timeline
// shows them under their item), and what the page can do: leave (or leave
// silently), delete (the owner, once everyone else has left), rename,
// remove a member, invite by email or with a link. Every figure and word is
// the core's (GroupPageFigures, GroupTimeline); the expense, settle-up and
// comment models come from here.
import Foundation
import Observation
import BudgeerCore

@MainActor
@Observable
final class GroupModel {
    enum State: Equatable {
        case loading
        case loaded(GroupPageFigures)
        case failed(String)
    }

    let groupId: String
    let userId: String
    private(set) var state: State = .loading
    /// The expenses, settlements and comments as one timeline, oldest first.
    private(set) var timeline: [TimelineItem] = []
    /// What the last action said (an invite sent, a member removed, a failure).
    private(set) var message: String?
    private(set) var busy = false
    /// A share link made on the Members page, to copy or share.
    private(set) var inviteLink: String?

    /// The group as read (getGroup's parts), and the members and balances the
    /// sub-pages work from.
    private(set) var detail: JSONValue = [:]
    private(set) var context: GroupPageFigures.Context?

    private let data: DataLayer
    private let core: BudgeerCore
    private let now: @Sendable () -> Date
    /// The site invite links open on (dev.budgeer.com or www.budgeer.com).
    private let site: String

    init(groupId: String, userId: String, site: String, data: DataLayer, core: BudgeerCore = .shared,
         now: @escaping @Sendable () -> Date = { Date() }) {
        self.groupId = groupId
        self.userId = userId
        self.site = site
        self.data = data
        self.core = core
        self.now = now
    }

    var figures: GroupPageFigures? {
        if case .loaded(let figures) = state { return figures }
        return nil
    }

    var group: JSONValue { detail["group"] ?? [:] }
    var groupName: String { group["name"]?.stringValue ?? "" }
    var members: JSONValue { context?.members ?? [] }
    var myMemberId: String? { context?.myMember["id"]?.stringValue }
    var today: String { (try? core.isoDate(now())) ?? "" }

    /// The group, its activity log and its comment counts.
    func load() async {
        do {
            let read = try await data.groups.groupDetail(id: groupId)
            let activity = (try? await data.groups.groupActivity(id: groupId)) ?? []
            let counts = (try? await data.groups.groupCommentCounts(id: groupId)) ?? []
            var comments: [String: JSONValue] = [:]
            for row in counts.arrayValue ?? [] {
                guard let target = row["target_id"]?.stringValue, (row["n"]?.intValue ?? 0) > 0 else { continue }
                comments[target] = (try? await data.groups.groupComments(groupId: groupId, targetId: target)) ?? []
            }
            detail = read
            context = try GroupPageFigures.context(detail: read, userId: userId, core: core)
            timeline = try GroupTimeline.compute(detail: read, counts: counts, comments: comments, userId: userId,
                                                 now: now(), core: core)
            state = .loaded(try GroupPageFigures.compute(detail: read, auditLog: activity, counts: counts, userId: userId,
                                                         now: now(), core: core))
        } catch {
            if case .loaded = state { return } // a failed refresh keeps the page
            state = .failed(UserMessage.of(error, core: core))
        }
    }

    /// An expense of the group's ledger, to edit.
    func expense(id: String) -> JSONValue? {
        detail["ledger"]?["expenses"]?.arrayValue?.first { $0["id"]?.stringValue == id }
    }

    // MARK: The sub-pages' models

    func expenseForm(expenseId: String?) -> GroupExpenseModel {
        GroupExpenseModel(group: group, members: members, myMemberId: myMemberId, userId: userId,
                          expense: expenseId.flatMap { expense(id: $0) }, data: data, core: core, now: now)
    }

    func settleUp() -> SettleUpModel? {
        guard let me = myMemberId else { return nil }
        return SettleUpModel(group: group, members: members, balances: context?.balances ?? [], myMemberId: me,
                             data: data, core: core, now: now)
    }

    func comments(itemId: String) -> CommentsModel? {
        let ledger: JSONValue = [
            "expenses": detail["ledger"]?["expenses"] ?? [], "settlements": detail["ledger"]?["settlements"] ?? [],
            "members": members,
        ]
        guard let target = try? core.json("groupFormat", "commentTarget", [ledger, JSONValue.string(itemId), myMemberId.json]),
              !target.isNull else { return nil }
        return CommentsModel(groupId: groupId, target: target, myMemberId: myMemberId, userId: userId,
                             data: data, core: core, now: now)
    }

    // MARK: Leaving, deleting, renaming

    /// Leave the group (`silent`: without telling it): true once out.
    func leave(silent: Bool) async -> Bool {
        guard let me = myMemberId else { return false }
        return await act(failure: "groups:detail.leaveFailed") {
            try await self.data.groups.removeMember(memberId: me, silent: silent)
        }
    }

    /// The type-to-confirm check (groupFormat.deleteNameMatches).
    func deleteConfirmed(_ typed: String) -> Bool {
        (try? core.call("groupFormat", "deleteNameMatches", [typed, groupName])) ?? false
    }

    func delete() async -> Bool {
        await act(failure: "groups:detail.deleteFailed") { try await self.data.groups.deleteGroup(id: self.groupId) }
    }

    /// Rename the group (the owner): true once saved.
    func rename(_ name: String) async -> Bool {
        let trimmed = name.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return false }
        let done = await act(failure: nil) { try await self.data.groups.renameGroup(id: self.groupId, name: trimmed) }
        if done {
            message = core.text("groups:edit.renamed")
            await load()
        }
        return done
    }

    // MARK: Members

    /// Remove a member (the owner): their name in the message.
    func remove(memberId: String) async {
        let name = (members.arrayValue ?? []).first { $0["id"]?.stringValue == memberId }?["display_name"] ?? ""
        let done = await act(failure: "groups:members.removeFailed") {
            try await self.data.groups.removeMember(memberId: memberId, silent: false)
        }
        if done {
            message = core.text("groups:members.removed", ["name": name])
            await load()
        }
    }

    /// Invite by email (MembersPage's InvitePanel, GroupInvite): true when
    /// the field can clear.
    func invite(email: String) async -> Bool {
        let address = email.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !address.isEmpty else { return false }
        busy = true
        defer { busy = false }
        let outcome = await GroupInvite.send(address, groupId: groupId, site: site, data: data, core: core)
        message = outcome.message
        if let link = outcome.link { inviteLink = link }
        return outcome.sent
    }

    /// A share link (createInviteLink): shown to copy or share.
    func makeInviteLink() async {
        busy = true
        defer { busy = false }
        do {
            let token = try await data.groups.createInvite(groupId: groupId, email: nil)
            inviteLink = try core.call("groupFormat", "inviteLink", [site, token])
            message = nil
        } catch {
            message = UserMessage.of(error, fallback: core.text("groups:members.inviteFailed"), core: core)
        }
    }

    /// Words with <b> as rich text (translate.parseRich).
    func rich(_ text: String) -> JSONValue {
        (try? core.json("translate", "parseRich", [text])) ?? [.string(text)]
    }

    /// A change on another page (a saved expense, a settlement): its words.
    func note(_ text: String?) {
        message = text
    }

    private func act(failure: String?, _ work: @escaping () async throws -> Void) async -> Bool {
        busy = true
        defer { busy = false }
        do {
            try await work()
            message = nil
            return true
        } catch {
            message = UserMessage.of(error, fallback: failure.map { core.text($0) }, core: core)
            return false
        }
    }
}

/// One invite by email, as MembersPage's InvitePanel sends it: someone on
/// Budgeer gets a request in the app (invite_user_to_group); anyone else an
/// emailed join link (a group_invites row, then send-invite), or the link to
/// share when the email can't go. The new-group flow sends its invites the
/// same way.
enum GroupInvite {
    struct Outcome: Equatable, Sendable {
        /// What to tell the user.
        let message: String
        /// The invite went (the field can clear).
        let sent: Bool
        /// A join link to share instead, when the email failed.
        let link: String?
    }

    @MainActor
    static func send(_ address: String, groupId: String, site: String, data: DataLayer,
                     core: BudgeerCore) async -> Outcome {
        do {
            let status = try await data.groups.inviteExistingUser(groupId: groupId, email: address)
            switch status {
            case "invited":
                return Outcome(message: core.text("groups:members.requestSent", ["email": .string(address)])
                                   + " " + core.text("groups:members.requestSentHint"), sent: true, link: nil)
            case "no_account":
                let token = try await data.groups.createInvite(groupId: groupId, email: address)
                do {
                    try await data.groups.emailInvite(to: address, token: token)
                    return Outcome(message: core.text("groups:members.emailed", ["email": .string(address)]),
                                   sent: true, link: nil)
                } catch {
                    let link: String? = try? core.call("groupFormat", "inviteLink", [site, token])
                    return Outcome(message: core.text("groups:members.emailFailed"), sent: true, link: link)
                }
            default:
                let refusal: String = (try? core.call("groupFormat", "inviteRefusal", [status.json]))
                    ?? core.text("groups:members.sendFailed")
                return Outcome(message: refusal, sent: false, link: nil)
            }
        } catch {
            return Outcome(message: UserMessage.of(error, fallback: core.text("groups:members.sendFailed"), core: core),
                           sent: false, link: nil)
        }
    }
}
