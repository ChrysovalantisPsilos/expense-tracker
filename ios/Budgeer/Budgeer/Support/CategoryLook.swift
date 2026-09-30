// How a category's badge looks, as the core answers it
// (categoryStyle.categoryLook, the rule the web's CategoryBadge follows):
// the icon key, the tone of a plain tile's icon, and the tint of a colour the
// user picked. The view (CategoryBadge) only draws it.
import Foundation
import BudgeerCore

struct CategoryTint: Codable, Equatable, Sendable {
    /// The icon's colour, "#RRGGBB".
    let fg: String
    /// The tile's colour, "#RRGGBBAA" (the hue at 16%).
    let bg: String
}

struct CategoryLook: Codable, Equatable, Sendable {
    /// A categoryStyle icon key ('groceries', 'taxi', …; 'other' when unknown).
    let key: String
    /// 'accent' or 'positive' (income).
    let tone: String
    let tint: CategoryTint?

    /// A category row (or nothing, for an uncategorised entry) of `kind`.
    static func of(_ category: JSONValue?, kind: String? = nil, core: BudgeerCore = .shared) throws -> CategoryLook {
        try core.call("categoryStyle", "categoryLook", [category ?? JSONValue.null, kind.map { JSONValue.string($0) } ?? JSONValue.null])
    }
}
