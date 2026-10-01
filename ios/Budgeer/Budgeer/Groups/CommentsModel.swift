// A comment thread on one of a group's expenses or settlements, after the
// web's CommentsPage: the comments oldest first (who, when, the text, and a
// delete on your own), and a new one from a member. The reads and writes
// are the web's (group_comments_for, add_group_comment, delete); each
// comment's words are the core's (commentParts).
import Foundation
import Observation
import BudgeerCore

struct CommentRow: Decodable, Equatable, Identifiable, Sendable {
    let avatar: Avatar
    let author: String
    let when: String
    let body: String
    let canDelete: Bool
    var id: String { avatar.id ?? "" }

    private enum Keys: String, CodingKey { case author, when, body, canDelete }

    /// The comment's fields beside its avatar's, as the core writes them.
    init(from decoder: Decoder) throws {
        avatar = try Avatar(from: decoder)
        let container = try decoder.container(keyedBy: Keys.self)
        author = try container.decode(String.self, forKey: .author)
        when = try container.decode(String.self, forKey: .when)
        body = try container.decode(String.self, forKey: .body)
        canDelete = try container.decode(Bool.self, forKey: .canDelete)
    }
}

@MainActor
@Observable
final class CommentsModel {
    enum State: Equatable {
        case loading
        case loaded([CommentRow])
        case failed(String)
    }

    let groupId: String
    /// commentTarget's { type, id, label }.
    let target: JSONValue
    let myMemberId: String?
    private(set) var state: State = .loading
    var draft = ""
    private(set) var busy = false
    private(set) var message: String?

    private let userId: String
    private let data: DataLayer
    private let core: BudgeerCore
    private let now: @Sendable () -> Date

    init(groupId: String, target: JSONValue, myMemberId: String?, userId: String, data: DataLayer,
         core: BudgeerCore = .shared, now: @escaping @Sendable () -> Date = { Date() }) {
        self.groupId = groupId
        self.target = target
        self.myMemberId = myMemberId
        self.userId = userId
        self.data = data
        self.core = core
        self.now = now
    }

    var targetId: String { target["id"]?.stringValue ?? "" }
    /// The item's name (the page's subtitle).
    var label: String { target["label"]?.stringValue ?? "" }

    func load() async {
        do {
            let rows = try await data.groups.groupComments(groupId: groupId, targetId: targetId)
            let date = try JSONValue.from(JSDate(now()))
            state = .loaded(try (rows.arrayValue ?? []).map { row -> CommentRow in
                try core.call("groupFormat", "commentParts", [row, JSONValue.string(userId), date])
            })
        } catch {
            if case .loaded = state { return }
            state = .failed(UserMessage.of(error, core: core))
        }
    }

    func send() async {
        let body = draft.trimmingCharacters(in: .whitespacesAndNewlines)
        guard let me = myMemberId, !body.isEmpty else { return }
        busy = true
        defer { busy = false }
        do {
            try await data.groups.addComment(groupId: groupId, targetType: target["type"]?.stringValue ?? "expense",
                                             targetId: targetId, authorMemberId: me, body: body)
            draft = ""
            message = nil
            await load()
        } catch {
            message = UserMessage.of(error, core: core)
        }
    }

    func delete(_ id: String) async {
        busy = true
        defer { busy = false }
        do {
            try await data.groups.deleteComment(id: id)
            await load()
        } catch {
            message = UserMessage.of(error, core: core)
        }
    }
}
