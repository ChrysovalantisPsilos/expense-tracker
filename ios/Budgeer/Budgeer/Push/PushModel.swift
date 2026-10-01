// Push notifications on this iPhone: whether iOS allows them, asking at a
// sensible moment (Settings › Notifications' switch, or once after the first
// entry saved — never on launch), registering with APNs and handing the
// device token to the server (save_apns_token, 0108), and forgetting it on
// sign-out (delete_apns_token). What gets sent, and the account's switch
// (profiles.notify_push), are the server's, as for the web's browsers. The
// system side (UserNotifications, UIKit) is behind PushSystem, so this can be
// tested with a fake.
import BudgeerCore
import Foundation
import Observation

/// What iOS says about notifications for this app.
enum PushPermission: Equatable, Sendable {
    case notDetermined
    case allowed
    case denied
}

protocol PushSystem: Sendable {
    func permission() async -> PushPermission
    /// iOS's question (alert, sound, badge); true when allowed.
    func requestPermission() async -> Bool
    /// Registers with APNs; the device token as lowercase hex.
    func register() async throws -> String
}

@MainActor
@Observable
final class PushModel {
    private(set) var permission: PushPermission = .notDetermined
    /// This install's token is on the server (for the signed-in account).
    private(set) var registered = false

    /// Set once iOS's question has been asked from here (it asks only once).
    static let askedKey = "budgeer.push.asked"

    private var token: String?
    private let data: DataLayer
    private let system: PushSystem
    private let environment: String
    private let defaults: UserDefaults
    private let core: BudgeerCore

    init(data: DataLayer, system: PushSystem, environment: String, defaults: UserDefaults = .standard,
         core: BudgeerCore = .shared) {
        self.data = data
        self.system = system
        self.environment = environment
        self.defaults = defaults
        self.core = core
    }

    /// Signed in (and back in the foreground): when iOS already allows
    /// notifications, register again (a token can change) without asking.
    func refresh() async {
        permission = await system.permission()
        if permission == .allowed { _ = await registerDevice() }
    }

    /// Settings' switch turned on: ask iOS if it never was, then register.
    /// False when iOS says no (Settings shows how to allow it) or it failed.
    @discardableResult
    func enable() async -> Bool {
        permission = await system.permission()
        if permission == .notDetermined {
            defaults.set(true, forKey: PushModel.askedKey)
            permission = await system.requestPermission() ? .allowed : .denied
        }
        guard permission == .allowed else { return false }
        return await registerDevice()
    }

    /// After the first entry saved: iOS's question, once per install, and
    /// never on the shared demo login (it can't register a device).
    func askAfterFirstAction() async {
        guard !defaults.bool(forKey: PushModel.askedKey) else { return }
        if let profile = try? await data.profile.profile(),
           (try? core.call("demoAccount", "isDemoAccount", [profile]) as Bool) == true { return }
        guard await system.permission() == .notDetermined else {
            defaults.set(true, forKey: PushModel.askedKey)
            return
        }
        await enable()
    }

    /// Just before signing out: this install no longer gets the account's notifications.
    func forget() async {
        guard let token else { return }
        try? await data.profile.deleteDeviceToken(token)
        self.token = nil
        registered = false
    }

    private func registerDevice() async -> Bool {
        do {
            let fresh = try await system.register()
            try await data.profile.saveDeviceToken(fresh, environment: environment)
            token = fresh
            registered = true
        } catch {
            registered = false
        }
        return registered
    }
}
