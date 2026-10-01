// Joining a group from an invite link, after the web's JoinGroup: the link
// (opened as budgeer://join/<token>, or pasted on the Groups tab's "Join with
// a link") is read for its token (groupFormat.inviteToken), the group shown
// from preview_link_invite (joinParts: the name, the picture, the members),
// then Accept & join (join_via_link) or Decline. Someone already in the
// group goes straight to it. Every word is the web's; the server's refusals
// (an expired link, the shared demo account, too many joins) come through
// errors.userMessage as on the web.
import Foundation
import Observation
import BudgeerCore

/// A join link opened from outside the app, waiting for the signed-in frame
/// to show it (it arrives before sign-in too).
@MainActor
@Observable
final class JoinInbox {
    var token: String?

    /// A URL the app was opened with: its invite token, when it holds one.
    func open(_ url: URL, core: BudgeerCore = .shared) -> Bool {
        guard let found: String = try? core.call("groupFormat", "inviteToken", [url.absoluteString]) else { return false }
        token = found
        return true
    }
}

/// joinParts' 'joinable' answer.
struct JoinPreview: Decodable, Equatable, Sendable {
    let name: String
    let imageUrl: String?
    let colour: CoverColour
    let members: [Avatar]
}

@MainActor
@Observable
final class JoinModel {
    enum State: Equatable {
        /// The link to paste (Join with a link).
        case entering
        case looking
        case joinable(JoinPreview)
        /// The link is no good: why.
        case invalid(String)
        /// In the group (joined, or already a member): its id.
        case joined(String)
    }

    /// What was typed or pasted.
    var text = ""
    private(set) var state: State
    /// Why the link can't be looked up, or why joining failed.
    private(set) var problem: String?
    private(set) var busy = false
    private var token: String?

    private let data: DataLayer
    private let core: BudgeerCore

    /// `token`: a link opened from outside (looked up at once); nil for the paste field.
    init(token: String?, data: DataLayer, core: BudgeerCore = .shared) {
        self.data = data
        self.core = core
        self.token = token
        state = token == nil ? .entering : .looking
    }

    /// The link opened from outside, looked up.
    func load() async {
        guard state == .looking, let token else { return }
        await preview(token)
    }

    /// Continue: the token in what was pasted, else why not.
    func look() async {
        guard let found: String = try? core.call("groupFormat", "inviteToken", [text]) else {
            problem = core.text("ios:native.join.notLink")
            return
        }
        problem = nil
        token = found
        state = .looking
        await preview(found)
    }

    private func preview(_ token: String) async {
        do {
            let answer = try await data.groups.previewLinkInvite(token: token)
            let parts = try core.json("groupFormat", "joinParts", [answer])
            switch parts["status"]?.stringValue {
            case "open":
                state = .joined(parts["groupId"]?.stringValue ?? "")
            case "joinable":
                state = .joinable(try parts.decode(JoinPreview.self))
            default:
                state = .invalid(core.text("groups:join.unavailable"))
            }
        } catch {
            state = .invalid(UserMessage.of(error, fallback: core.text("groups:join.unavailable"), core: core))
        }
    }

    /// Accept & join: in the group once the server says so.
    func accept() async {
        guard let token, case .joinable = state else { return }
        busy = true
        defer { busy = false }
        do {
            let groupId = try await data.groups.joinViaLink(token: token)
            problem = nil
            state = .joined(groupId)
        } catch {
            problem = [core.text("groups:join.failed"), UserMessage.of(error, core: core)].joined(separator: ". ")
        }
    }

    /// Another link (after an unusable one).
    func again() {
        state = .entering
        problem = nil
    }
}
