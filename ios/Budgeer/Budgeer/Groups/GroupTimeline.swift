// A group's history as one timeline, read like a chat (groupFormat.
// timelineParts): day headings, each expense (who paid, your share) and
// settlement, each followed by its comments. Every word is the core's;
// Swift decodes what it answers.
import Foundation
import BudgeerCore

/// An expense in the timeline: its row's parts, whether you paid it, the
/// payer's circle and your share.
struct TimelineExpense: Decodable, Equatable, Identifiable, Sendable {
    let id: String
    let title: String
    let meta: [MetaPart]
    let amount: String
    let amountMeta: String?
    let comments: Int
    let canEdit: Bool
    let mine: Bool
    let payer: Avatar?
    let share: String?
}

/// A comment in the timeline, after the item it's on.
struct TimelineComment: Decodable, Equatable, Identifiable, Sendable {
    let avatar: Avatar
    let author: String
    let when: String
    let body: String
    let canDelete: Bool
    let mine: Bool
    /// The expense or settlement it's on.
    let targetId: String
    var id: String { avatar.id ?? "" }

    private enum Keys: String, CodingKey { case author, when, body, canDelete, mine, targetId }

    /// The comment's fields beside its avatar's, as the core writes them.
    init(from decoder: Decoder) throws {
        avatar = try Avatar(from: decoder)
        let container = try decoder.container(keyedBy: Keys.self)
        author = try container.decode(String.self, forKey: .author)
        when = try container.decode(String.self, forKey: .when)
        body = try container.decode(String.self, forKey: .body)
        canDelete = try container.decode(Bool.self, forKey: .canDelete)
        mine = try container.decode(Bool.self, forKey: .mine)
        targetId = try container.decode(String.self, forKey: .targetId)
    }
}

enum TimelineItem: Decodable, Equatable, Identifiable, Sendable {
    case day(id: String, title: String)
    case expense(TimelineExpense)
    case settlement(SettlementRow)
    case comment(TimelineComment)

    var id: String {
        switch self {
        case .day(let id, _): return id
        case .expense(let row): return row.id
        case .settlement(let row): return row.id
        case .comment(let row): return "c-" + row.id
        }
    }

    /// The expense's or settlement's id an item belongs to (a comment's target).
    var itemId: String? {
        switch self {
        case .day: return nil
        case .expense(let row): return row.id
        case .settlement(let row): return row.id
        case .comment(let row): return row.targetId
        }
    }

    private enum Keys: String, CodingKey { case type, id, title }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: Keys.self)
        switch try container.decode(String.self, forKey: .type) {
        case "day":
            self = .day(id: try container.decode(String.self, forKey: .id), title: try container.decode(String.self, forKey: .title))
        case "expense":
            self = .expense(try TimelineExpense(from: decoder))
        case "settlement":
            self = .settlement(try SettlementRow(from: decoder))
        default:
            self = .comment(try TimelineComment(from: decoder))
        }
    }
}

enum GroupTimeline {
    /// - detail: GroupsRepository.groupDetail's answer; counts: group_comment_counts' rows
    /// - comments: each commented item's id → its group_comments_for rows
    static func compute(detail: JSONValue, counts: JSONValue, comments: [String: JSONValue], userId: String, now: Date,
                        core: BudgeerCore) throws -> [TimelineItem] {
        let group = detail["group"] ?? [:]
        let user = JSONValue.string(userId)
        let members = try core.json("groupFormat", "membersWithAvatars", [detail["members"] ?? [], detail["avatars"] ?? []])
        let viewer = try core.json("groupFormat", "groupViewer", [group, members, user])
        let args: JSONValue = [
            "expenses": detail["ledger"]?["expenses"] ?? [],
            "settlements": detail["ledger"]?["settlements"] ?? [],
            "comments": .object(comments),
            "members": members,
            "myMemberId": viewer["myMember"]?["id"] ?? .null,
            "myUserId": user,
            "isOwner": viewer["isOwner"] ?? false,
            "currency": group["currency"] ?? "EUR",
            "counts": try core.json("groupFormat", "commentCountsFrom", [counts]),
            "now": try JSONValue.from(JSDate(now)),
        ]
        return try core.call("groupFormat", "timelineParts", [args])
    }
}
