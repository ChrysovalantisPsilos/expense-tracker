// The design-system kit the screens are built from: a port of the web's
// src/shared/ui/kit (Panel, CardHeader, IconTile, Figure, BalanceTile, Tile,
// ProgressRow, ItemRow, SectionLabel, Eyebrow) and of the Chakra pieces the
// web dresses in its theme (src/app/theme.js: Button, Tag, Tabs, the
// segmented control, the paginator). Sizes are Chakra's (xs 12, sm 14,
// md 16, lg 18, xl 20, 2xl 24, 3xl 30 pt; a button xs 24, sm 32, md 40,
// lg 48 pt tall). Components take already formatted strings: every number
// and word on screen came from the core or the web's dictionaries.
import SwiftUI

// MARK: Icons

/// A Lucide icon as the web draws it (Resources/Icons.xcassets, tinted by
/// the foreground style). `bold`: the heavier stroke of the lit tab and the
/// floating Add (strokeWidth 2.4; only those icons have it).
struct LucideIcon: View {
    let icon: Lucide
    var size: CGFloat = 16
    var bold = false

    var body: some View {
        Image(bold ? icon.rawValue + "-bold" : icon.rawValue)
            .renderingMode(.template)
            .resizable()
            .scaledToFit()
            .frame(width: size, height: size)
            .accessibilityHidden(true)
    }
}

// MARK: Tones (kitMath TEXT_TONE / FILL_TONE / TILE_TONE)

enum Tone { case `default`, muted, positive, negative, warning, accent }

extension Tone {
    /// kitMath's tone names ('positive', 'negative', 'muted', …) as tones.
    init(name: String?) {
        switch name {
        case "positive": self = .positive
        case "negative": self = .negative
        case "muted": self = .muted
        case "warning": self = .warning
        case "accent": self = .accent
        default: self = .default
        }
    }

    var color: Color {
        switch self {
        case .default: return Theme.Colors.textPrimary
        case .muted: return Theme.Colors.textMuted
        case .positive: return Theme.Colors.positive
        case .negative: return Theme.Colors.negative
        case .warning: return Theme.Colors.warning
        case .accent: return Theme.Colors.accentFg
        }
    }

    /// A tile's background (tileColor): the pale red for negative, else sand.
    var tile: Color { self == .negative ? Theme.Colors.negativeSubtle : Theme.Colors.subtle }

    /// A progress bar's fill (fillColor): brand unless negative, warning or positive.
    var fill: Color {
        switch self {
        case .negative: return Theme.Palette.red400
        case .warning: return Theme.Colors.warning
        case .positive: return Theme.Colors.positive
        default: return Theme.Colors.fill
        }
    }
}

// MARK: Text helpers

/// Body text in the kit's sizes (Nunito Sans; the system font for Greek).
struct KitText: ViewModifier {
    let size: CGFloat
    var weight: Theme.Fonts.Weight = .regular
    var color: Color = Theme.Colors.textPrimary
    @Environment(AppLanguage.self) private var language

    func body(content: Content) -> some View {
        content
            .font(Theme.Fonts.body(size, weight: weight, lang: language.current))
            .foregroundStyle(color)
    }
}

/// A heading in the kit's sizes (Poppins; Manrope for Greek), bold, -0.01em.
struct KitHeading: ViewModifier {
    let size: CGFloat
    var color: Color = Theme.Colors.textPrimary
    var tracking: CGFloat = -0.01
    @Environment(AppLanguage.self) private var language

    func body(content: Content) -> some View {
        content
            .font(Theme.Fonts.heading(size, weight: .bold, lang: language.current))
            .kerning(size * tracking)
            .foregroundStyle(color)
    }
}

extension View {
    func kitText(_ size: CGFloat, _ weight: Theme.Fonts.Weight = .regular, color: Color = Theme.Colors.textPrimary) -> some View {
        modifier(KitText(size: size, weight: weight, color: color))
    }

    func kitHeading(_ size: CGFloat, color: Color = Theme.Colors.textPrimary, tracking: CGFloat = -0.01) -> some View {
        modifier(KitHeading(size: size, color: color, tracking: tracking))
    }
}

// MARK: Panel and CardHeader

/// A card on the canvas (Panel): surface, hairline border, 2xl radius, the
/// lifted shadow, 16 pt inside; with a header (CardHeader) when it has a
/// title: the icon tile, the eyebrow, the title and subtitle, an action at
/// the end, and a rule under it (`divider`).
struct Panel<Content: View, Action: View>: View {
    var eyebrow: String? = nil
    var title: String? = nil
    var icon: Lucide? = nil
    var iconTone: Tone = .accent
    var subtitle: String? = nil
    var divider = false
    var padding: CGFloat = Theme.Space.s4
    @ViewBuilder var content: () -> Content
    @ViewBuilder var action: () -> Action

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            if title != nil || eyebrow != nil {
                CardHeader(title: title, eyebrow: eyebrow, icon: icon, iconTone: iconTone, subtitle: subtitle,
                           divider: divider, action: action)
            }
            content()
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(padding)
        .panelSurface()
    }
}

