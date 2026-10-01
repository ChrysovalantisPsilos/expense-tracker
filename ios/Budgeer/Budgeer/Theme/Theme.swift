// Budgeer's colour tokens, from the web's palette: the raw ramps the app
// draws with (src/shared/ui/palette.js) and the semantic tokens of
// src/app/theme.js (light and dark). A value here should trace to one there.
import SwiftUI
import UIKit

enum Theme {
    // MARK: Raw ramps (palette.js `colors`)

    enum Palette {
        static let brand300 = Color(hex: 0xFFA088)
        static let brand500 = Color(hex: 0xF95D38) // the mark, charts
        static let amber200 = Color(hex: 0xFDDF8A)
        static let amber400 = Color(hex: 0xFBB324)
        /// theme.js chart.6, the salary chart's 13th month and its series 5.
        static let chart6 = Color(hex: 0xC2703D)
    }

    // MARK: Semantic tokens (theme.js `semanticTokens`), light | dark

    enum Colors {
        static let canvas = dynamic(0xFAF8F4, 0x1A1714)          // bg.canvas
        static let surface = dynamic(0xFFFFFF, 0x232019)         // bg.surface
        static let subtle = dynamic(0xF3EFE7, 0x2B271F)          // bg.subtle
        static let textMuted = dynamic(0x6F634F, 0xB8AB94)       // text.muted (ACCESSIBLE.muted | sand.400)
        static let accentFg = dynamic(0xC9381A, 0xFFA088)        // accent.fg (ACCESSIBLE.text | brand.300)
        static let accentSolid = dynamic(0xD63D1A, 0xD63D1A)     // accent.solid (white text on it, both modes)
        static let accentSubtle = Color(uiColor: UIColor { $0.userInterfaceStyle == .dark
            ? UIColor(red: 249 / 255, green: 93 / 255, blue: 56 / 255, alpha: 0.18) : UIColor(hex: 0xFFE3DB) })
        static let positive = dynamic(0x2F7A45, 0x86C98A)        // status.positive
        static let negative = dynamic(0xC2372B, 0xF2917F)        // status.negative (red.500 | red.200)
        static let warning = dynamic(0xB45709, 0xFBB324)         // status.warning (amber.700 | amber.400)
        static let trendRest = dynamic(0xFFE3DB, 0x7C6F59)       // TrendBars' other months (brand.100 | sand.600)
        static let chart7 = dynamic(0x7C6F59, 0xB8AB94)          // chart.7 (sand.600 | sand.400): a bonus, indexation
    }

    // MARK: Share swatches (kitMath.shareSwatch's tokens)

    private static let swatches: [String: Color] = [
        "brand.500": Palette.brand500, "amber.400": Palette.amber400, "brand.300": Palette.brand300,
        "amber.600": Color(hex: 0xD97A06), "chart.5": Color(hex: 0xF6C453), "chart.6": Palette.chart6,
        "chart.3": Color(hex: 0xEF8A5A), "text.muted": Colors.textMuted,
    ]

    /// A spending share's colour by its kitMath.shareSwatch token (the coral for an unknown one).
    static func swatch(_ token: String) -> Color {
        swatches[token] ?? Palette.brand500
    }

    // MARK: Helpers

    private static func dynamic(_ light: UInt32, _ dark: UInt32) -> Color {
        Color(uiColor: UIColor { traits in
            traits.userInterfaceStyle == .dark ? UIColor(hex: dark) : UIColor(hex: light)
        })
    }
}

extension Color {
    init(hex: UInt32) {
        self.init(uiColor: UIColor(hex: hex))
    }

    /// "#RRGGBB" or "#RRGGBBAA" (a category's tint from the core); nil for
    /// anything else.
    init?(hexString: String) {
        var text = hexString
        if text.hasPrefix("#") { text.removeFirst() }
        guard text.count == 6 || text.count == 8, let value = UInt64(text, radix: 16) else { return nil }
        let rgba = text.count == 6 ? (value << 8) | 0xFF : value
        self.init(.sRGB,
                  red: Double((rgba >> 24) & 0xFF) / 255,
                  green: Double((rgba >> 16) & 0xFF) / 255,
                  blue: Double((rgba >> 8) & 0xFF) / 255,
                  opacity: Double(rgba & 0xFF) / 255)
    }
}

extension UIColor {
    convenience init(hex: UInt32) {
        self.init(
            red: CGFloat((hex >> 16) & 0xFF) / 255,
            green: CGFloat((hex >> 8) & 0xFF) / 255,
            blue: CGFloat(hex & 0xFF) / 255,
            alpha: 1)
    }
}
