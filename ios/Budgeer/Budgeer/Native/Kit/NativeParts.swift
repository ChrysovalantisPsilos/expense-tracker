// The redesign's small pieces: an inset-grouped section's header with its
// "See all", a progress bar and ring that fill smoothly, a money figure that
// counts up and down, the iOS Settings-style icon tile, a person's circle,
// the bell and avatar of every tab's top-right corner, and the confetti
// burst for a settled group or a month under budget. They draw what they are
// given; every figure and word comes from the core and src/locales.
import SwiftUI

// MARK: Sections

/// An inset-grouped section's header: its title, and "See all" when there is more.
struct NativeSectionHeader<Destination: View>: View {
    let title: String
    let seeAll: String?
    @ViewBuilder var destination: () -> Destination

    var body: some View {
        HStack(alignment: .firstTextBaseline) {
            Text(title)
                .font(.title3.weight(.semibold))
                .foregroundStyle(Color.primary)
            Spacer(minLength: 8)
            if let seeAll {
                NavigationLink {
                    destination()
                } label: {
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

extension NativeSectionHeader where Destination == EmptyView {
    init(title: String) {
        self.init(title: title, seeAll: nil) { EmptyView() }
    }
}

// MARK: Figures

/// A money figure that counts to its new value (the digits roll) when it changes.
struct NativeMoney: View {
    let text: String
    /// The value behind the text, so the roll knows which way to go.
    let value: Int
    var font: Font = NativeStyle.money(40)
    var color: Color = .primary

    var body: some View {
        Text(text)
            .font(font)
            .foregroundStyle(color)
            .monospacedDigit()
            .contentTransition(.numericText(value: Double(value)))
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

/// A ring filled to `fraction`, from the top, clockwise.
struct NativeRing: View {
    let fraction: Double
    var color: Color = NativeStyle.tint
    var lineWidth: CGFloat = 8

    var body: some View {
        ZStack {
            Circle().stroke(Color.primary.opacity(0.08), lineWidth: lineWidth)
            Circle()
                .trim(from: 0, to: min(1, max(0, fraction)))
                .stroke(color, style: StrokeStyle(lineWidth: lineWidth, lineCap: .round))
                .rotationEffect(.degrees(-90))
        }
        .animation(.spring(response: 0.7, dampingFraction: 0.85), value: fraction)
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

/// A person's circle: initials on their colour (avatarLook), the viewer in the accent.
struct NativeAvatar: View {
    let avatar: Avatar
    var size: CGFloat = 32
    var ring: Color? = nil

    var body: some View {
        Text(avatar.initials)
            .font(.system(size: size * 0.38, weight: .semibold))
            .foregroundStyle(avatar.fg == "dark" ? Color(hex: 0x1A202C) : Color.white)
            .frame(width: size, height: size)
            .background(fill, in: Circle())
            .overlay { if let ring { Circle().stroke(ring, lineWidth: 2) } }
            .accessibilityHidden(true)
    }

    private var fill: Color {
        if avatar.highlight { return NativeStyle.solid }
        return avatar.bg.flatMap { Color(hexString: $0) } ?? Color.secondary
    }
}

/// Overlapping circles, as a group's members.
struct NativeAvatarStack: View {
    let avatars: [Avatar]
    var size: CGFloat = 30
    var ring: Color = NativeStyle.card

    var body: some View {
        HStack(spacing: -size * 0.3) {
            ForEach(Array(avatars.enumerated()), id: \.offset) { index, avatar in
                NativeAvatar(avatar: avatar, size: size, ring: ring)
                    .zIndex(Double(avatars.count - index))
            }
        }
    }
}

/// Every tab's top-right corner: the bell (badged when something is unread)
/// and your circle, which opens your profile and settings.
struct NativeAccountItems: ToolbarContent {
    let me: Avatar
    let unread: Bool
    let bellLabel: String
    let profileLabel: String

    var body: some ToolbarContent {
        ToolbarItemGroup(placement: .topBarTrailing) {
            Button {} label: {
                Image(systemName: unread ? "bell.badge" : "bell")
                    .symbolRenderingMode(.palette)
                    .foregroundStyle(NativeStyle.tint, Color.primary)
            }
            .accessibilityLabel(bellLabel)
            Button {} label: {
                NativeAvatar(avatar: me, size: 30)
            }
            .accessibilityLabel(profileLabel)
        }
    }
}

// MARK: Celebration

/// A burst of confetti in the brand's colours, frozen at `progress` (0…1):
/// the app animates it once (a settled group, a month under budget); a
/// picture shows it mid-air.
struct NativeConfetti: View {
    var progress: Double = 0.55
    var pieces = 70

    private static let colors: [Color] = [
        Theme.Palette.brand500, Theme.Palette.amber400, Theme.Palette.brand300,
        Theme.Palette.amber200, Color(hex: 0x2E9B62), Color(hex: 0x3A78D4),
    ]

    var body: some View {
        Canvas { context, size in
            let origin = CGPoint(x: size.width / 2, y: size.height * 0.32)
            for index in 0..<pieces {
                // A fixed spread per piece (no randomness, so a picture is stable).
                let seed = Double((index * 7919) % 997) / 997
                let angle = (Double(index) / Double(pieces)) * 2 * Double.pi + seed
                let speed = 120 + seed * 260
                let t = progress
                let x = origin.x + cos(angle) * speed * t
                let y = origin.y + sin(angle) * speed * t * 0.8 + 260 * t * t
                let spin = Angle.radians(seed * 12 + t * 6)
                var piece = context
                piece.translateBy(x: x, y: y)
                piece.rotate(by: spin)
                piece.opacity = max(0, 1 - t * 0.6)
                let rect = CGRect(x: -4, y: -2.5, width: index % 3 == 0 ? 6 : 9, height: 5)
                let color = NativeConfetti.colors[index % NativeConfetti.colors.count]
                if index % 4 == 0 {
                    piece.fill(Path(ellipseIn: CGRect(x: -3, y: -3, width: 6, height: 6)), with: .color(color))
                } else {
                    piece.fill(Path(roundedRect: rect, cornerRadius: 1.5), with: .color(color))
                }
            }
        }
        .allowsHitTesting(false)
        .accessibilityHidden(true)
    }
}