extension Panel where Action == EmptyView {
    init(eyebrow: String? = nil, title: String? = nil, icon: Lucide? = nil, iconTone: Tone = .accent,
         subtitle: String? = nil, divider: Bool = false, padding: CGFloat = Theme.Space.s4,
         @ViewBuilder content: @escaping () -> Content) {
        self.init(eyebrow: eyebrow, title: title, icon: icon, iconTone: iconTone, subtitle: subtitle,
                  divider: divider, padding: padding, content: content, action: { EmptyView() })
    }
}

extension View {
    /// The Panel's surface: white (dark: the raised brown), the hairline, 20 pt
    /// corners and theme.js's `lifted` shadow (two layers).
    func panelSurface(radius: CGFloat = Theme.Radius.xxl) -> some View {
        background(Theme.Colors.surface)
            .clipShape(RoundedRectangle(cornerRadius: radius, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: radius, style: .continuous).stroke(Theme.Colors.border, lineWidth: 1))
            .shadow(color: Theme.Shadow.liftedNear, radius: 2, y: 2)
            .shadow(color: Theme.Shadow.liftedFar, radius: 16, y: 12)
    }
}

/// A card's header (CardHeader): the 36 pt icon tile, the eyebrow over the
/// 18 pt title and the muted subtitle, the action at the end; 16 pt under
/// it, or a rule (12 pt, the line, 8 pt) with `divider`.
struct CardHeader<Action: View>: View {
    var title: String? = nil
    var eyebrow: String? = nil
    var icon: Lucide? = nil
    var iconTone: Tone = .accent
    var subtitle: String? = nil
    var divider = false
    @ViewBuilder var action: () -> Action

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(alignment: .center, spacing: Theme.Space.s3) {
                if let icon { IconTile(icon: icon, size: 36, tone: iconTone) }
                VStack(alignment: .leading, spacing: 0) {
                    if let eyebrow { Eyebrow(text: eyebrow).padding(.bottom, 2) }
                    if let title {
                        Text(title)
                            .kitHeading(18)
                            .lineSpacing(2)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                    if let subtitle {
                        Text(subtitle)
                            .kitText(12, color: Theme.Colors.textMuted)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                action()
            }
            .padding(.bottom, divider ? Theme.Space.s3 : Theme.Space.s4)
            if divider {
                Rectangle().fill(Theme.Colors.border).frame(height: 1)
                    .padding(.bottom, Theme.Space.s2)
            }
        }
    }
}

extension CardHeader where Action == EmptyView {
    init(title: String? = nil, eyebrow: String? = nil, icon: Lucide? = nil, iconTone: Tone = .accent,
         subtitle: String? = nil, divider: Bool = false) {
        self.init(title: title, eyebrow: eyebrow, icon: icon, iconTone: iconTone, subtitle: subtitle,
                  divider: divider, action: { EmptyView() })
    }
}

// MARK: IconTile, Tile

/// A rounded tile with an icon (IconTile): sand (pale red when negative)
/// under the tone's colour, or the solid brand under white.
struct IconTile: View {
    let icon: Lucide
    var size: CGFloat = 32
    var tone: Tone = .accent
    var solid = false

    var body: some View {
        LucideIcon(icon: icon, size: (size / 2).rounded())
            .foregroundStyle(solid ? Color.white : tone.color)
            .frame(width: size, height: size)
            .background(solid ? Theme.Palette.brand500 : tone.tile)
            .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.lg, style: .continuous))
            .accessibilityHidden(true)
    }
}

/// The sand tile figures sit on (Tile): lg corners, 12 × 10 pt inside.
struct Tile<Content: View>: View {
    var vertical: CGFloat = 10
    @ViewBuilder var content: () -> Content

    var body: some View {
        VStack(alignment: .leading, spacing: 0, content: content)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.horizontal, Theme.Space.s3)
            .padding(.vertical, vertical)
            .background(Theme.Colors.subtle)
            .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.lg, style: .continuous))
    }
}

// MARK: Figure, BalanceTile

