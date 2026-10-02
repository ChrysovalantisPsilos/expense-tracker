// What every tab's page carries around its content: the bell and your
// initials in the bar's top-right corner (beside the sidebar, the bell and
// Add), and the confetti burst a settled group or a month that kept every
// budget plays once.
import SwiftUI

/// Every tab's top-right corner: the bell (badged when something is
/// unread) and your picture (or initials), which open your profile and settings.
struct NativeAccountItems: ToolbarContent {
    let initials: String
    var avatar: Avatar? = nil
    /// The unread count's words ("3", "9+"), nil with nothing unread.
    let badge: String?
    let onBell: () -> Void
    let onProfile: () -> Void
    @Environment(AppLanguage.self) private var language

    var body: some ToolbarContent {
        ToolbarItemGroup(placement: .topBarTrailing) {
            NativeBellButton(badge: badge, onBell: onBell)
            Button(action: onProfile) {
                NativeProfileCircle(initials: initials, avatar: avatar, size: 30)
            }
            .accessibilityLabel(language.t("ios:native.profile"))
            .accessibilityIdentifier("bar.profile")
        }
    }
}

/// Beside the sidebar, a page's top-right corner: the bell and Add (your
/// picture is the sidebar's foot). Add does what the page lends it (AddSlot).
struct NativeWideItems: ToolbarContent {
    let badge: String?
    let onBell: () -> Void
    let onAdd: () -> Void
    @Environment(AppLanguage.self) private var language

    var body: some ToolbarContent {
        ToolbarItemGroup(placement: .topBarTrailing) {
            NativeBellButton(badge: badge, onBell: onBell)
            Button(action: onAdd) {
                Label(language.t("ios:native.tabs.add"), systemImage: "plus")
                    .labelStyle(.titleAndIcon)
                    .font(.body.weight(.semibold))
            }
            .buttonStyle(.borderedProminent)
            .buttonBorderShape(.capsule)
            .tint(NativeStyle.solid)
            .accessibilityIdentifier("bar.add")
        }
    }
}

/// The bell, badged when something is unread.
struct NativeBellButton: View {
    /// The unread count's words ("3", "9+"), nil with nothing unread.
    let badge: String?
    let onBell: () -> Void
    @Environment(AppLanguage.self) private var language

    var body: some View {
        Button(action: onBell) {
            Image(systemName: badge == nil ? "bell" : "bell.badge")
                .symbolRenderingMode(.palette)
                .foregroundStyle(NativeStyle.tint, Color.primary)
        }
        .accessibilityLabel(language.t("notifications:bell.title"))
        .accessibilityValue(badge ?? "")
        .accessibilityIdentifier("bar.bell")
    }
}

/// Your circle: the photo, or the initials in the accent.
struct NativeProfileCircle: View {
    let initials: String
    var avatar: Avatar? = nil
    var size: CGFloat = 30

    var body: some View {
        if let avatar {
            NativeAvatar(avatar: avatar, size: size)
        } else {
            Text(initials)
                .font(.system(size: size * 0.4, weight: .semibold))
                .foregroundStyle(Color.white)
                .frame(width: size, height: size)
                .background(NativeStyle.solid, in: Circle())
        }
    }
}

// MARK: Celebration

/// A picture's frozen moment for what plays once (0…1); nil in the app,
/// where it plays.
struct NativeFrozenMotionKey: EnvironmentKey {
    static let defaultValue: Double? = nil
}

extension EnvironmentValues {
    var nativeFrozenMotion: Double? {
        get { self[NativeFrozenMotionKey.self] }
        set { self[NativeFrozenMotionKey.self] = newValue }
    }
}

/// A burst of confetti in the brand's colours that plays once (about two
/// seconds) and clears. Pages draw it behind their cards, so it never
/// covers words; it never takes a touch.
struct NativeConfetti: View {
    var pieces = 90
    @Environment(\.nativeFrozenMotion) private var frozen
    @State private var start = Date()
    @State private var done = false

    private static let length = 1.9
    private static let colors: [Color] = [
        Theme.Palette.brand500, Theme.Palette.amber400, Theme.Palette.brand300,
        Theme.Palette.amber200, Color(hex: 0x2E9B62), Color(hex: 0x3A78D4),
    ]

    var body: some View {
        Group {
            if let frozen {
                burst(frozen)
            } else if !done {
                TimelineView(.animation(minimumInterval: nil, paused: done)) { context in
                    burst(context.date.timeIntervalSince(start) / NativeConfetti.length)
                }
                .task {
                    try? await Task.sleep(nanoseconds: UInt64(NativeConfetti.length * 1_000_000_000))
                    done = true
                }
            }
        }
        .allowsHitTesting(false)
        .accessibilityHidden(true)
    }

    /// The burst `t` of the way through (0…1); nothing after.
    private func burst(_ t: Double) -> some View {
        Canvas { context, size in
            guard t < 1 else { return }
            let origin = CGPoint(x: size.width / 2, y: size.height * 0.22)
            for index in 0..<pieces {
                // A fixed spread per piece (no randomness, so a picture is stable).
                let seed = Double((index * 7919) % 997) / 997
                let angle = (Double(index) / Double(pieces)) * 2 * Double.pi + seed
                let speed = 220 + seed * 380
                let x = origin.x + cos(angle) * speed * t
                let y = origin.y + sin(angle) * speed * t * 0.8 + 320 * t * t
                var piece = context
                piece.translateBy(x: x, y: y)
                piece.rotate(by: .radians(seed * 12 + t * 6))
                piece.opacity = max(0, 1 - t * t)
                let color = NativeConfetti.colors[index % NativeConfetti.colors.count]
                if index % 4 == 0 {
                    piece.fill(Path(ellipseIn: CGRect(x: -3, y: -3, width: 6, height: 6)), with: .color(color))
                } else {
                    let rect = CGRect(x: -4, y: -2.5, width: index % 3 == 0 ? 6 : 9, height: 5)
                    piece.fill(Path(roundedRect: rect, cornerRadius: 1.5), with: .color(color))
                }
            }
        }
    }
}
