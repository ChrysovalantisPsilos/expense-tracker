// The groups' reads and writes over the one client, after the web's
// features/groups/groups.js and comments.js: the same tables, RPCs and edge
// function, argument for argument. Reads are kept for offline use; each
// write is announced so the screens showing its table refresh at once. A
// refusal comes back as a ServerError in the web's shape (dbError's code and
// message, or an edge function's own words), so the core's
// errors.userMessage says what to show.
import Foundation
import Supabase

extension SupabaseStore {
    // MARK: Reads

    func groups() async throws -> JSONValue {
        try await cached("groups") {
            try await client.from("groups").select("*, group_members(count)")
                .order("created_at", ascending: false).execute().value
        }
    }

    func groupInvites() async throws -> JSONValue {
        try await cached("group-invites") {
            try await client.rpc("list_my_group_invites").execute().value
        }
    }

    func groupSummary(id: String, balances: Bool) async throws -> JSONValue {
        try await cached("group-summary", "\(id)|\(balances)") {
            async let members: JSONValue = client.from("group_members").select("*").eq("group_id", value: id)
                .order("created_at").execute().value
            // The extras: a group whose RPCs fail still shows (listGroupSummaries).
            async let avatars: JSONValue? = try? client.rpc("group_member_avatars", params: SupabaseStore.groupParam(id))
                .execute().value
            async let nets: JSONValue? = balances
                ? try? client.rpc("group_balances", params: SupabaseStore.groupParam(id)).execute().value
                : JSONValue.array([])
            return ["members": try await members, "avatars": await avatars ?? [], "balances": await nets ?? []]
        }
    }

    func groupDetail(id: String) async throws -> JSONValue {
        try await cached("group", id) {
            async let group: JSONValue = client.from("groups").select("*").eq("id", value: id).single().execute().value
            async let members: JSONValue = client.from("group_members").select("*").eq("group_id", value: id)
                .order("created_at").execute().value
            // Amounts and descriptions are encrypted at rest: the decrypting,
            // membership-checked group_ledger gives the expenses (with their
            // splits) and the settlements, newest first.
            async let ledger: JSONValue = refusal {
                try await client.rpc("group_ledger", params: SupabaseStore.groupParam(id)).execute().value
            }
            async let avatars: JSONValue? = try? client.rpc("group_member_avatars", params: SupabaseStore.groupParam(id))
                .execute().value
            async let nets: JSONValue? = try? client.rpc("group_balances", params: SupabaseStore.groupParam(id))
                .execute().value
            return ["group": try await group, "members": try await members, "ledger": try await ledger,
                    "avatars": await avatars ?? [], "balances": await nets ?? []]
        }
    }

    func groupActivity(id: String) async throws -> JSONValue {
        try await cached("group-activity", id) {
            try await refusal {
                try await client.rpc("group_audit_entries", params: ["p_group": JSONValue.string(id), "p_limit": 200])
                    .execute().value
            }
        }
    }

    func groupCommentCounts(id: String) async throws -> JSONValue {
        try await cached("group-comment-counts", id) {
            try await refusal {
                try await client.rpc("group_comment_counts", params: SupabaseStore.groupParam(id)).execute().value
            }
        }
    }

    func groupComments(groupId: String, targetId: String) async throws -> JSONValue {
        try await cached("group-comments", "\(groupId)|\(targetId)") {
            try await refusal {
                try await client.rpc("group_comments_for", params: [
                    "p_group": JSONValue.string(groupId), "p_target": .string(targetId),
                ]).execute().value
            }
        }
    }

    func memberPaymentInfo(memberId: String) async throws -> JSONValue {
        try await refusal {
            try await client.rpc("member_payment_info", params: ["p_member": JSONValue.string(memberId)]).execute().value
        }
    }

    // MARK: Writes

    func createGroup(name: String, currency: String) async throws -> String {
        let id: JSONValue = try await refusal {
            try await client.rpc("create_group", params: ["p_name": JSONValue.string(name), "p_currency": .string(currency)])
                .execute().value
        }
        announce("groups")
        return id.stringValue ?? ""
    }

    func renameGroup(id: String, name: String) async throws {
        try await refusal {
            try await client.from("groups").update(["name": JSONValue.string(name)]).eq("id", value: id).execute()
        }
        announce("groups")
    }

    func uploadGroupImage(groupId: String, data: Data, contentType: String, ext: String) async throws -> String {
        // groups.js uploadGroupImage: the owner's folder (storage RLS checks
        // is_group_owner), replaced in place, then the public URL with a
        // cache-buster on the group (image_url_guard checks the prefix).
        let path = "\(groupId)/cover.\(ext)"
        let bucket = client.storage.from("group-images")
        let url: String = try await refusal {
            try await bucket.upload(path, data: data, options: FileOptions(contentType: contentType, upsert: true))
            let base = try bucket.getPublicURL(path: path)
            let stamped = "\(base.absoluteString)?t=\(Int(Date().timeIntervalSince1970 * 1000))"
            try await client.from("groups").update(["image_url": JSONValue.string(stamped)]).eq("id", value: groupId).execute()
            return stamped
        }
        announce("groups")
        return url
    }