/// A labelled number (Figure): the 12 pt muted label over the heading-font
/// value in the tone's colour, at the web's sizes (sm 14, md 16, lg 20,
/// xl and hero 30).
struct Figure: View {
    enum Size { case sm, md, lg, xl, hero }
    let label: String
    let value: String
    var tone: Tone = .default
    var size: Size = .md
    /// Something after the label (the overview's ⓘ).
    var labelAccessory: AnyView? = nil

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(spacing: 2) {
                Text(label).kitText(12, color: Theme.Colors.textMuted)
                if let labelAccessory { labelAccessory }
            }
            Text(value)
                .kitHeading(points, color: tone.color, tracking: 0)
                .lineLimit(1)
                .minimumScaleFactor(0.6)
        }
        .accessibilityElement(children: .combine)
    }

    private var points: CGFloat {
        switch size {
        case .sm: return 14
        case .md: return 16
        case .lg: return 20
        case .xl, .hero: return 30
        }
    }
}

/// A labelled amount on a sand tile (BalanceTile): `md` holds a Figure, `sm`
/// a 12 pt label over a 14 pt bold value; a note under it.
struct BalanceTile: View {
    let label: String
    let value: String
    var tone: Tone = .default
    var md = false
    var note: String? = nil

    var body: some View {
        Tile(vertical: md ? 10 : 8) {
            if md {
                Figure(label: label, value: value, tone: tone)
            } else {
                Text(label).kitText(12, color: Theme.Colors.textMuted)
                Text(value).kitText(14, .bold, color: tone.color).lineLimit(1).minimumScaleFactor(0.7)
            }
            if let note { Text(note).kitText(12, color: Theme.Colors.textMuted) }
        }
        .accessibilityElement(children: .combine)
    }
}

// MARK: ProgressRow

/// A ranked bar (ProgressRow): the badge, the title over its muted line (and
/// "Over budget" under it), the value at the end (red when over), a chevron
/// when it opens something, a trailing control; then the 8 pt bar under the
/// whole row. `ratio` is the bar's length, 0…1 (kitMath.barWidth clamps).
struct ProgressRow<Media: View, Trailing: View>: View {
    let title: String
    var meta: String? = nil
    let ratio: Double
    let valueLabel: String
    var fill: Color = Theme.Colors.fill
    var over = false
    var overLabel: String? = nil
    var chevron = false
    @ViewBuilder var media: () -> Media
    @ViewBuilder var trailing: () -> Trailing

