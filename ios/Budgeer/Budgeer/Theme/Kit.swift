// The design-system kit the screens are built from, after the web's
// src/shared/ui/kit: Panel (a card), Figure (a headline number), BalanceTile
// (a small labelled amount), ProgressRow (a ranked bar with its amount and
// share), a primary button and a text field. Components take already
// formatted strings: every number on screen was formatted by the core.
import SwiftUI

// MARK: Panel

/// A card on the canvas: surface, hairline border, 2xl radius, soft shadow.
struct Panel<Content: View>: View {
    var title: String? = nil
    var icon: String? = nil
    @ViewBuilder var content: () -> Content
    @Environment(AppLanguage.self) private var language

    var body: some View {
        VStack(alignment: .leading, spacing: Theme.Space.s4) {
            if let title {
                HStack(spacing: Theme.Space.s2) {
                    if let icon { IconTile(systemName: icon) }
                    Text(title)
                        .font(Theme.Fonts.heading(16, weight: .semibold, lang: language.current))
                        .kerning(-0.16)
                        .foregroundStyle(Theme.Colors.textPrimary)
                }
            }
            content()
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(Theme.Space.s4)
        .background(Theme.Colors.surface)
        .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.xxl, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: Theme.Radius.xxl, style: .continuous).stroke(Theme.Colors.border, lineWidth: 1))
        .shadow(color: Theme.Shadow.softColor, radius: Theme.Shadow.softRadius, y: Theme.Shadow.softY)
    }
}

// MARK: IconTile

/// A small rounded tile with a symbol, on the subtle background.
struct IconTile: View {
    let systemName: String
    var size: CGFloat = 32
    var tone: Color = Theme.Colors.textPrimary

    var body: some View {
        Image(systemName: systemName)
            .font(.system(size: size * 0.5, weight: .semibold))
            .foregroundStyle(tone)
            .frame(width: size, height: size)
            .background(Theme.Colors.subtle)
            .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.lg, style: .continuous))
    }
}

// MARK: Figure

/// A headline figure: a small muted label over a large heading-font value.
struct Figure: View {
    let label: String
    let value: String
    var hero = true
    @Environment(AppLanguage.self) private var language

    var body: some View {
        VStack(alignment: .leading, spacing: Theme.Space.s1) {
            Text(label)
                .font(Theme.Fonts.body(13, weight: .semibold, lang: language.current))
                .foregroundStyle(Theme.Colors.textMuted)
            Text(value)
                .font(Theme.Fonts.heading(hero ? 34 : 22, weight: .bold, lang: language.current))
                .kerning(hero ? -0.68 : -0.22)
                .foregroundStyle(Theme.Colors.textPrimary)
                .lineLimit(1)
                .minimumScaleFactor(0.6)
        }
        .accessibilityElement(children: .combine)
    }
}

// MARK: BalanceTile

enum Tone { case `default`, muted, positive, negative, warning, accent }

extension Tone {
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
}

/// A labelled amount on the subtle background, its value in the tone's colour.
struct BalanceTile: View {
    let label: String
    let value: String
    var tone: Tone = .default
    @Environment(AppLanguage.self) private var language

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(label)
                .font(Theme.Fonts.body(12, weight: .semibold, lang: language.current))
                .foregroundStyle(Theme.Colors.textMuted)
            Text(value)
                .font(Theme.Fonts.heading(17, weight: .bold, lang: language.current))
                .foregroundStyle(tone.color)
                .lineLimit(1)
                .minimumScaleFactor(0.7)
        }
        .frame(maxWidth: .infinity, minHeight: 64, alignment: .leading)
        .padding(.horizontal, Theme.Space.s3)
        .padding(.vertical, Theme.Space.s2)
        .background(Theme.Colors.subtle)
        .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.lg, style: .continuous))
        .accessibilityElement(children: .combine)
    }
}

// MARK: ProgressRow

/// A ranked bar: title and amount over a bar sized by `ratio`, with the share
/// at the end, and the row's badge (`media`) in front. Identity is the label,
/// not a colour; `fill` colours the bar (a budget's tone), coral by default.
struct ProgressRow<Media: View>: View {
    let title: String
    let meta: String
    /// 0…1, the bar's length relative to the largest row (or to the cap).
    let ratio: Double
    let valueLabel: String
    var fill: Color = Theme.Colors.fill
    var valueTone: Color = Theme.Colors.textMuted
    @ViewBuilder var media: () -> Media
    @Environment(AppLanguage.self) private var language

