// Settings › Security, after the web's SecuritySettings: how this account
// signs in (email & password, Google; authMethods.signInMethods), Connect or
// Disconnect Google (never the last way in: googleDisconnectBlock), change
// the password or set a first one (newPasswordError), then deleting the
// account (deleteAccountCheck: the password, or a recent sign-in and
// DELETE typed; the delete-account edge function). Connecting, disconnecting
// and deleting without a password need a sign-in in the last ten minutes
// (reauth.isRecentClaims), as on the web; "Log in again" signs out so the
// next sign-in is fresh. Passkeys are the web's alone (this app can't make
// them), so they are not listed, as on a browser without them.
import Foundation
import Observation
import BudgeerCore

/// One row of "Sign-in methods" (authMethods.signInMethods).
struct SignInMethodRow: Decodable, Equatable, Identifiable {
    let key: String
    let label: String
    let connected: Bool
    let detail: String
    var id: String { key }
}

/// deleteAccountCheck: what deleting the account asks for, and whether Delete can be pressed.
struct DeleteCheck: Decodable, Equatable {
    let password: Bool
    let needsReauth: Bool
    let canSubmit: Bool
    let label: String
    let placeholder: String
}

@MainActor
@Observable
final class SecurityModel {
    enum State: Equatable {
        case loading
        case loaded
        case failed(String)
    }

    private(set) var state: State = .loading
    private(set) var isDemo = false
    private(set) var methods: [SignInMethodRow] = []
    /// Why Google can't be disconnected now (googleDisconnectBlock), nil when it can.
    private(set) var googleBlock: String?
    /// Whether the account has a password to change (authMethods.hasPassword).
    private(set) var hasPassword = false
    /// Whether this session signed in within the last few minutes.
    private(set) var recent = false
    private(set) var busy = false
    private(set) var message: String?
    private(set) var warning = false

    // Change the password (current, new, again), or set a first one (new, again).
    var current = ""
    var next = ""
    var confirm = ""
    /// "Set a password" was tapped on a Google-only account.
    var settingFirst = false
    /// Delete account: the password or DELETE, as typed.
    var deleteValue = ""

    private var user: JSONValue = [:]
    private var identities: JSONValue = .null
    private let data: DataLayer
    private let security: AccountSecurity
    private let signOut: @MainActor () async -> Void
    private let core: BudgeerCore
    private let now: @Sendable () -> Date

    init(data: DataLayer, security: AccountSecurity, signOut: @escaping @MainActor () async -> Void,
         core: BudgeerCore = .shared, now: @escaping @Sendable () -> Date = { Date() }) {
        self.data = data
        self.security = security
        self.signOut = signOut
        self.core = core
        self.now = now
    }

    func load() async {
        do {
            let profile = try await data.profile.profile()
            isDemo = (try? core.call("demoAccount", "isDemoAccount", [profile])) ?? false
            user = try await security.accountUser()
            identities = (try? await security.identities()) ?? .null
            await checkRecent()
            figure()
            state = .loaded
        } catch {
            if case .loaded = state { return }
            state = .failed(UserMessage.of(error, core: core))
        }
    }

    /// The account's email address.
    var email: String { user["email"]?.stringValue ?? "" }

    /// The sentence over the page when a fresh sign-in is needed
    /// (settings:reauth.passkeyGoogle, or …Delete without a password).
    var reauthText: String? {
        guard !recent else { return nil }
        let withPassword: Bool = (try? core.call("authMethods", "hasPasswordIdentity", [user])) ?? true
        return core.text(withPassword ? "settings:reauth.passkeyGoogle" : "settings:reauth.passkeyGoogleDelete")
    }

    /// Delete account's field and button, for what is typed now.
    var deleteCheck: DeleteCheck? {
        let args: JSONValue = ["user": user, "recent": .bool(recent), "value": .string(deleteValue)]
        guard let check: DeleteCheck = try? core.call("authMethods", "deleteAccountCheck", [args]) else { return nil }
        return check
    }

    /// What deletion erases and what stays (deletionScope): the two lists.
    var deletionScope: (deleted: [String], stays: [String]) {
        let scope = try? core.json("authMethods", "deletionScope", [])
        let lines = { (list: String) -> [String] in (scope?[list]?.arrayValue ?? []).compactMap(\.stringValue) }
        return (lines("deleted"), lines("stays"))
    }

    // MARK: The password

    var canChangePassword: Bool { !current.isEmpty && !next.isEmpty && !confirm.isEmpty && !busy }
    var canSetFirst: Bool { !next.isEmpty && !confirm.isEmpty && !busy }

    func changePassword() async {
        if let problem = passwordProblem("settings:password.mismatch") { return say(problem, warning: true) }
        busy = true
        defer { busy = false }
        do {
            try await security.changePassword(current: current, next: next)
            current = ""
            next = ""
            confirm = ""
            say(core.text("auth:password.updated"))
            await checkRecent()
        } catch is CurrentPasswordInvalid {
            say(core.text("common:errors.auth.currentPasswordInvalid"), warning: true)
        } catch {
            say(UserMessage.of(error, fallback: core.text("settings:password.failed"), core: core), warning: true)
        }
    }

