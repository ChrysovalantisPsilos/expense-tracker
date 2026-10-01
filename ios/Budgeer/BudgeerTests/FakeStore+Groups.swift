// FakeStore's groups: answers from what the test set (FakeStore's group
// properties), every write recorded in `groupWrites` by the web's RPC name.
import Foundation
@testable import Budgeer

extension FakeStore {
    func groups() async throws -> JSONValue { try groupsResult.get() }
    func groupInvites() async throws -> JSONValue { try invitesResult.get() }

    func groupSummary(id: String, balances: Bool) async throws -> JSONValue {
        guard let summary = summaries[id] else { throw FakeError(description: "no summary for \(id)") }
        return balances ? summary : summary.with("balances", [])
    }

    func groupDetail(id: String) async throws -> JSONValue {
        guard let detail = details[id] else { throw FakeError(description: "no group \(id)") }
        return detail
    }

    func groupActivity(id: String) async throws -> JSONValue { activityRows }
    func groupCommentCounts(id: String) async throws -> JSONValue { commentCountRows }
    func groupComments(groupId: String, targetId: String) async throws -> JSONValue { commentRows }
    func memberPaymentInfo(memberId: String) async throws -> JSONValue { paymentInfo }

    func previewLinkInvite(token: String) async throws -> JSONValue {
        guard let answer = linkPreviews[token] else { throw FakeError(description: "no link \(token)") }
        return answer
    }

    func groupStatement(groupId: String) async throws -> Data {
        try write("group-report", ["group_id": .string(groupId)])
        return Data("%PDF-1.7 group".utf8)
    }

    private func write(_ name: String, _ args: JSONValue) throws {
        if let writeError { throw writeError }
        groupWrites.append((name, args))
    }

    func createGroup(name: String, currency: String) async throws -> String {
        try write("create_group", ["p_name": .string(name), "p_currency": .string(currency)])
        return "g-new"
    }

    func renameGroup(id: String, name: String) async throws {
        try write("rename_group", ["id": .string(id), "name": .string(name)])
    }

    func uploadGroupImage(groupId: String, data: Data, contentType: String, ext: String) async throws -> String {
        try write("group-images", ["path": .string("\(groupId)/cover.\(ext)"), "contentType": .string(contentType),
                                   "bytes": .int(data.count)])
        return "https://example.supabase.co/storage/v1/object/public/group-images/\(groupId)/cover.\(ext)?t=1"
    }

    func saveGroupExpense(_ args: JSONValue) async throws {
        try write(args["expenseId"] == nil ? "create_group_expense_v2" : "update_group_expense_v2", args)
    }

    func deleteGroupExpense(id: String) async throws { try write("delete_group_expense", ["id": .string(id)]) }
    func addSettlement(_ args: JSONValue) async throws { try write("add_settlement", args) }

    func nudgeMember(groupId: String, memberId: String) async throws {
        try write("nudge_member", ["p_group": .string(groupId), "p_member": .string(memberId)])
    }

    func removeMember(memberId: String, silent: Bool) async throws {
        try write("remove_group_member", ["p_member": .string(memberId), "p_silent": .bool(silent)])
    }

    func deleteGroup(id: String) async throws { try write("delete_group", ["p_group": .string(id)]) }

    func respondToInvite(id: String, accept: Bool) async throws -> String? {
        try write("respond_to_invite", ["p_invite": .string(id), "p_accept": .bool(accept)])
        return accept ? "g-joined" : nil
    }

    func joinViaLink(token: String) async throws -> String {
        try write("join_via_link", ["p_token": .string(token)])
        return linkPreviews[token]?["group_id"]?.stringValue ?? "g-joined"
    }

    func inviteExistingUser(groupId: String, email: String) async throws -> String? {
        try write("invite_user_to_group", ["p_group": .string(groupId), "p_email": .string(email)])
        return inviteStatus
    }

    func createInvite(groupId: String, email: String?) async throws -> String {
        try write("group_invites", ["group_id": .string(groupId), "invited_email": email.json])
        return "tok-1"
    }

    func emailInvite(to: String, token: String) async throws {
        if let emailError { throw emailError }
        try write("send-invite", ["to": .string(to), "token": .string(token)])
    }

    func addComment(groupId: String, targetType: String, targetId: String, authorMemberId: String, body: String) async throws {
        try write("add_group_comment", ["p_target_type": .string(targetType), "p_target_id": .string(targetId),
                                        "p_author_member": .string(authorMemberId), "p_body": .string(body)])
    }

    func deleteComment(id: String) async throws { try write("delete_group_comment", ["id": .string(id)]) }
}