    var body: some View {
        VStack(alignment: .leading, spacing: Theme.Space.s2) {
            HStack(spacing: Theme.Space.s3) {
                media()
                VStack(alignment: .leading, spacing: 0) {
                    Text(title).kitText(14, .semibold).fixedSize(horizontal: false, vertical: true)
                    if let meta {
                        Text(meta).kitText(12, color: Theme.Colors.textMuted).fixedSize(horizontal: false, vertical: true)
                    }
                    if over, let overLabel {
                        KitTag(text: overLabel, tone: .negative, pill: true).padding(.top, Theme.Space.s1)
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                Text(valueLabel).kitText(14, .bold, color: over ? Theme.Colors.negative : Theme.Colors.textMuted)
                if chevron {
                    LucideIcon(icon: .chevronRight, size: 16).foregroundStyle(Theme.Colors.textMuted)
                }
                trailing()
            }
            GeometryReader { geometry in
                ZStack(alignment: .leading) {
                    Capsule().fill(Theme.Colors.subtle)
                    Capsule().fill(fill).frame(width: geometry.size.width * fraction)
                }
            }
            .frame(height: 8)
        }
        .accessibilityElement(children: .combine)
    }

    private var fraction: CGFloat {
        let value = ratio.isFinite ? ratio : 0
        return CGFloat(min(1, max(0, value)))
    }
}

extension ProgressRow where Trailing == EmptyView {
    init(title: String, meta: String? = nil, ratio: Double, valueLabel: String, fill: Color = Theme.Colors.fill,
         over: Bool = false, overLabel: String? = nil, chevron: Bool = false, @ViewBuilder media: @escaping () -> Media) {
        self.init(title: title, meta: meta, ratio: ratio, valueLabel: valueLabel, fill: fill, over: over,
                  overLabel: overLabel, chevron: chevron, media: media, trailing: { EmptyView() })
    }
}

// MARK: ItemRow

/// A list row (ItemRow): the badge, the 14 pt title over its muted 12 pt
/// line, the amount (14 pt bold, in its tone) with a line under it, a
/// chevron when it opens something, and trailing controls (the ⋮ menu).
struct ItemRow<Media: View, Meta: View, Trailing: View>: View {
    let title: String
    var amount: String? = nil
    var amountTone: Tone = .default
    var amountMeta: String? = nil
    var chevron = false
    var dimmed = false
    var vertical: CGFloat = 10
    @ViewBuilder var media: () -> Media
    @ViewBuilder var meta: () -> Meta
    @ViewBuilder var trailing: () -> Trailing

    var body: some View {
        HStack(spacing: Theme.Space.s3) {
            HStack(spacing: Theme.Space.s3) {
                media()
                VStack(alignment: .leading, spacing: 1) {
                    Text(title).kitText(14, .semibold).fixedSize(horizontal: false, vertical: true)
                    meta()
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                if let amount {
                    VStack(alignment: .trailing, spacing: 0) {
                        Text(amount).kitText(14, .bold, color: amountTone.color).lineLimit(1)
                        if let amountMeta { Text(amountMeta).kitText(12, color: Theme.Colors.textMuted).lineLimit(1) }
                    }
                    .layoutPriority(1)
                }
                if chevron {
                    LucideIcon(icon: .chevronRight, size: 16).foregroundStyle(Theme.Colors.textMuted)
                }
            }
            .opacity(dimmed ? 0.55 : 1)
            trailing()
        }
        .padding(.vertical, vertical)
        .contentShape(Rectangle())
    }
}

/// An ItemRow's muted line as plain text.
struct MetaText: View {
    let text: String

    var body: some View {
        Text(text).kitText(12, color: Theme.Colors.textMuted).fixedSize(horizontal: false, vertical: true)
    }
}

extension ItemRow where Meta == MetaText, Trailing == EmptyView {
    init(title: String, meta: String?, amount: String? = nil, amountTone: Tone = .default, amountMeta: String? = nil,
         chevron: Bool = false, dimmed: Bool = false, vertical: CGFloat = 10, @ViewBuilder media: @escaping () -> Media) {
        self.init(title: title, amount: amount, amountTone: amountTone, amountMeta: amountMeta, chevron: chevron,
                  dimmed: dimmed, vertical: vertical, media: media,
                  meta: { MetaText(text: meta ?? "") }, trailing: { EmptyView() })
    }
}

extension ItemRow where Meta == MetaText {
    init(title: String, meta: String?, amount: String? = nil, amountTone: Tone = .default, amountMeta: String? = nil,
         chevron: Bool = false, dimmed: Bool = false, vertical: CGFloat = 10, @ViewBuilder media: @escaping () -> Media,
         @ViewBuilder trailing: @escaping () -> Trailing) {
        self.init(title: title, amount: amount, amountTone: amountTone, amountMeta: amountMeta, chevron: chevron,
                  dimmed: dimmed, vertical: vertical, media: media,
                  meta: { MetaText(text: meta ?? "") }, trailing: trailing)
    }
}

/// One of a row's actions (RowActions): on a phone they fold into the ⋮ menu.
struct RowAction: Identifiable {
    let label: String
    let icon: Lucide
    var danger = false
    let run: () -> Void
    var id: String { label }
}

/// The ⋮ button (24 pt, ghost, muted) and its menu of the row's actions.
struct RowActionsMenu: View {
    let actions: [RowAction]
    @Environment(AppLanguage.self) private var language

    var body: some View {
        if actions.isEmpty {
            Color.clear.frame(width: 24, height: 24)
        } else {
            Menu {
                ForEach(actions) { action in
                    Button(role: action.danger ? .destructive : nil, action: action.run) {
                        Label { Text(action.label) } icon: { Image(action.icon.rawValue).renderingMode(.template) }
                    }
                }
            } label: {
                LucideIcon(icon: .moreVertical, size: 16)
                    .foregroundStyle(Theme.Colors.textMuted)
                    .frame(width: 24, height: 24)
                    .contentShape(Rectangle())
                    .frame(width: 32, height: 44)
            }
            .accessibilityLabel(language.t("common:actions.moreActions"))
        }
    }
}

// MARK: Eyebrow, SectionLabel

/// The small uppercase line over a title (Eyebrow): 12 pt bold, +0.08em, accent.
struct Eyebrow: View {
    let text: String
    var color: Color = Theme.Colors.accentFg
    var tracking: CGFloat = 0.08
    @Environment(AppLanguage.self) private var language

    var body: some View {
        Text(text.capsLabel)
            .font(Theme.Fonts.body(12, weight: .bold, lang: language.current))
            .kerning(12 * tracking)
            .foregroundStyle(color)
    }
}

/// A block's label inside a card (SectionLabel): the muted eyebrow, and a
/// bold figure at the end.
struct SectionLabel: View {
    let text: String
    var aside: String? = nil

    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: Theme.Space.s3) {
            Eyebrow(text: text, color: Theme.Colors.textMuted, tracking: 0.06)
            Spacer(minLength: 0)
            if let aside { Text(aside).kitText(14, .bold) }
        }
    }
}

// MARK: Tag

/// Chakra's subtle Tag (size sm): brand (a group's name, a reminder),
/// negative ("Over budget") or grey ("Paused").
struct KitTag: View {
    let text: String
    var tone: Tone = .accent
    var pill = false
    var icon: Lucide? = nil
    @Environment(\.colorScheme) private var scheme

