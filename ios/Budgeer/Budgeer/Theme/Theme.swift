// Budgeer's design tokens, ported from the web's kit: the raw ramps of
// src/shared/ui/palette.js, the semantic tokens of src/app/theme.js (light
// and dark), its radii and shadows, Chakra's 4pt spacing scale and the type
// stacks (FONTS). Warm and playful: coral accent, amber highlights, sand
// neutrals, rounded cards. A value here should trace to one there.
import SwiftUI
import UIKit

enum Theme {
    // MARK: Raw ramps (palette.js `colors`)

    enum Palette {
        static let brand50 = Color(hex: 0xFFF4F1)
        static let brand100 = Color(hex: 0xFFE3DB)
        static let brand300 = Color(hex: 0xFFA088)
        static let brand400 = Color(hex: 0xFF7A5A)
        static let brand500 = Color(hex: 0xF95D38) // the mark, charts, rings
        static let brand600 = Color(hex: 0xE2431F)
        static let amber50 = Color(hex: 0xFFF8EB)
        static let amber200 = Color(hex: 0xFDDF8A)
        static let amber400 = Color(hex: 0xFBB324)
        static let amber500 = Color(hex: 0xF59E0B)
        static let amber700 = Color(hex: 0xB45709)
        static let sand50 = Color(hex: 0xFAF8F4)
        static let sand100 = Color(hex: 0xF3EFE7)
        static let sand200 = Color(hex: 0xE8E1D5)
        static let sand300 = Color(hex: 0xD6CCBA)
        static let sand400 = Color(hex: 0xB8AB94)
        static let sand500 = Color(hex: 0x9A8B72)
        static let sand600 = Color(hex: 0x7C6F59)
        static let sand700 = Color(hex: 0x5F5545)
        static let sand900 = Color(hex: 0x242019)
        static let red50 = Color(hex: 0xFDF1EE)
        static let red200 = Color(hex: 0xF2917F)
        static let red400 = Color(hex: 0xD9503F)
        static let red500 = Color(hex: 0xC2372B)
        static let sand800 = Color(hex: 0x3D372D)
        static let brand200 = Color(hex: 0xFFC5B6)
        static let brand800 = Color(hex: 0x962B17)
        static let red100 = Color(hex: 0xFBDCD5)
        static let red800 = Color(hex: 0x6B1E18)
    }

    // MARK: Semantic tokens (theme.js `semanticTokens`), light | dark

    enum Colors {
        static let canvas = dynamic(0xFAF8F4, 0x1A1714)          // bg.canvas
        static let surface = dynamic(0xFFFFFF, 0x232019)         // bg.surface
        static let subtle = dynamic(0xF3EFE7, 0x2B271F)          // bg.subtle
        static let border = dynamic(0xE8E1D5, 0x352F26)          // border.default
        static let textPrimary = dynamic(0x242019, 0xF6F2EA)     // text.primary
        static let textMuted = dynamic(0x6F634F, 0xB8AB94)       // text.muted (ACCESSIBLE.muted | sand.400)
        static let accentFg = dynamic(0xC9381A, 0xFFA088)        // accent.fg (ACCESSIBLE.text | brand.300)
        static let accentSolid = dynamic(0xD63D1A, 0xD63D1A)     // accent.solid (white text on it, both modes)
        static let accentSolidActive = dynamic(0x962B17, 0x962B17)
        static let accentSubtle = Color(uiColor: UIColor { $0.userInterfaceStyle == .dark
            ? UIColor(red: 249 / 255, green: 93 / 255, blue: 56 / 255, alpha: 0.18) : UIColor(hex: 0xFFE3DB) })
        static let positive = dynamic(0x2F7A45, 0x86C98A)        // status.positive
        static let negative = dynamic(0xC2372B, 0xF2917F)        // status.negative (red.500 | red.200)
        static let negativeSubtle = Color(uiColor: UIColor { $0.userInterfaceStyle == .dark
            ? UIColor(red: 242 / 255, green: 145 / 255, blue: 127 / 255, alpha: 0.14) : UIColor(hex: 0xFDF1EE) })
        static let warning = dynamic(0xB45709, 0xFBB324)         // status.warning (amber.700 | amber.400)
        static let placeholder = dynamic(0x9A8B72, 0x9A8B72)     // chakra-placeholder-color (sand.500)
        static let trendRest = dynamic(0xFFE3DB, 0x7C6F59)       // TrendBars' other months (brand.100 | sand.600)
        static let fill = Palette.brand500                       // a progress bar's normal fill (kitMath FILL_TONE.brand)
        static let onAccent = Color.white
    }

    // MARK: Radii (theme.js `radii`, 1rem = 16pt)

    enum Radius {
        static let md: CGFloat = 6
        static let lg: CGFloat = 12
        static let xl: CGFloat = 16
        static let xxl: CGFloat = 20 // '2xl': cards and dialogs
        static let full: CGFloat = 9999
    }

    // MARK: Spacing (Chakra's scale: 1 = 4pt)

    enum Space {
        static let s1: CGFloat = 4
        static let s2: CGFloat = 8
        static let s3: CGFloat = 12
        static let s4: CGFloat = 16
        static let s5: CGFloat = 20
        static let s6: CGFloat = 24
        static let s8: CGFloat = 32
        static let s10: CGFloat = 40
        static let s12: CGFloat = 48
    }

    // MARK: Shadows (theme.js `shadows`, the larger layer of each)

    enum Shadow {
        static let softColor = Color(red: 36 / 255, green: 32 / 255, blue: 25 / 255, opacity: 0.06)
        static let softRadius: CGFloat = 8
        static let softY: CGFloat = 4
        /// `lifted` (the Panel's): 0 2px 4px at 5%, then 0 12px 32px at 10%.
        static let liftedNear = Color(red: 36 / 255, green: 32 / 255, blue: 25 / 255, opacity: 0.05)
        static let liftedFar = Color(red: 36 / 255, green: 32 / 255, blue: 25 / 255, opacity: 0.10)
    }

    // MARK: Type (palette.js FONTS: Poppins headings, Nunito Sans body; Greek
    // headings fall back to Manrope, Greek body to the system font)

    enum Fonts {
        enum Weight { case regular, semibold, bold }

        static let headingFamily = ["en": "Poppins", "el": "Manrope"]
        static let bodyFamily = ["en": "NunitoSans"]

        /// A heading (letter-spacing -0.01em is applied by `Text.kerning` at the call site).
        static func heading(_ size: CGFloat, weight: Weight = .bold, lang: String) -> Font {
            custom(headingFamily[lang] ?? headingFamily["en"]!, size: size, weight: weight)
        }

        /// Body text; Greek uses the system font (Nunito Sans has no Greek).
        static func body(_ size: CGFloat, weight: Weight = .regular, lang: String) -> Font {
            guard let family = bodyFamily[lang] else { return .system(size: size, weight: systemWeight(weight)) }
            return custom(family, size: size, weight: weight)
        }

        /// The bundled files are static instances, named "<Family>-<Weight>".
        static func postScriptName(_ family: String, weight: Weight) -> String {
            switch weight {
            case .regular: return "\(family)-Regular"
            case .semibold: return "\(family)-SemiBold"
            case .bold: return "\(family)-Bold"
            }
        }

        private static func custom(_ family: String, size: CGFloat, weight: Weight) -> Font {
            .custom(postScriptName(family, weight: weight), size: size)
        }

        private static func systemWeight(_ weight: Weight) -> Font.Weight {
            switch weight {
            case .regular: return .regular
            case .semibold: return .semibold
            case .bold: return .bold
            }
        }
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
