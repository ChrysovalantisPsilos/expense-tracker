// Settings › Security, after the web's SecuritySettings: how this account
// signs in (email & password, Google, Apple; authMethods.signInMethods),
// Connect or Disconnect Google and Apple (never the last way in:
// disconnectBlock), change
// the password or set a first one (newPasswordError), then deleting the
// account (deleteAccountCheck: the password, or a recent sign-in and
// DELETE typed; the delete-account edge function). Connecting, disconnecting
// and deleting without a password need a sign-in in the last ten minutes
// (reauth.isRecentClaims), as on the web; "Log in again" signs out so the
// next sign-in is fresh. Then the passkeys, as the web's PasskeysCard
// (authMethods.passkeyRows): Add (the system's sheet, after a recent
// sign-in) and Remove; the same passkeys the website lists, hidden when the
// server's list fails (passkeys off).
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

/// One passkey (authMethods.passkeyRows): its name and when it was added.
struct PasskeyRow: Decodable, Equatable, Identifiable {
    let id: String
    let name: String
    let meta: String?
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
    /// Why each provider ('google', 'apple') can't be disconnected now
    /// (disconnectBlock); a provider missing here can be.
    private(set) var blocks: [String: String] = [:]
    /// Whether the account has a password to change (authMethods.hasPassword).
    private(set) var hasPassword = false
    /// Whether this session signed in within the last few minutes.
    private(set) var recent = false
    /// The account's passkeys; nil hides them (the server's list failed: passkeys are off).
    private(set) var passkeys: [PasskeyRow]?
    private(set) var busy = false
    private(set) var message: String?
    private(set) var warning = false

    // Change the password (current, new, again), or set a first one (new, again).
    var current = ""
    var next = ""
    var confirm = ""
    /// "Set a password" was tapped on a Google- or Apple-only account.
    var settingFirst = false
    /// Delete account: the password or DELETE, as typed.
    var deleteValue = ""

    private var user: JSONValue = [:]
    private var identities: JSONValue = .null
    /// The server's passkey list (either shape), null when it can't be read.
    private var passkeyList: JSONValue = .null
    private let data: DataLayer
    private let security: AccountSecurity
    private let sheet: PasskeySheet
    private let signOut: @MainActor () async -> Void
    private let core: BudgeerCore
    private let now: @Sendable () -> Date

    init(data: DataLayer, security: AccountSecurity, signOut: @escaping @MainActor () async -> Void,
         sheet: PasskeySheet? = nil, core: BudgeerCore = .shared, now: @escaping @Sendable () -> Date = { Date() }) {
        self.data = data
        self.security = security
        self.sheet = sheet ?? PasskeyAuthorizer()
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
            passkeyList = (try? await security.passkeys()) ?? .null
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

    // MARK: Google and Apple

    /// Whether a provider may be connected now: a sign-in in the last few
    /// minutes (else the reason is said and nothing opens).
    func mayConnect() async -> Bool {
        await checkRecent()
        if !recent { say(reauthText ?? "", warning: true) }
        return recent
    }

    /// Google's first half: where its consent starts, nil (with the reason
    /// said) when a fresh sign-in is needed first or it can't start.
    func googleLinkURL() async -> URL? {
        guard await mayConnect() else { return nil }
        do {
            return try await security.googleLinkURL()
        } catch {
            say(linkMessage(error, fallback: nil, provider: "google"), warning: true)
            return nil
        }
    }

    /// The provider's sheet failed (not closed by you): nothing was connected.
    func linkFailed(_ provider: String) {
        say(core.text("settings:signIn.\(provider).notLinked"), warning: true)
    }

    /// Google's second half: its answer, then how it went.
    func finishLink(_ callback: URL) async {
        do {
            try await security.finishLink(callback)
            await linked("google")
        } catch {
            say(linkMessage(error, fallback: nil, provider: "google"), warning: true)
        }
    }

    /// Apple's sheet answered: its token linked to this account, then how it went.
    func connectApple(_ credential: AppleCredential) async {
        busy = true
        defer { busy = false }
        do {
            try await security.linkApple(credential)
            await linked("apple")
        } catch {
            say(linkMessage(error, fallback: nil, provider: "apple"), warning: true)
        }
    }

    private func linked(_ provider: String) async {
        await reloadUser()
        let done = (identities.arrayValue ?? []).contains { $0["provider"]?.stringValue == provider }
        say(core.text("settings:signIn.\(provider).\(done ? "linkedBody" : "notLinked")"), warning: !done)
    }

    func disconnect(_ provider: String) async {
        await checkRecent()
        guard recent else { return say(reauthText ?? "", warning: true) }
        busy = true
        defer { busy = false }
        do {
            try await security.unlink(provider: provider)
            say(core.text("settings:signIn.\(provider).disconnected"))
            await reloadUser()
        } catch {
            say(linkMessage(error, fallback: core.text("settings:signIn.\(provider).stillConnected"), provider: provider),
                warning: true)
        }
    }

    /// authMethods.linkErrorMessage: our words for a failed link, never Google's or Apple's.
    private func linkMessage(_ error: Error, fallback: String?, provider: String) -> String {
        var shape: JSONValue = ["message": .string(String(describing: error))]
        if let server = error as? ServerError { shape = ["code": server.code.json, "message": .string(server.message)] }
        return (try? core.call("authMethods", "linkErrorMessage", [shape, fallback.json, JSONValue.string(provider)]))
            ?? core.text("settings:signIn.\(provider).linkFallback")
    }

    // MARK: Passkeys

    /// Add: a passkey made on this iPhone (or a device beside it), for this account.
    func addPasskey() async {
        busy = true
        defer { busy = false }
        switch await security.addPasskey(sheet: sheet, core: core, now: now()) {
        case .added:
            say(core.text("settings:passkeys.added"))
            await reloadPasskeys()
        case .cancelled:
            break
        case .failed(let why):
            say(why, warning: true)
        }
    }

    func removePasskey(_ id: String) async {
        busy = true
        defer { busy = false }
        do {
            try await security.removePasskey(id: id)
            await reloadPasskeys()
        } catch {
            say(UserMessage.of(error, fallback: core.text("settings:passkeys.removeFailed"), core: core), warning: true)
        }
    }

    private func reloadPasskeys() async {
        passkeyList = (try? await security.passkeys()) ?? .null
        figure()
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

    /// The methods, the providers' blocks and the password, from the user and its identities.
    private func figure() {
        let list = passkeyList.isNull ? JSONValue.null : ((try? core.json("authMethods", "toPasskeyList", [passkeyList])) ?? .null)
        let args: JSONValue = ["user": user, "identities": identities, "passkeys": list]
        methods = (try? core.call("authMethods", "signInMethods", [args])) ?? []
        if list.isNull {
            passkeys = nil
        } else {
            let rows: [PasskeyRow]? = try? core.call("authMethods", "passkeyRows", [list])
            passkeys = rows ?? []
        }
        blocks = [:]
        // The providers' rows sit between the password's and the passkeys' (authMethods.PROVIDERS).
        for provider in methods.map(\.key) where provider != "password" && provider != "passkeys" {
            let input: JSONValue = ["user": user, "identities": identities, "provider": .string(provider)]
            if let block = (try? core.json("authMethods", "disconnectBlock", [input]))?.stringValue { blocks[provider] = block }
        }
        hasPassword = (try? core.call("authMethods", "hasPassword", [user])) ?? false
    }

    private func say(_ text: String, warning: Bool = false) {
        message = text
        self.warning = warning
    }
}
