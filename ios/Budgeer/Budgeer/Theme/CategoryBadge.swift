// A category's badge, after the web's CategoryBadge: its icon (the web's
// Lucide icon for the category's key, Resources/Icons.xcassets
// "category-<key>") on a sand tile in the accent (income icons in the
// positive tone), or on a tile tinted with the colour the user picked.
// What it shows comes from the core (CategoryLook: the key, the tone, the
// tint); this file only draws the tile.
import SwiftUI
import UIKit

struct CategoryBadge: View {
    let look: CategoryLook
    var size: CGFloat = 32

    var body: some View {
        Image(CategoryBadge.asset(for: look.key))
            .renderingMode(.template)
            .resizable()
            .scaledToFit()
            .frame(width: (size / 2).rounded(), height: (size / 2).rounded())
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

    /// The icon's image set: the key's, or the registry's fallback (categoryIcon's `?? Tag`).
    static func asset(for key: String) -> String {
        let named = "category-\(key)"
        return UIImage(named: named) == nil ? "category-fallback" : named
    }
}

/// A group's share of an expense (Home's bars): the web's people icon on the
/// sand tile.
struct GroupBadge: View {
    var size: CGFloat = 32

    var body: some View {
        IconTile(icon: .users, size: size)
    }
}