    func saveGroupExpense(_ args: JSONValue) async throws {
        // groups.js addSharedExpense / updateSharedExpense: one transaction, so
        // an expense never lands without its split.
        var params: [String: JSONValue] = [
            "p_description": (args["description"]?.stringValue).flatMap { $0.isEmpty ? nil : $0 }.json,
            "p_amount": args["amountMinor"] ?? .null, "p_currency": args["currency"] ?? .null,
            "p_paid_by": args["paidBy"] ?? .null, "p_spent_at": args["spentAt"] ?? .null,
            "p_member_ids": args["memberIds"] ?? [], "p_shares": args["shares"] ?? .null,
            "p_split_type": args["splitType"] ?? "equal", "p_exchange_rate": args["exchangeRate"] ?? .null,
        ]
        let function: String
        if let expenseId = args["expenseId"] {
            params["p_expense"] = expenseId
            function = "update_group_expense_v2"
        } else {
            params["p_group"] = args["groupId"] ?? .null
            function = "create_group_expense_v2"
        }
        try await refusal { try await client.rpc(function, params: params).execute() }
        announce("group_expenses")
    }

    func deleteGroupExpense(id: String) async throws {
        try await refusal { try await client.from("group_expenses").delete().eq("id", value: id).execute() }
        announce("group_expenses")
    }

    func addSettlement(_ args: JSONValue) async throws {
        // The amount is encrypted by the RPC; created_by is the server's (settlement_guard).
        let params: [String: JSONValue] = [
            "p_group": args["groupId"] ?? .null, "p_from": args["fromMember"] ?? .null, "p_to": args["toMember"] ?? .null,
            "p_amount": args["amountMinor"] ?? .null, "p_currency": args["currency"] ?? .null,
            "p_settled_at": args["settledAt"] ?? .null,
        ]
        try await refusal { try await client.rpc("add_settlement", params: params).execute() }
        announce("settlements")
    }

    func nudgeMember(groupId: String, memberId: String) async throws {
        try await refusal {
            try await client.rpc("nudge_member", params: ["p_group": JSONValue.string(groupId), "p_member": .string(memberId)])
                .execute()
        }
    }

    func removeMember(memberId: String, silent: Bool) async throws {
        try await refusal {
            try await client.rpc("remove_group_member", params: ["p_member": JSONValue.string(memberId), "p_silent": .bool(silent)])
                .execute()
        }
        announce("group_members")
    }

    func deleteGroup(id: String) async throws {
        try await refusal { try await client.rpc("delete_group", params: SupabaseStore.groupParam(id)).execute() }
        announce("groups")
    }

    func respondToInvite(id: String, accept: Bool) async throws -> String? {
        let group: JSONValue = try await refusal {
            try await client.rpc("respond_to_invite", params: ["p_invite": JSONValue.string(id), "p_accept": .bool(accept)])
                .execute().value
        }
        announce("group_invites")
        announce("group_members")
        return group.stringValue
    }

    func inviteExistingUser(groupId: String, email: String) async throws -> String? {
        let answer: JSONValue = try await refusal {
            try await client.rpc("invite_user_to_group", params: ["p_group": JSONValue.string(groupId), "p_email": .string(email)])
                .execute().value
        }
        return answer["status"]?.stringValue
    }

    func createInvite(groupId: String, email: String?) async throws -> String {
        let row: JSONValue = ["group_id": .string(groupId), "invited_email": email.json]
        let created: JSONValue = try await refusal {
            try await client.from("group_invites").insert(row).select("token").single().execute().value
        }
        return created["token"]?.stringValue ?? ""
    }

    func emailInvite(to: String, token: String) async throws {
        let body: JSONValue = ["to": .string(to), "token": .string(token)]
        let _: JSONValue = try await refusal {
            try await client.functions.invoke("send-invite", options: FunctionInvokeOptions(body: body))
        }
    }

    func addComment(groupId: String, targetType: String, targetId: String, authorMemberId: String, body: String) async throws {
        let params: [String: JSONValue] = [
            "p_group": .string(groupId), "p_target_type": .string(targetType), "p_target_id": .string(targetId),
            "p_author_member": .string(authorMemberId), "p_body": .string(body),
        ]
        try await refusal { try await client.rpc("add_group_comment", params: params).execute() }
        announce("group_comments")
    }

    func deleteComment(id: String) async throws {
        try await refusal { try await client.from("group_comments").delete().eq("id", value: id).execute() }
        announce("group_comments")
    }

    // MARK: Helpers

    private static func groupParam(_ id: String) -> [String: JSONValue] {
        ["p_group": .string(id)]
    }

    /// The request, its refusal in the web's shape (errors.js dbError, edgeFunctionError).
    private func refusal<T>(_ work: () async throws -> T) async throws -> T {
        do {
            return try await work()
        } catch let error as PostgrestError {
            throw ServerError(code: error.code, message: error.message)
        } catch let error as StorageError {
            throw ServerError(code: error.statusCode, message: error.message)
        } catch FunctionsError.httpError(_, let data) {
            let payload = try? JSONValue.parse(data)
            throw ServerError(code: payload?["code"]?.stringValue, message: payload?["error"]?.stringValue ?? "", edge: true)
        }
    }
}