    var body: some View {
        HStack(spacing: 3) {
            if let icon { LucideIcon(icon: icon, size: 10) }
            Text(text).kitText(12, .semibold, color: foreground).lineLimit(2)
        }
        .foregroundStyle(foreground)
        .padding(.horizontal, pill ? Theme.Space.s2 : 6)
        .padding(.vertical, 2)
        .frame(minHeight: 20)
        .background(background)
        .clipShape(RoundedRectangle(cornerRadius: pill ? 999 : Theme.Radius.md, style: .continuous))
    }

    // Chakra's subtle Tag: <scheme>.100 under <scheme>.800; dark, the 200
    // at 16% under the 200.
    private var foreground: Color {
        switch tone {
        case .negative: return scheme == .dark ? Theme.Palette.red200 : Theme.Palette.red800
        case .muted, .default: return Theme.Colors.textPrimary
        default: return scheme == .dark ? Theme.Palette.brand200 : Theme.Palette.brand800
        }
    }

    private var background: Color {
        switch tone {
        case .negative: return scheme == .dark ? Theme.Palette.red200.opacity(0.16) : Theme.Palette.red100
        case .muted, .default: return Theme.Colors.subtle
        default: return scheme == .dark ? Theme.Palette.brand200.opacity(0.16) : Theme.Palette.brand100
        }
    }
}

// MARK: Buttons

/// Chakra's Button in the web's theme: solid (accent.solid under white),
/// outline (the hairline; brand text, or primary for gray), ghost (muted,
/// sand when pressed) and link (accent text); sizes xs 24, sm 32, md 40,
/// lg 48 pt tall; lg (12 pt) corners; 600 weight.
struct KitButtonStyle: ButtonStyle {
    enum Variant { case solid, outline, ghost, link }
    enum Size { case xs, sm, md, lg }
    enum Scheme { case brand, gray, danger }
    var variant: Variant = .solid
    var size: Size = .md
    var scheme: Scheme = .brand
    var full = false

    func makeBody(configuration: Configuration) -> some View {
        KitButtonBody(label: configuration.label, pressed: configuration.isPressed,
                      variant: variant, size: size, scheme: scheme, full: full)
    }
}

/// A KitButtonStyle's drawing (a View, so it reads the environment).
struct KitButtonBody<Label: View>: View {
    let label: Label
    let pressed: Bool
    let variant: KitButtonStyle.Variant
    let size: KitButtonStyle.Size
    let scheme: KitButtonStyle.Scheme
    let full: Bool
    @Environment(\.isEnabled) private var isEnabled
    @Environment(AppLanguage.self) private var language

    var body: some View {
        label
            .font(Theme.Fonts.body(fontSize, weight: .semibold, lang: language.current))
            .foregroundStyle(foreground)
            .lineLimit(1)
            .padding(.horizontal, variant == .link ? 0 : padding)
            .frame(maxWidth: full ? .infinity : nil)
            .frame(minHeight: variant == .link ? nil : height)
            .background(background)
            .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.lg, style: .continuous))
            .overlay {
                if variant == .outline {
                    RoundedRectangle(cornerRadius: Theme.Radius.lg, style: .continuous)
                        .stroke(scheme == .gray ? Theme.Colors.border : foreground, lineWidth: 1)
                }
            }
            .opacity(isEnabled ? 1 : 0.4)
            .contentShape(Rectangle())
    }

    private var height: CGFloat {
        switch size {
        case .xs: return 24
        case .sm: return 32
        case .md: return 40
        case .lg: return 48
        }
    }

    private var fontSize: CGFloat {
        switch size {
        case .xs: return 12
        case .sm: return 14
        case .md, .lg: return 16
        }
    }

    private var padding: CGFloat {
        switch size {
        case .xs: return 8
        case .sm: return 12
        case .md: return 16
        case .lg: return 24
        }
    }

    private var foreground: Color {
        switch (variant, scheme) {
        case (.solid, _): return Theme.Colors.onAccent
        case (_, .danger): return Theme.Colors.negative
        case (.ghost, _): return Theme.Colors.textMuted
        case (_, .gray): return Theme.Colors.textPrimary
        default: return Theme.Colors.accentFg
        }
    }

    private var background: Color {
        switch variant {
        case .solid:
            if scheme == .danger { return pressed ? Theme.Palette.red500 : Theme.Palette.red400 }
            return pressed ? Theme.Colors.accentSolidActive : Theme.Colors.accentSolid
        case .outline, .ghost:
            return pressed ? Theme.Colors.subtle : Color.clear
        case .link:
            return Color.clear
        }
    }
}

