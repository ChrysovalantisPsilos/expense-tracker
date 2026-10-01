// The spending shares' colours by position (kitMath.shareSwatch: coral and
// amber first, "Other" muted), as the web's StackedBar and ShareLegend use
// them; and that stacked bar.
import BudgeerCore
import SwiftUI

enum NativeSwatch {
    /// kitMath.shareSwatch's colour tokens.
    private static let tokens: [String: Color] = [
        "brand.500": Theme.Palette.brand500, "amber.400": Theme.Palette.amber400, "brand.300": Theme.Palette.brand300,
        "amber.600": Color(hex: 0xD97A06), "chart.5": Color(hex: 0xF6C453), "chart.6": Color(hex: 0xC2703D),
        "chart.3": Color(hex: 0xEF8A5A), "text.muted": Theme.Colors.textMuted,
    ]

    /// The colour of the share at `index` named `name`.
    static func color(_ index: Int, _ name: String) -> Color {
        let token: String = (try? BudgeerCore.shared.call("kitMath", "shareSwatch", [index, name])) ?? "brand.500"
        return tokens[token] ?? Theme.Palette.brand500
    }
}

/// Shares side by side in one rounded bar (each a whole percent, adding up to 100).
struct NativeShareBar: View {
    /// (name, percent) in order.
    let shares: [(name: String, share: Int)]

    var body: some View {
        GeometryReader { proxy in
            let gaps = CGFloat(max(0, shares.count - 1)) * 2
            HStack(spacing: 2) {
                ForEach(Array(shares.enumerated()), id: \.offset) { index, item in
                    Rectangle()
                        .fill(NativeSwatch.color(index, item.name))
                        .frame(width: max(2, (proxy.size.width - gaps) * CGFloat(item.share) / 100))
                }
            }
        }
        .frame(height: 12)
        .clipShape(Capsule())
        .accessibilityHidden(true)
    }
}