    var body: some View {
        HStack(alignment: .center, spacing: Theme.Space.s3) {
            media()
            VStack(alignment: .leading, spacing: Theme.Space.s1) {
                HStack(alignment: .firstTextBaseline) {
                    Text(title)
                        .font(Theme.Fonts.body(15, weight: .semibold, lang: language.current))
                        .foregroundStyle(Theme.Colors.textPrimary)
                        .lineLimit(1)
                    Spacer(minLength: Theme.Space.s2)
                    Text(meta)
                        .font(Theme.Fonts.body(13, weight: .regular, lang: language.current))
                        .foregroundStyle(Theme.Colors.textMuted)
                        .lineLimit(1)
                }
                HStack(spacing: Theme.Space.s2) {
                    GeometryReader { geometry in
                        ZStack(alignment: .leading) {
                            Capsule().fill(Theme.Colors.subtle)
                            Capsule().fill(fill)
                                .frame(width: geometry.size.width * barFraction)
                        }
                    }
                    .frame(height: 8)
                    Text(valueLabel)
                        .font(Theme.Fonts.body(12, weight: .semibold, lang: language.current))
                        .foregroundStyle(valueTone)
                        .frame(minWidth: 34, alignment: .trailing)
                }
            }
        }
        .accessibilityElement(children: .combine)
    }

    // kitMath.barWidth: clamped to 0…100%; a sliver stays visible (the web's
    // minimum of 2%).
    private var barFraction: CGFloat {
        let percent = ratio.isFinite ? ratio * 100 : 0
        return CGFloat(min(100, max(2, percent)) / 100)
    }
}

// MARK: Buttons and fields

/// The solid coral button (accent.solid under white text, lg radius, 44pt).
struct PrimaryButtonStyle: ButtonStyle {
    @Environment(\.isEnabled) private var isEnabled
    @Environment(AppLanguage.self) private var language

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(Theme.Fonts.body(16, weight: .bold, lang: language.current))
            .foregroundStyle(Theme.Colors.onAccent)
            .frame(maxWidth: .infinity, minHeight: 44)
            .background(configuration.isPressed ? Theme.Colors.accentSolidActive : Theme.Colors.accentSolid)
            .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.lg, style: .continuous))
            .opacity(isEnabled ? 1 : 0.5)
    }
}

/// The outline button (hairline border, text in the primary colour).
struct OutlineButtonStyle: ButtonStyle {
    @Environment(AppLanguage.self) private var language

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(Theme.Fonts.body(15, weight: .semibold, lang: language.current))
            .foregroundStyle(Theme.Colors.textPrimary)
            .frame(maxWidth: .infinity, minHeight: 44)
            .background(configuration.isPressed ? Theme.Colors.subtle : Theme.Colors.surface)
            .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.lg, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: Theme.Radius.lg, style: .continuous).stroke(Theme.Colors.border, lineWidth: 1))
    }
}

/// The warm outline text field (border.default, bg.surface, lg radius).
struct FieldStyle: ViewModifier {
    @Environment(AppLanguage.self) private var language

    func body(content: Content) -> some View {
        content
            .font(Theme.Fonts.body(16, lang: language.current))
            .foregroundStyle(Theme.Colors.textPrimary)
            .padding(.horizontal, Theme.Space.s3)
            .frame(minHeight: 44)
            .background(Theme.Colors.surface)
            .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.lg, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: Theme.Radius.lg, style: .continuous).stroke(Theme.Colors.border, lineWidth: 1))
    }
}

extension View {
    func fieldStyle() -> some View { modifier(FieldStyle()) }
}

/// A form label above a field.
struct FieldLabel: View {
    let text: String
    @Environment(AppLanguage.self) private var language

    var body: some View {
        Text(text)
            .font(Theme.Fonts.body(14, weight: .semibold, lang: language.current))
            .foregroundStyle(Theme.Colors.textPrimary)
    }
}