extension ButtonStyle where Self == KitButtonStyle {
    static func kit(_ variant: KitButtonStyle.Variant = .solid, _ size: KitButtonStyle.Size = .md,
                    scheme: KitButtonStyle.Scheme = .brand, full: Bool = false) -> KitButtonStyle {
        KitButtonStyle(variant: variant, size: size, scheme: scheme, full: full)
    }
}

/// The form's full-width solid button ("Add expense", "Log in").
struct PrimaryButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        KitButtonBody(label: configuration.label, pressed: configuration.isPressed,
                      variant: .solid, size: .md, scheme: .brand, full: true)
    }
}

/// The full-width gray outline button ("Show all 14 categories").
struct OutlineButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        KitButtonBody(label: configuration.label, pressed: configuration.isPressed,
                      variant: .outline, size: .md, scheme: .gray, full: true)
    }
}

/// The outline button in the danger tone (Delete).
struct DangerButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        KitButtonBody(label: configuration.label, pressed: configuration.isPressed,
                      variant: .outline, size: .md, scheme: .danger, full: true)
    }
}

/// A button's label: the icon then the words (leftIcon), as Chakra spaces them.
struct IconLabel: View {
    let text: String
    let icon: Lucide
    var size: CGFloat = 16
    var trailing = false

    var body: some View {
        HStack(spacing: Theme.Space.s2) {
            if !trailing { LucideIcon(icon: icon, size: size) }
            Text(text)
            if trailing { LucideIcon(icon: icon, size: size) }
        }
    }
}

/// A square icon button (Chakra IconButton): solid brand, outline or ghost.
struct KitIconButton: View {
    let icon: Lucide
    let label: String
    var variant: KitButtonStyle.Variant = .ghost
    var size: KitButtonStyle.Size = .sm
    var iconSize: CGFloat = 18
    var bold = false
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            LucideIcon(icon: icon, size: iconSize, bold: bold)
                .foregroundStyle(variant == .solid ? Theme.Colors.onAccent
                                 : variant == .outline ? Theme.Colors.textPrimary : Theme.Colors.textMuted)
                .frame(width: side, height: side)
                .background(variant == .solid ? Theme.Colors.accentSolid : Color.clear)
                .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.lg, style: .continuous))
                .overlay {
                    if variant == .outline {
                        RoundedRectangle(cornerRadius: Theme.Radius.lg, style: .continuous).stroke(Theme.Colors.border, lineWidth: 1)
                    }
                }
                .frame(minWidth: 44, minHeight: 44)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(label)
    }

    private var side: CGFloat {
        switch size {
        case .xs: return 24
        case .sm: return 32
        case .md: return 40
        case .lg: return 48
        }
    }
}

// MARK: Segmented controls and tabs

/// The web's SegmentedControl: options on the sand strip (4 pt inside, lg
/// corners), the picked one solid brand, the others ghost; `fitted` shares
/// the width.
struct SegmentedControl: View {
    let options: [(value: String, label: String)]
    let value: String
    var size: KitButtonStyle.Size = .xs
    var fitted = false
    let pick: (String) -> Void
    @Environment(AppLanguage.self) private var language

    var body: some View {
        HStack(spacing: Theme.Space.s1) {
            ForEach(options, id: \.value) { option in
                let on = option.value == value
                Button { pick(option.value) } label: {
                    Text(option.label)
                        .font(Theme.Fonts.body(size == .xs ? 12 : 14, weight: .semibold, lang: language.current))
                        .foregroundStyle(on ? Theme.Colors.onAccent : Theme.Colors.textMuted)
                        .lineLimit(1)
                        .minimumScaleFactor(0.8)
                        .padding(.horizontal, size == .xs ? 8 : 12)
                        .frame(minWidth: 42, maxWidth: fitted ? .infinity : nil, minHeight: size == .xs ? 24 : 32)
                        .background(on ? Theme.Colors.accentSolid : Color.clear)
                        .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.md, style: .continuous))
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityAddTraits(on ? .isSelected : [])
            }
        }
        .padding(Theme.Space.s1)
        .background(Theme.Colors.subtle)
        .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.lg, style: .continuous))
    }
}

/// Chakra's line Tabs (Recurring's Subscriptions | Income), fitted: each
/// label over a 2 pt line, the picked one in the accent.
struct LineTabs: View {
    let options: [(value: String, label: String)]
    let value: String
    let pick: (String) -> Void
    @Environment(AppLanguage.self) private var language

