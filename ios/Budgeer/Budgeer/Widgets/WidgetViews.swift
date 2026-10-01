// The widgets' faces, compiled into the extension (which shows them) and
// the app (whose snapshot tests draw them): Home's overview for this month
// (Spent big, then Income and Net, Net in kitMath.signTone's colour; the
// medium one adds By category's share bar, its top three and "Other" in
// kitMath.shareSwatch's colours, and a + that opens Add), the Lock Screen's
// rectangle (Spent and Net) and line (Spent), and its "+ Add" circle. Every
// figure and name is the snapshot's (the app's core wrote them); every word
// is the web's (src/locales) in the snapshot's language. Amounts are
// privacy-sensitive: the Lock Screen hides them while the iPhone is locked.
import SwiftUI
import WidgetKit

/// The words the widgets show, by the web's keys, in the app's language
/// (the snapshot's), or the phone's before there is one.
struct WidgetWords: Equatable {
    let lang: String

    init(language: String?) {
        lang = language ?? Bundle.main.preferredLocalizations.first ?? "en"
    }

    private func t(_ key: String) -> String { L10n.string(key, lang: lang) }

    var thisMonth: String { t("transactions:periods.thisMonth") }
    var spent: String { t("dashboard:overview.spent") }
    var income: String { t("dashboard:overview.income") }
    var net: String { t("dashboard:overview.net") }
    var byCategory: String { t("ios:native.home.byCategory") }
    var add: String { t("ios:native.tabs.add") }
    /// No figures for this month on the phone (signed out, or a new month).
    var stale: String { t("ios:native.widget.stale") }
}

/// The home-screen widget's sizes.
enum MonthWidgetSize {
    case small
    case medium
}

/// "This month" with the mark, in the tint.
private struct WidgetHeader: View {
    let words: WidgetWords

    var body: some View {
        HStack(spacing: 5) {
            BrandMark(size: 15)
            Text(words.thisMonth)
                .font(.system(size: 13, weight: .semibold))
                .foregroundStyle(NativeStyle.tint)
                .lineLimit(1)
                .minimumScaleFactor(0.8)
        }
    }
}

private struct Dot: View {
    let color: Color

    var body: some View {
        Circle().fill(color).frame(width: 8, height: 8)
    }
}

/// The home-screen widget: small (the overview) or medium (and By category).
struct MonthWidgetView: View {
    /// This month's figures, or nil: open the app.
    let figures: WidgetSnapshot?
    let words: WidgetWords
    let size: MonthWidgetSize

    var body: some View {
        if let figures {
            HStack(alignment: .top, spacing: 12) {
                overview(figures)
                    .frame(width: size == .medium ? 126 : nil)
                    .frame(maxWidth: size == .medium ? nil : .infinity, alignment: .leading)
                if size == .medium {
                    Rectangle().fill(Theme.Colors.subtle).frame(width: 1)
                    categories(figures)
                }
            }
        } else {
            VStack(alignment: .leading, spacing: 10) {
                WidgetHeader(words: words)
                Spacer(minLength: 0)
                Text(words.stale)
                    .font(.system(size: 13, weight: .medium))
                    .foregroundStyle(Theme.Colors.textMuted)
                    .lineLimit(3)
                    .minimumScaleFactor(0.8)
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        }
    }

    /// Spent big, then Income and Net (Home's hero).
    private func overview(_ figures: WidgetSnapshot) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            WidgetHeader(words: words)
            Spacer(minLength: 8)
            HStack(spacing: 5) {
                Dot(color: Theme.Palette.brand500)
                Text(words.spent)
            }
            .font(.system(size: 12))
            .foregroundStyle(Theme.Colors.textMuted)
            Text(figures.spent)
                .font(NativeStyle.money(26, relativeTo: .title))
                .monospacedDigit()
                .lineLimit(1)
                .minimumScaleFactor(0.5)
                .privacySensitive()
            Spacer(minLength: 6)
            line(words.income, figures.income, dot: Theme.Colors.textMuted, color: .primary)
                .padding(.bottom, 4)
            line(words.net, figures.net, dot: NativeStyle.tone(figures.netTone), color: NativeStyle.tone(figures.netTone))
        }
        .accessibilityElement(children: .combine)
    }

    private func line(_ label: String, _ value: String, dot: Color, color: Color) -> some View {
        HStack(spacing: 5) {
            Dot(color: dot)
            Text(label).foregroundStyle(Theme.Colors.textMuted).lineLimit(1)
            Spacer(minLength: 4)
            Text(value)
                .font(NativeStyle.money(12.5, relativeTo: .caption))
                .monospacedDigit()
                .foregroundStyle(color)
                .lineLimit(1)
                .minimumScaleFactor(0.7)
                .privacySensitive()
        }
        .font(.system(size: 12))
    }

    /// By category: the share bar, the top three and "Other", and the + (Add).
    private func categories(_ figures: WidgetSnapshot) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack {
                Text(words.byCategory)
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundStyle(Theme.Colors.textMuted)
                    .lineLimit(1)
                Spacer(minLength: 4)
                Link(destination: WidgetLinks.add) {
                    Image(systemName: "plus")
                        .font(.system(size: 14, weight: .bold))
                        .foregroundStyle(.white)
                        .frame(width: 30, height: 30)
                        .background(NativeStyle.solid, in: Circle())
                }
                .accessibilityLabel(Text(words.add))
            }
            .frame(height: 30)
            WidgetShareBar(bars: figures.bars)
                .padding(.top, 6)
                .padding(.bottom, 2)
            ForEach(Array(figures.bars.enumerated()), id: \.offset) { _, bar in
                let other = bar.swatch == "text.muted"
                HStack(spacing: 6) {
                    Dot(color: Theme.swatch(bar.swatch))
                    Text(bar.label)
                        .foregroundStyle(other ? Theme.Colors.textMuted : Color.primary)
                        .lineLimit(1)
                    Spacer(minLength: 4)
                    Text(bar.amount)
                        .font(NativeStyle.money(12.5, relativeTo: .caption))
                        .monospacedDigit()
                        .foregroundStyle(other ? Theme.Colors.textMuted : Color.primary)
                        .lineLimit(1)
                        .privacySensitive()
                }
                .font(.system(size: 12.5))
                .padding(.top, 6)
                .accessibilityElement(children: .combine)
            }
            Spacer(minLength: 0)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

