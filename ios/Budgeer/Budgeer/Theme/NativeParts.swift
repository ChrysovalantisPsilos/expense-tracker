// The native kit's small pieces: an inset-grouped section's header with
// its "See all", a progress bar that fills smoothly, a money figure that
// counts up and down, the iOS Settings-style icon tile, a person's circle
// and a stack of them, and the states a page shows before its figures (a
// spinner, a failed read with Try again, an empty line). They draw what
// they are given; every figure and word comes from the core and src/locales.
import SwiftUI

// MARK: Sections

/// An inset-grouped section's header: its title, and "See all" (a pushed
/// page) when there is more.
struct NativeSectionHeader: View {
    let title: String
    var seeAll: String? = nil
    var route: AppRoute? = nil

    var body: some View {
        HStack(alignment: .firstTextBaseline) {
            Text(title)
                .font(.title3.weight(.semibold))
                .foregroundStyle(Color.primary)
            Spacer(minLength: 8)
            if let seeAll, let route {
                NavigationLink(value: route) {
                    Text(seeAll).font(.subheadline)
                }
                .foregroundStyle(NativeStyle.tint)
            }
        }
        .textCase(nil)
        .padding(.horizontal, -4)
        .padding(.bottom, 2)
    }
}

/// A plain section header in small capitals, Greek without its tonos (capsLabel).
struct NativeCapsHeader: View {
    let title: String

    var body: some View {
        Text(title.capsLabel).textCase(nil)
    }
}

// MARK: Figures

/// A money figure that counts to its new value (the digits roll) when it changes.
struct NativeMoney: View {
    let text: String
    /// The value behind the text, so the roll knows which way to go.
    let value: Double
    var font: Font = NativeStyle.money(40)
    var color: Color = .primary

    var body: some View {
        Text(text)
            .font(font)
            .foregroundStyle(color)
            .monospacedDigit()
            .contentTransition(.numericText(value: value))
            .animation(.snappy, value: value)
            .lineLimit(1)
            .minimumScaleFactor(0.6)
    }
}

/// A rounded bar filled to `fraction` (0…1, clamped), easing to a new value.
struct NativeBar: View {
    let fraction: Double
    var color: Color = NativeStyle.tint
    var height: CGFloat = 6

    var body: some View {
        GeometryReader { proxy in
            ZStack(alignment: .leading) {
                Capsule().fill(Color.primary.opacity(0.08))
                Capsule()
                    .fill(color)
                    .frame(width: max(height, proxy.size.width * min(1, max(0, fraction))))
            }
        }
        .frame(height: height)
        .animation(.spring(response: 0.6, dampingFraction: 0.85), value: fraction)
        .accessibilityHidden(true)
    }
}

// MARK: Icons and people

/// The iOS Settings tile: a white SF Symbol on a rounded square of colour.
struct NativeIconTile: View {
    let symbol: String
    let color: Color
    var size: CGFloat = 30

    var body: some View {
        Image(systemName: symbol)
            .font(.system(size: size * 0.5, weight: .semibold))
            .foregroundStyle(Color.white)
            .frame(width: size, height: size)
            .background(color, in: RoundedRectangle(cornerRadius: size * 0.24, style: .continuous))
            .accessibilityHidden(true)
    }
}

/// A person's circle: their photo, or the initials on their colour
/// (avatarLook), the viewer in the accent.
struct NativeAvatar: View {
    let avatar: Avatar
    var size: CGFloat = 32
    var ring: Color? = nil

    var body: some View {
        ZStack {
            Circle().fill(fill)
            Text(avatar.initials)
                .font(.system(size: size * 0.38, weight: .semibold))
                .foregroundStyle(avatar.fg == "dark" ? Color(hex: 0x1A202C) : Color.white)
            if let src = avatar.src, let url = URL(string: src) {
                AsyncImage(url: url) { image in
                    image.resizable().scaledToFill()
                } placeholder: {
                    Color.clear
                }
                .clipShape(Circle())
            }
        }
        .frame(width: size, height: size)
        .overlay { if let ring { Circle().stroke(ring, lineWidth: 2) } }
        .accessibilityHidden(true)
    }

    private var fill: Color {
        if avatar.highlight { return NativeStyle.solid }
        return avatar.bg.flatMap { Color(hexString: $0) } ?? Color.secondary
    }
}

/// Overlapping circles (avatarStackParts: four at most, then "+N").
struct NativeAvatarStack: View {
    let stack: AvatarStackParts
    var size: CGFloat = 30
    var ring: Color = NativeStyle.card

    var body: some View {
        HStack(spacing: -size * 0.22) {
            ForEach(Array(stack.shown.enumerated()), id: \.offset) { index, avatar in
                NativeAvatar(avatar: avatar, size: size, ring: ring)
                    .zIndex(Double(stack.shown.count - index))
            }
            if stack.overflow > 0 {
                Text(verbatim: "+\(stack.overflow)")
                    .font(.system(size: size * 0.34, weight: .bold))
                    .foregroundStyle(.secondary)
                    .frame(width: size, height: size)
                    .background(Theme.Colors.subtle, in: Circle())
                    .overlay(Circle().stroke(ring, lineWidth: 2))
            }
        }
        .accessibilityHidden(true)
    }
}

// MARK: Floating at the foot

enum NativeFoot {
    /// Room under a page's last card so it scrolls clear of what floats at
    /// the foot (the tab bar, a page's own button or pill).
    static let room: CGFloat = 112
}

extension View {
    /// A button floating at a page's foot: the canvas fades in behind it, so
    /// what scrolls under it never shows through its words.
    func nativeFootBar() -> some View {
        background(alignment: .bottom) {
            LinearGradient(colors: [NativeStyle.canvas.opacity(0), NativeStyle.canvas, NativeStyle.canvas],
                           startPoint: .top, endPoint: .bottom)
                .padding(.top, -28)
                .ignoresSafeArea(edges: .bottom)
                .allowsHitTesting(false)
        }
    }
}

// MARK: States

/// A page's first load.
struct NativeLoading: View {
    var body: some View {
        ProgressView()
            .controlSize(.large)
            .frame(maxWidth: .infinity, minHeight: 160)
    }
}

/// A read that failed: what went wrong, and Try again.
struct NativeFailed: View {
    let message: String
    let retry: () async -> Void
    @Environment(AppLanguage.self) private var language

    var body: some View {
        VStack(spacing: 12) {
            Image(systemName: "wifi.exclamationmark")
                .font(.system(size: 32))
                .foregroundStyle(.secondary)
            Text(message)
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
            Button(language.t("common:actions.retry")) { Task { await retry() } }
                .nativeGlassButton()
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 32)
    }
}

/// A message over a page (saved, removed, a refusal), in the tint or the warning tone.
struct NativeNotice: View {
    let text: String
    var warning = false

    var body: some View {
        Label {
            Text(text).font(.subheadline)
        } icon: {
            Image(systemName: warning ? "exclamationmark.triangle.fill" : "checkmark.circle.fill")
                .foregroundStyle(warning ? NativeStyle.warning : NativeStyle.positive)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

/// Words with <b> as rich text (translate.parseRich's nodes): one Text, <b> in bold.
enum NativeRich {
    static func text(_ nodes: JSONValue, bold: Bool = false) -> Text {
        (nodes.arrayValue ?? []).reduce(Text(verbatim: "")) { line, node in
            if let plain = node.stringValue {
                return line + Text(plain).fontWeight(bold ? .bold : .regular)
            }
            return line + text(node["children"] ?? [], bold: bold || node["tag"]?.stringValue == "b")
        }
    }
}
