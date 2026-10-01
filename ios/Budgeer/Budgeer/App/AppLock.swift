// The optional Face ID lock (Settings › Face ID lock, off by default, kept
// on this device): when on, the app opens locked and locks again after a
// minute away; it unlocks with the device owner's check (Face ID, Touch ID,
// or the passcode when those fail or aren't set up). Turning it on asks for
// the check first, so no one locks themselves out of their own app.
import Foundation
import LocalAuthentication
import Observation
import SwiftUI

/// The device owner's check (LocalAuthentication), behind a seam for tests.
protocol OwnerCheck {
    /// Whether this device can check its owner at all (a passcode is set).
    var available: Bool { get }
    /// Ask; true when it was the owner.
    func check(reason: String) async -> Bool
}

/// Face ID / Touch ID, falling back to the device passcode.
struct DeviceOwnerCheck: OwnerCheck {
    var available: Bool {
        LAContext().canEvaluatePolicy(.deviceOwnerAuthentication, error: nil)
    }

    func check(reason: String) async -> Bool {
        let context = LAContext()
        return (try? await context.evaluatePolicy(.deviceOwnerAuthentication, localizedReason: reason)) ?? false
    }
}

@MainActor
@Observable
final class AppLock {
    static let key = "budgeer.lock"
    /// How long the app may be away before it locks again.
    static let grace: TimeInterval = 60

    private(set) var enabled: Bool
    private(set) var locked: Bool
    /// The app is not on screen (the switcher shows the lock, not the money).
    private(set) var away = false

    private var leftAt: Date?
    private let defaults: UserDefaults
    private let owner: OwnerCheck
    private let now: () -> Date

    init(defaults: UserDefaults = .standard, owner: OwnerCheck = DeviceOwnerCheck(), now: @escaping () -> Date = { Date() }) {
        self.defaults = defaults
        self.owner = owner
        self.now = now
        enabled = defaults.bool(forKey: AppLock.key)
        locked = defaults.bool(forKey: AppLock.key)
    }

    /// Whether the switch can be turned on here.
    var available: Bool { owner.available }

    /// Whether the lock covers the app now.
    var covers: Bool { enabled && (locked || away) }

    /// The switch: on after the owner's check, off at once.
    func set(_ on: Bool, reason: String) async {
        if on {
            guard await owner.check(reason: reason) else { return }
        }
        enabled = on
        defaults.set(on, forKey: AppLock.key)
        if !on { locked = false }
    }

    /// The app left the screen.
    func wentAway() {
        away = true
        leftAt = now()
    }

    /// The app is back: locked when it was away for longer than the grace.
    func cameBack() {
        away = false
        if enabled, let leftAt, now().timeIntervalSince(leftAt) >= AppLock.grace { locked = true }
        leftAt = nil
    }

    /// Unlock with the owner's check.
    func unlock(reason: String) async {
        if await owner.check(reason: reason) { locked = false }
    }
}

/// The lock's screen: the mark, "Budgeer is locked", and Unlock in glass
/// (it asks at once when it appears, as banking apps do).
@MainActor
struct LockView: View {
    let lock: AppLock
    @Environment(AppLanguage.self) private var language
    @State private var tries = 0

    var body: some View {
        ZStack {
            LinearGradient(colors: [Theme.Colors.accentSubtle, NativeStyle.canvas], startPoint: .top, endPoint: .center)
                .ignoresSafeArea()
            VStack(spacing: 14) {
                Spacer()
                BrandMark(size: 64)
                    .frame(width: 104, height: 104)
                    .background(NativeStyle.card, in: RoundedRectangle(cornerRadius: 26, style: .continuous))
                    .shadow(color: Color.black.opacity(0.08), radius: 20, x: 0, y: 10)
                Text(language.t("ios:native.lock.locked"))
                    .font(NativeStyle.title(26, lang: language.current))
                    .multilineTextAlignment(.center)
                    .padding(.top, 12)
                Text(language.t("ios:native.lock.note"))
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
                Spacer()
                Image(systemName: "faceid")
                    .font(.system(size: 58, weight: .light))
                    .foregroundStyle(NativeStyle.tint)
                    .padding(.bottom, 12)
                    .accessibilityHidden(true)
                if lock.locked {
                    Button {
                        tries += 1
                    } label: {
                        Text(language.t("ios:native.lock.unlock")).frame(maxWidth: .infinity)
                    }
                    .nativeGlassButton(prominent: true)
                    .accessibilityIdentifier("lock.unlock")
                }
            }
            .padding(.horizontal, 32)
            .padding(.bottom, 24)
        }
        .task(id: tries) {
            guard lock.locked else { return }
            await lock.unlock(reason: language.t("ios:native.lock.reason"))
        }
        .sensoryFeedback(.success, trigger: lock.locked) { was, now in was && !now }
    }
}