    var body: some View {
        HStack(spacing: 0) {
            ForEach(options, id: \.value) { option in
                let on = option.value == value
                Button { pick(option.value) } label: {
                    Text(option.label)
                        .font(Theme.Fonts.body(16, weight: .semibold, lang: language.current))
                        .foregroundStyle(on ? Theme.Colors.accentFg : Theme.Colors.textPrimary)
                        .frame(maxWidth: .infinity, minHeight: 40)
                        .overlay(alignment: .bottom) {
                            Rectangle().fill(on ? Theme.Colors.accentFg : Theme.Colors.border).frame(height: 2)
                        }
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityAddTraits(on ? .isSelected : [])
            }
        }
    }
}

/// Chakra's soft-rounded Tabs (GroupTabs: Monthly · Yearly): the picked one
/// on the pale brand pill.
struct PillTabs: View {
    let options: [(value: String, label: String)]
    let value: String
    let pick: (String) -> Void
    @Environment(AppLanguage.self) private var language

    var body: some View {
        HStack(spacing: Theme.Space.s1) {
            ForEach(options, id: \.value) { option in
                let on = option.value == value
                Button { pick(option.value) } label: {
                    Text(option.label)
                        .font(Theme.Fonts.body(14, weight: .semibold, lang: language.current))
                        .foregroundStyle(on ? Theme.Colors.accentFg : Theme.Colors.textMuted)
                        .padding(.horizontal, Theme.Space.s3)
                        .frame(minHeight: 32)
                        .background(on ? Theme.Colors.accentSubtle : Color.clear)
                        .clipShape(Capsule())
                        .contentShape(Capsule())
                }
                .buttonStyle(.plain)
                .accessibilityAddTraits(on ? .isSelected : [])
            }
        }
    }
}

// MARK: Paginator

/// The web's Paginator: previous, "Page 2 of 5", next, at the end of a list.
struct Paginator: View {
    let page: Int
    let pages: Int
    let position: String
    let go: (Int) -> Void
    @Environment(AppLanguage.self) private var language

    var body: some View {
        HStack(spacing: Theme.Space.s2) {
            Spacer()
            arrow(.chevronLeft, label: "common:paginator.previous", to: page - 1, enabled: page > 1)
            Text(position)
                .kitText(12, color: Theme.Colors.textMuted)
                .frame(minWidth: 72)
            arrow(.chevronRight, label: "common:paginator.next", to: page + 1, enabled: page < pages)
        }
        .padding(.top, Theme.Space.s3)
    }

    private func arrow(_ icon: Lucide, label: String, to target: Int, enabled: Bool) -> some View {
        Button { go(target) } label: {
            LucideIcon(icon: icon, size: 16)
                .foregroundStyle(Theme.Colors.textMuted)
                .frame(width: 24, height: 24)
                .frame(minWidth: 44, minHeight: 44)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .disabled(!enabled)
        .opacity(enabled ? 1 : 0.4)
        .accessibilityLabel(language.t(label))
    }
}

// MARK: Skeletons

/// A grey block where something will be (SkeletonBlock).
struct SkeletonBlock: View {
    var width: CGFloat? = nil
    var height: CGFloat = 14
    var radius: CGFloat = Theme.Radius.md

    var body: some View {
        RoundedRectangle(cornerRadius: radius, style: .continuous)
            .fill(Theme.Colors.subtle)
            .frame(width: width, height: height)
            .frame(maxWidth: width == nil ? .infinity : nil, alignment: .leading)
            .accessibilityHidden(true)
    }
}

/// Rows where a list will be (SkeletonRows): a tile, two lines, an amount;
/// `progress` adds the bar under each.
struct SkeletonRows: View {
    var count = 4
    var progress = false

    var body: some View {
        VStack(alignment: .leading, spacing: progress ? Theme.Space.s4 : 0) {
            ForEach(0..<count, id: \.self) { _ in
                VStack(spacing: Theme.Space.s2) {
                    HStack(spacing: Theme.Space.s3) {
                        SkeletonBlock(width: 32, height: 32, radius: Theme.Radius.lg)
                        VStack(alignment: .leading, spacing: 6) {
                            SkeletonBlock(width: 120, height: 12)
                            SkeletonBlock(width: 80, height: 10)
                        }
                        Spacer()
                        SkeletonBlock(width: 56, height: 12)
                    }
                    if progress { SkeletonBlock(height: 8, radius: 4) }
                }
                .padding(.vertical, progress ? 0 : 10)
            }
        }
        .accessibilityHidden(true)
    }
}

// MARK: Empty states

/// A card's empty state (CardEmptyState): a line of muted text, centred,
/// and its action under it.
struct CardEmptyState<Action: View>: View {
    let text: String
    @ViewBuilder var action: () -> Action