/// The shares side by side in one rounded bar.
private struct WidgetShareBar: View {
    let bars: [WidgetSnapshot.Bar]

    var body: some View {
        GeometryReader { proxy in
            let gaps = CGFloat(max(0, bars.count - 1)) * 2
            HStack(spacing: 2) {
                ForEach(Array(bars.enumerated()), id: \.offset) { _, bar in
                    Rectangle()
                        .fill(Theme.swatch(bar.swatch))
                        .frame(width: max(2, (proxy.size.width - gaps) * CGFloat(bar.share) / 100))
                }
            }
        }
        .frame(height: 8)
        .background(Theme.Colors.subtle)
        .clipShape(Capsule())
        .accessibilityHidden(true)
    }
}

/// The Lock Screen's rectangle: "This month", Spent and Net.
struct LockMonthView: View {
    let figures: WidgetSnapshot?
    let words: WidgetWords

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(spacing: 5) {
                BrandMark(size: 14, mono: .white)
                Text(words.thisMonth).font(.system(size: 14, weight: .bold)).lineLimit(1)
            }
            .widgetAccentable()
            if let figures {
                row(words.spent, figures.spent).padding(.top, 2)
                row(words.net, figures.net)
            } else {
                Text(words.stale)
                    .font(.system(size: 13))
                    .lineLimit(2)
                    .minimumScaleFactor(0.8)
                    .padding(.top, 2)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityElement(children: .combine)
    }

    private func row(_ label: String, _ value: String) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: 6) {
            Text(label).font(.system(size: 14)).opacity(0.75).lineLimit(1)
            Spacer(minLength: 4)
            Text(value)
                .font(NativeStyle.money(15, relativeTo: .body))
                .monospacedDigit()
                .lineLimit(1)
                .minimumScaleFactor(0.6)
                .privacySensitive()
        }
    }
}

/// The Lock Screen's line above the clock: "Spent €…".
struct LockInlineView: View {
    let figures: WidgetSnapshot?
    let words: WidgetWords

    var body: some View {
        if let figures {
            Text(verbatim: "\(words.spent) \(figures.spent)").privacySensitive()
        } else {
            Text(words.stale)
        }
    }
}

/// The Lock Screen's circle: "+ Add" (opens Add; it shows no figures, so it always works).
struct AddCircleView: View {
    let words: WidgetWords

    var body: some View {
        ZStack {
            AccessoryWidgetBackground()
            VStack(spacing: 1) {
                Image(systemName: "plus").font(.system(size: 24, weight: .semibold))
                Text(words.add)
                    .font(.system(size: 11, weight: .semibold))
                    .lineLimit(1)
                    .minimumScaleFactor(0.6)
                    .padding(.horizontal, 6)
            }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(Text(words.add))
    }
}
