// A category's badge, after the web's CategoryBadge: its icon on a sand tile
// (income icons in the positive tone), or on a tile tinted with the colour
// the user picked. What it shows comes from the core (CategoryLook); this
// file only maps the web's icon keys (shared/lib/icons.jsx, Lucide) to the
// closest SF Symbols and draws the tile.
import SwiftUI

struct CategoryBadge: View {
    let look: CategoryLook
    var size: CGFloat = 32

    var body: some View {
        Image(systemName: CategoryBadge.symbol(for: look.key))
            .font(.system(size: size * 0.46, weight: .semibold))
            .foregroundStyle(foreground)
            .frame(width: size, height: size)
            .background(background)
            .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.lg, style: .continuous))
            .accessibilityHidden(true)
    }

    private var foreground: Color {
        if let tint = look.tint, let color = Color(hexString: tint.fg) { return color }
        return look.tone == "positive" ? Theme.Colors.positive : Theme.Colors.accentFg
    }

    private var background: Color {
        if let tint = look.tint, let color = Color(hexString: tint.bg) { return color }
        return Theme.Colors.subtle
    }

    /// The web's icon key → an SF Symbol (icons.jsx maps the same keys to Lucide).
    static let symbols: [String: String] = [
        "utensils": "fork.knife",
        "groceries": "cart",
        "transport": "car",
        "fuel": "fuelpump",
        "housing": "house",
        "utilities": "lightbulb",
        "shopping": "bag",
        "health": "heart.text.square",
        "entertainment": "film",
        "salary": "wallet.pass",
        "travel": "airplane",
        "coffee": "cup.and.saucer",
        "fitness": "dumbbell",
        "education": "graduationcap",
        "gifts": "gift",
        "savings": "banknote",
        "other": "tag",
        "rent": "key",
        "phone": "iphone",
        "internet": "wifi",
        "insurance": "checkmark.shield",
        "taxes": "building.columns",
        "bank-fees": "percent",
        "streaming": "tv",
        "water": "drop",
        "electricity": "bolt",
        "parking": "parkingsign.circle",
        "bus": "bus",
        "taxi": "car.circle",
        "bike": "bicycle",
        "flights": "airplane.departure",
        "hotel": "bed.double",
        "bars": "wineglass",
        "games": "gamecontroller",
        "music": "music.note",
        "books": "book",
        "sports": "sportscourt",
        "hobbies": "paintpalette",
        "freelance": "laptopcomputer",
        "investments": "chart.line.uptrend.xyaxis",
        "refunds": "arrow.uturn.backward",
        "gifts-received": "heart.circle",
        "cash": "dollarsign.circle",
        "transfer": "arrow.left.arrow.right",
        "business": "briefcase",
        "electronics": "headphones",
    ]

    static func symbol(for key: String) -> String {
        symbols[key] ?? "tag"
    }
}

/// A group's share of an expense (Home's bars): the web's people icon on the
/// sand tile.
struct GroupBadge: View {
    var size: CGFloat = 32

    var body: some View {
        Image(systemName: "person.2")
            .font(.system(size: size * 0.42, weight: .semibold))
            .foregroundStyle(Theme.Colors.accentFg)
            .frame(width: size, height: size)
            .background(Theme.Colors.subtle)
            .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.lg, style: .continuous))
            .accessibilityHidden(true)
    }
}