    var body: some View {
        VStack(spacing: Theme.Space.s3) {
            Text(text).kitText(14, color: Theme.Colors.textMuted).multilineTextAlignment(.center)
            action()
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, Theme.Space.s4)
    }
}

/// A page's empty state (EmptyState): the icon on its round tile, the title,
/// the words, the actions.
struct EmptyStateBlock<Actions: View>: View {
    var icon: Lucide? = nil
    let title: String
    var text: String? = nil
    @ViewBuilder var actions: () -> Actions

    var body: some View {
        VStack(spacing: Theme.Space.s3) {
            if let icon {
                LucideIcon(icon: icon, size: 24)
                    .foregroundStyle(Theme.Colors.accentFg)
                    .frame(width: 56, height: 56)
                    .background(Theme.Colors.accentSubtle)
                    .clipShape(Circle())
            }
            Text(title).kitHeading(18).multilineTextAlignment(.center)
            if let text {
                Text(text).kitText(14, color: Theme.Colors.textMuted).multilineTextAlignment(.center)
                    .fixedSize(horizontal: false, vertical: true)
            }
            actions()
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, Theme.Space.s6)
    }
}

// MARK: Info toggle (InfoToggle)

/// The ⓘ button (xs ghost, Info 14): muted, the accent while its box is open.
struct InfoButton: View {
    @Binding var open: Bool
    let label: String

    var body: some View {
        Button { open.toggle() } label: {
            LucideIcon(icon: .info, size: 14)
                .foregroundStyle(open ? Theme.Colors.accentFg : Theme.Colors.textMuted)
                .frame(width: 24, height: 24)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(label)
        .accessibilityValue(open ? "1" : "0")
    }
}

/// What the ⓘ opens: 12 pt muted lines on a sand box, 8 pt under it.
struct InfoBox: View {
    let lines: [String]

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            ForEach(lines, id: \.self) { Text($0).kitText(12, color: Theme.Colors.textMuted).fixedSize(horizontal: false, vertical: true) }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, Theme.Space.s3)
        .padding(.vertical, Theme.Space.s2)
        .background(Theme.Colors.subtle)
        .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.lg, style: .continuous))
        .padding(.top, Theme.Space.s2)
    }
}

// MARK: NavList (More, Settings)

/// A list of links in one card (NavList): the section's label over it, the
/// rows divided by hairlines, nothing inside the card's edge.
struct NavList<Rows: View>: View {
    var label: String? = nil
    @ViewBuilder var rows: () -> Rows

    var body: some View {
        VStack(alignment: .leading, spacing: Theme.Space.s2) {
            if let label { SectionLabel(text: label).padding(.horizontal, Theme.Space.s1) }
            VStack(spacing: 0) {
                _VariadicView.Tree(DividedRows()) { rows() }
            }
            .panelSurface()
        }
    }
}

/// Hairlines between a NavList's rows.
private struct DividedRows: _VariadicView_MultiViewRoot {
    func body(children: _VariadicView.Children) -> some View {
        let last = children.last?.id
        ForEach(children) { child in
            child
            if child.id != last { Rectangle().fill(Theme.Colors.border).frame(height: 1) }
        }
    }
}

/// One link (NavRow): the 40 pt tile (xl corners), the name (16 pt, 600) over
/// its description (14 pt muted), and the chevron when it goes somewhere.
struct NavRow<Media: View>: View {
    let label: String
    var description: String? = nil
    var chevron = true
    var tone: Color = Theme.Colors.textPrimary
    let action: () -> Void
    @ViewBuilder var media: () -> Media

    var body: some View {
        Button(action: action) {
            HStack(spacing: Theme.Space.s3) {
                media()
                VStack(alignment: .leading, spacing: 0) {
                    Text(label).kitText(16, .semibold, color: tone)
                    if let description { Text(description).kitText(14, color: Theme.Colors.textMuted) }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                if chevron { LucideIcon(icon: .chevronRight, size: 18).foregroundStyle(Theme.Colors.textMuted) }
            }
            .padding(.horizontal, Theme.Space.s4)
            .padding(.vertical, 14)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }
}

extension NavRow where Media == NavTile {
    init(icon: Lucide, label: String, description: String? = nil, chevron: Bool = true,
         tone: Color = Theme.Colors.textPrimary, action: @escaping () -> Void) {
        self.init(label: label, description: description, chevron: chevron, tone: tone, action: action,
                  media: { NavTile(icon: icon) })
    }
}

/// A NavRow's tile: IconTile at 40 pt with xl corners.
struct NavTile: View {
    let icon: Lucide

    var body: some View {
        LucideIcon(icon: icon, size: 20)
            .foregroundStyle(Theme.Colors.accentFg)
            .frame(width: 40, height: 40)
            .background(Theme.Colors.subtle)
            .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.xl, style: .continuous))
    }
}
