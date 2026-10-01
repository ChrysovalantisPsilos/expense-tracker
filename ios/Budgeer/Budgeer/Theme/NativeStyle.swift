// The native redesign's look: the brand's coral as the tint, the sand canvas
// behind iOS's inset-grouped sections, Poppins for large titles and big money
// figures (Manrope for Greek titles, as the web's heading stack falls back),
// and the system font (SF Pro, Dynamic Type) for everything else. Values
// trace to Theme (palette.js / theme.js); nothing here is a new colour.
import SwiftUI
import UIKit

enum NativeStyle {
    /// The tint: coral, a step lighter in dark mode so it reads on the dark canvas.
    static let tint = Color(uiColor: UIColor { $0.userInterfaceStyle == .dark
        ? UIColor(hex: 0xFF7A5A) : UIColor(hex: 0xE2431F) })
    /// A filled control's colour (white text on it in both modes).
    static let solid = Theme.Colors.accentSolid
    /// The page behind the sections (bg.canvas).
    static let canvas = Theme.Colors.canvas
    /// A section's rows (bg.surface).
    static let card = Theme.Colors.surface
    static let positive = Theme.Colors.positive
    static let negative = Theme.Colors.negative
    static let warning = Theme.Colors.warning
    static let amber = Theme.Palette.amber400
    static let coral = Theme.Palette.brand500

    /// A kitMath / budgetMath tone name as a colour (nil: the tint; muted: secondary).
    static func tone(_ tone: String?) -> Color {
        switch tone {
        case "negative": return negative
        case "warning": return warning
        case "positive": return positive
        case "muted": return Color.secondary
        default: return tint
        }
    }

    // MARK: Type

    /// A big money figure: Poppins, scaled with Dynamic Type from `style`.
    static func money(_ size: CGFloat, relativeTo style: Font.TextStyle = .largeTitle) -> Font {
        .custom("Poppins-SemiBold", size: size, relativeTo: style)
    }

    /// A title in the brand's heading face (Poppins; Manrope carries Greek).
    static func title(_ size: CGFloat, lang: String, relativeTo style: Font.TextStyle = .title) -> Font {
        .custom(lang == "el" ? "Manrope-Bold" : "Poppins-Bold", size: size, relativeTo: style)
    }
}