    func setFirstPassword() async {
        if let problem = passwordProblem("auth:password.mismatch") { return say(problem, warning: true) }
        busy = true
        defer { busy = false }
        do {
            try await security.setFirstPassword(next)
            say(core.text("settings:signIn.firstPassword.doneBody", ["email": .string(email)]))
        } catch let error as ServerError where error.code == "current_password_invalid" {
            // It already had one: the change-password form instead.
            try? await security.markPasswordSet()
            say(core.text("settings:signIn.firstPassword.hasOneBody"), warning: true)
        } catch {
            say(UserMessage.of(error, fallback: core.text("settings:signIn.firstPassword.failed"), core: core), warning: true)
            return
        }
        next = ""
        confirm = ""
        settingFirst = false
        await reloadUser()
    }

    private func passwordProblem(_ mismatchKey: String) -> String? {
        (try? core.json("authMethods", "newPasswordError", [JSONValue.string(next), JSONValue.string(confirm),
                                                             JSONValue.string(mismatchKey)]))?.stringValue
    }

    // MARK: Google

    /// Connect's first half: where Google's consent starts, nil (with the
    /// reason said) when a fresh sign-in is needed first or it can't start.
    func googleLinkURL() async -> URL? {
        await checkRecent()
        guard recent else {
            say(reauthText ?? "", warning: true)
            return nil
        }
        do {
            return try await security.googleLinkURL()
        } catch {
            say(linkMessage(error, fallback: nil), warning: true)
            return nil
        }
    }

    /// Google's sheet failed (not closed by you): nothing was connected.
    func linkFailed() {
        say(core.text("settings:signIn.google.notLinked"), warning: true)
    }

    /// Connect's second half: Google's answer, then how it went.
    func finishLink(_ callback: URL) async {
        do {
            try await security.finishLink(callback)
            await reloadUser()
            let linked = (identities.arrayValue ?? []).contains { $0["provider"]?.stringValue == "google" }
            say(core.text(linked ? "settings:signIn.google.linkedBody" : "settings:signIn.google.notLinked"), warning: !linked)
        } catch {
            say(linkMessage(error, fallback: nil), warning: true)
        }
    }

    func disconnectGoogle() async {
        await checkRecent()
        guard recent else { return say(reauthText ?? "", warning: true) }
        busy = true
        defer { busy = false }
        do {
            try await security.unlinkGoogle()
            say(core.text("settings:signIn.google.disconnected"))
            await reloadUser()
        } catch {
            say(linkMessage(error, fallback: core.text("settings:signIn.google.stillConnected")), warning: true)
        }
    }

    /// authMethods.linkErrorMessage: our words for a failed link, never Google's.
    private func linkMessage(_ error: Error, fallback: String?) -> String {
        var shape: JSONValue = ["message": .string(String(describing: error))]
        if let server = error as? ServerError { shape = ["code": server.code.json, "message": .string(server.message)] }
        let args: [Encodable] = fallback.map { [shape, JSONValue.string($0)] } ?? [shape]
        return (try? core.call("authMethods", "linkErrorMessage", args)) ?? core.text("settings:signIn.linkError.fallback")
    }

    // MARK: Deleting the account

    /// Delete: the edge function, then signed out (the app goes back to sign-in).
    @discardableResult
    func deleteAccount() async -> Bool {
        await checkRecent()
        guard let check = deleteCheck, check.canSubmit else { return false }
        busy = true
        defer { busy = false }
        do {
            try await data.privacy.deleteAccount(password: check.password ? deleteValue : nil)
            deleteValue = ""
            await signOut()
            return true
        } catch {
            say(UserMessage.of(error, fallback: core.text("settings:deleteAccount.failed"), core: core), warning: true)
            return false
        }
    }

    /// "Log in again": signed out, so the next sign-in is a fresh one.
    func logInAgain() async {
        await signOut()
    }

    // MARK: Helpers

    private func checkRecent() async {
        guard let claims = await security.tokenClaims() else {
            recent = false
            return
        }
        let ms = (now().timeIntervalSince1970 * 1000).rounded()
        recent = (try? core.call("reauth", "isRecentClaims", [claims, JSONValue.double(ms)])) ?? false
    }

    private func reloadUser() async {
        if let fresh = try? await security.accountUser() { user = fresh }
        identities = (try? await security.identities()) ?? identities
        figure()
    }

    /// The methods, the Google block and the password, from the user and its identities.
    private func figure() {
        let args: JSONValue = ["user": user, "identities": identities, "passkeys": .null]
        methods = (try? core.call("authMethods", "signInMethods", [args])) ?? []
        googleBlock = (try? core.json("authMethods", "googleDisconnectBlock", [["user": user, "identities": identities] as JSONValue]))?
            .stringValue
        hasPassword = (try? core.call("authMethods", "hasPassword", [user])) ?? false
    }

    private func say(_ text: String, warning: Bool = false) {
        message = text
        self.warning = warning
    }
}
