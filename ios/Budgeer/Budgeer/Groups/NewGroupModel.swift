// A new group, as one flow: its picture (a photo, or an emoji on a colour,
// sent as an image), its name and currency, and the people to invite, then
// what happens next. Creating it runs the web's steps in order: create_group
// (NewGroupPage), the cover as the owner's upload (groups.js
// uploadGroupImage), each invite as the Members page sends it (GroupInvite)
// and, when asked, a share link (createInviteLink). The group exists once
// create_group answers; a picture or an invite that fails afterwards is
// reported on the done page, never undone. Every check and word is the
// core's.
import Foundation
import Observation
import BudgeerCore

@MainActor
@Observable
final class NewGroupModel {
    /// The picture as an upload: its bytes and type (made by the view).
    struct CoverFile: Equatable, Sendable {
        let data: Data
        let contentType: String
        let ext: String
    }

    /// One invite's answer on the done page.
    struct Sent: Equatable, Identifiable, Sendable {
        let email: String
        let text: String
        let ok: Bool
        var id: String { email }
    }

    /// The group made, and how its extras went.
    struct Done: Equatable, Sendable {
        let id: String
        let name: String
        /// The share link (asked for, or an email that couldn't go).
        let link: String?
        let sent: [Sent]
        /// Why the picture didn't go up, or nil.
        let photoProblem: String?
    }

    var name = ""
    /// The currency picked ("" until the profile's base currency is in).
    var currency = ""
    /// The address being typed, and why it can't be added (nil when fine).
    var emailText = ""
    private(set) var emailProblem: String?
    /// The addresses to invite, in the order added.
    private(set) var emails: [String] = []
    /// Also make a share link once the group exists.
    var shareLink = false
    private(set) var busy = false
    /// What stopped the group being created.
    private(set) var message: String?
    private(set) var done: Done?

    private let data: DataLayer
    private let core: BudgeerCore
    /// The site invite links open on (dev.budgeer.com or www.budgeer.com).
    private let site: String

    init(data: DataLayer, site: String, core: BudgeerCore = .shared) {
        self.data = data
        self.site = site
        self.core = core
    }

    /// The currencies a group can be in (CurrencySelect).
    var currencyOptions: [String] {
        (try? core.call("currency", "currencyCodes", [JSONValue.null])) ?? [currency]
    }

    var canCreate: Bool {
        !busy && !name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && !currency.isEmpty
    }

    /// The group starts in the user's base currency (NewGroupPage).
    func load() async {
        guard currency.isEmpty else { return }
        let profile = try? await data.profile.profile()
        currency = profile?["base_currency"]?.stringValue ?? "EUR"
    }

    /// Add the typed address to the invites (formChecks.emailError): false,
    /// with the reason, when it isn't one; an address already in is kept once.
    @discardableResult
    func addEmail() -> Bool {
        let address = emailText.trimmingCharacters(in: .whitespacesAndNewlines)
        if let problem: String = try? core.call("formChecks", "emailError", [address]) {
            emailProblem = problem
            return false
        }
        if !emails.contains(where: { $0.caseInsensitiveCompare(address) == .orderedSame }) { emails.append(address) }
        emailText = ""
        emailProblem = nil
        return true
    }

    func removeEmail(_ address: String) {
        emails.removeAll { $0 == address }
    }

    /// Create the group, then its picture, its invites and its link: true
    /// once the group exists (`done` says how the rest went).
    func create(cover: CoverFile?) async -> Bool {
        let trimmed = name.trimmingCharacters(in: .whitespacesAndNewlines)
        guard canCreate else { return false }
        // An address typed but not added yet goes too, when it is one.
        if !emailText.trimmingCharacters(in: .whitespaces).isEmpty, !addEmail() { return false }
        busy = true
        defer { busy = false }
        let id: String
        do {
            id = try await data.groups.createGroup(name: trimmed, currency: currency)
        } catch {
            message = UserMessage.of(error, core: core)
            return false
        }
        message = nil
        var photoProblem: String?
        if let cover {
            do {
                _ = try await data.groups.uploadGroupImage(groupId: id, data: cover.data, contentType: cover.contentType,
                                                           ext: cover.ext)
            } catch {
                photoProblem = UserMessage.of(error, fallback: core.text("groups:header.photoFailed"), core: core)
            }
        }
        var sent: [Sent] = []
        var link: String?
        for address in emails {
            let outcome = await GroupInvite.send(address, groupId: id, site: site, data: data, core: core)
            sent.append(Sent(email: address, text: outcome.message, ok: outcome.sent))
            if let fallback = outcome.link { link = fallback }
        }
        if shareLink {
            do {
                let token = try await data.groups.createInvite(groupId: id, email: nil)
                link = try core.call("groupFormat", "inviteLink", [site, token])
            } catch {
                sent.append(Sent(email: core.text("groups:members.invite.copyLink"),
                                 text: UserMessage.of(error, fallback: core.text("groups:members.inviteFailed"), core: core),
                                 ok: false))
            }
        }
        done = Done(id: id, name: trimmed, link: link, sent: sent, photoProblem: photoProblem)
        return true
    }

    /// "What happens next", in order (the ios namespace's steps).
    var nextSteps: [String] {
        var steps = [core.text("ios:native.newGroup.next.create", ["currency": .string(currency)])]
        if emails.isEmpty {
            steps.append(core.text("ios:native.newGroup.next.noInvites"))
        } else {
            steps.append(core.text("ios:native.newGroup.next.invites", ["count": .int(emails.count)]))
        }
        if shareLink { steps.append(core.text("ios:native.newGroup.next.link")) }
        steps.append(core.text("ios:native.newGroup.next.expense"))
        return steps
    }
}
