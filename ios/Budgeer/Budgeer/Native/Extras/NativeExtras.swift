// The iPhone extras, as they would look (designs only, nothing wired yet):
// the Home Screen widgets (small: this month's spend and what's left over;
// medium: the top budgets), the Siri & Shortcuts phrases, and the optional
// Face ID lock screen.
import SwiftUI

// MARK: Widgets

/// The widgets on a Home Screen, small and medium, with their names beneath.
struct NativeWidgetsGallery: View {
    let sample: NativeSample
    @Environment(AppLanguage.self) private var language
    @Environment(\.colorScheme) private var scheme

    var body: some View {
        ZStack {
            wallpaper.ignoresSafeArea()
            VStack(alignment: .leading, spacing: 26) {
                Text(language.t("ios:native.widgets.title"))
                    .font(NativeStyle.title(30, lang: sample.lang))
                    .foregroundStyle(Color.white)
                    .padding(.top, 16)
                HStack(alignment: .top, spacing: 22) {
                    labelled(language.t("ios:native.widgets.small")) {
                        NativeSmallWidget(sample: sample)
                    }
                    labelled(language.t("ios:native.widgets.small")) {
                        NativeSmallRingWidget(sample: sample)
                    }
                }
                labelled(language.t("ios:native.widgets.medium")) {
                    NativeMediumWidget(sample: sample)
                }
                HStack(spacing: 22) {
                    appIcon
                    Spacer()
                }
                Spacer()
            }
            .padding(.horizontal, 24)
        }
    }

    private var wallpaper: some View {
        LinearGradient(colors: scheme == .dark
                       ? [Color(hex: 0x2A1712), Color(hex: 0x1A1714), Color(hex: 0x3B2410)]
                       : [Color(hex: 0xFF9A7A), Color(hex: 0xF95D38), Color(hex: 0xFBB324)],
                       startPoint: .topLeading, endPoint: .bottomTrailing)
    }

    private var appIcon: some View {
        VStack(spacing: 6) {
            BrandMark(size: 40)
                .frame(width: 64, height: 64)
                .background(Color.white, in: RoundedRectangle(cornerRadius: 15, style: .continuous))
            Text(verbatim: "Budgeer")
                .font(.caption2.weight(.medium))
                .foregroundStyle(Color.white)
        }
    }

    private func labelled<W: View>(_ title: String, @ViewBuilder widget: () -> W) -> some View {
        VStack(spacing: 7) {
            widget()
                .shadow(color: Color.black.opacity(0.18), radius: 16, x: 0, y: 8)
            Text(verbatim: "Budgeer · \(title)")
                .font(.caption2.weight(.medium))
                .foregroundStyle(Color.white.opacity(0.9))
        }
    }
}

/// The widget's own background, as WidgetKit's container gives it.
private struct WidgetFace: ViewModifier {
    var width: CGFloat
    func body(content: Content) -> some View {
        content
            .padding(16)
            .frame(width: width, height: 158, alignment: .topLeading)
            .background(NativeStyle.card, in: RoundedRectangle(cornerRadius: 24, style: .continuous))
    }
}

/// Small: this month's spend, and what's left over.
struct NativeSmallWidget: View {
    let sample: NativeSample
    @Environment(AppLanguage.self) private var language

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            HStack {
                BrandMark(size: 18)
                Spacer()
                Text(language.t("ios:native.widgets.thisMonth"))
                    .font(.caption2.weight(.semibold))
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
                    .minimumScaleFactor(0.8)
            }
            Spacer(minLength: 4)
            Text(language.t("ios:native.widgets.spent"))
                .font(.caption.weight(.medium))
                .foregroundStyle(.secondary)
            Text(sample.current.spentText)
                .font(NativeStyle.money(22, relativeTo: .title2))
                .lineLimit(1)
                .minimumScaleFactor(0.6)
            Text(language.t("ios:native.widgets.leftOver"))
                .font(.caption.weight(.medium))
                .foregroundStyle(.secondary)
                .padding(.top, 4)
            Text(sample.leftOver)
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(NativeStyle.positive)
                .lineLimit(1)
                .minimumScaleFactor(0.7)
        }
        .modifier(WidgetFace(width: 158))
    }
}

/// Small, the ring kind: what's left of the month's income as a ring.
struct NativeSmallRingWidget: View {
    let sample: NativeSample
    @Environment(AppLanguage.self) private var language

    var body: some View {
        VStack(spacing: 6) {
            ZStack {
                NativeRing(fraction: sample.leftOverFraction, color: NativeStyle.coral, lineWidth: 10)
                VStack(spacing: 0) {
                    Text(verbatim: "\(Int((sample.leftOverFraction * 100).rounded()))%")
                        .font(NativeStyle.money(20, relativeTo: .title2))
                    Text(language.t("ios:native.widgets.leftOver"))
                        .font(.system(size: 9, weight: .semibold))
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                        .minimumScaleFactor(0.7)
                        .frame(maxWidth: 62)
                }
            }
            .frame(width: 92, height: 92)
            Text(sample.leftOver)
                .font(.subheadline.weight(.semibold))
                .lineLimit(1)
                .minimumScaleFactor(0.7)
        }
        .frame(maxWidth: .infinity)
        .modifier(WidgetFace(width: 158))
    }
}

/// Medium: the top budgets, each with its bar.
struct NativeMediumWidget: View {
    let sample: NativeSample
    @Environment(AppLanguage.self) private var language

    var body: some View {
        VStack(alignment: .leading, spacing: 9) {
            HStack(spacing: 6) {
                BrandMark(size: 16)
                Text(language.t("ios:native.widgets.topBudgets"))
                    .font(.caption.weight(.semibold))
                Spacer()
                Text(sample.current.title)
                    .font(.caption2)
                    .foregroundStyle(.secondary)
            }
            ForEach(sample.budgets.prefix(3)) { budget in
                VStack(alignment: .leading, spacing: 4) {
                    HStack {
                        Text(budget.name).font(.caption.weight(.medium)).lineLimit(1)
                        Spacer()
                        Text(budget.note)
                            .font(.caption2.weight(.semibold))
                            .foregroundStyle(budget.tone == "negative" ? NativeStyle.negative : Color.secondary)
                            .lineLimit(1)
                    }
                    NativeBar(fraction: Double(budget.percent) / 100, color: NativeStyle.tone(budget.tone), height: 5)
                }
            }
        }
        .modifier(WidgetFace(width: 338))
    }
}

// MARK: Siri & Shortcuts

/// The App Shortcuts, as the Shortcuts app shows them, and the phrases Siri knows.
struct NativeShortcutsView: View {
    let sample: NativeSample
    @Environment(AppLanguage.self) private var language

    private var phrases: [(String, String, String)] {
        [
            ("plus.circle.fill", "ios:native.widgets.phraseAdd", "ios:native.widgets.phraseAddReply"),
            ("cup.and.saucer.fill", "ios:native.widgets.phraseCategory", "ios:native.widgets.phraseCategoryReply"),
            ("chart.pie.fill", "ios:native.widgets.phraseSpent", "ios:native.widgets.phraseSpentReply"),
            ("person.2.fill", "ios:native.widgets.phraseOwe", "ios:native.widgets.phraseOweReply"),
        ]
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 18) {
                    Text(language.t("ios:native.widgets.shortcutsNote"))
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                    LazyVGrid(columns: [GridItem(.flexible(), spacing: 12), GridItem(.flexible(), spacing: 12)], spacing: 12) {
                        ForEach(Array(phrases.enumerated()), id: \.offset) { index, phrase in
                            tile(symbol: phrase.0, text: language.t(phrase.1), index: index)
                        }
                    }
                    VStack(spacing: 0) {
                        ForEach(Array(phrases.enumerated()), id: \.offset) { index, phrase in
                            if index > 0 { Divider().padding(.leading, 52) }
                            HStack(alignment: .top, spacing: 12) {
                                Image(systemName: "waveform")
                                    .font(.body.weight(.semibold))
                                    .foregroundStyle(NativeStyle.tint)
                                    .frame(width: 28, height: 28)
                                VStack(alignment: .leading, spacing: 3) {
                                    Text(verbatim: "“\(language.t(phrase.1))”")
                                        .font(.body.weight(.semibold))
                                    Text(language.t(phrase.2))
                                        .font(.footnote)
                                        .foregroundStyle(.secondary)
                                }
                                Spacer(minLength: 0)
                            }
                            .padding(.vertical, 12)
                        }
                    }
                    .padding(.horizontal, 12)
                    .background(NativeStyle.card, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
                }
                .padding(16)
            }
            .background(NativeStyle.canvas)
            .navigationTitle(language.t("ios:native.widgets.shortcutsTitle"))
        }
    }

    private func tile(symbol: String, text: String, index: Int) -> some View {
        let palettes: [[Color]] = [
            [Theme.Palette.brand400, Theme.Palette.brand600], [Theme.Palette.amber400, Theme.Palette.amber500],
            [Color(hex: 0x3A78D4), Color(hex: 0x2E5FB0)], [Color(hex: 0x2E9B62), Color(hex: 0x217A4C)],
        ]
        return VStack(alignment: .leading) {
            Image(systemName: symbol)
                .font(.title2)
            Spacer(minLength: 8)
            Text(text)
                .font(.subheadline.weight(.semibold))
                .lineLimit(3)
                .multilineTextAlignment(.leading)
        }
        .foregroundStyle(Color.white)
        .padding(14)
        .frame(maxWidth: .infinity, minHeight: 118, alignment: .topLeading)
        .background(LinearGradient(colors: palettes[index % palettes.count], startPoint: .top, endPoint: .bottom),
                    in: RoundedRectangle(cornerRadius: 20, style: .continuous))
    }
}

// MARK: Face ID lock

/// The optional lock: the mark, a calm line, and Unlock with Face ID in glass.
struct NativeLockView: View {
    let sample: NativeSample
    @Environment(AppLanguage.self) private var language
    @State private var tries = 0

    var body: some View {
        ZStack {
            LinearGradient(colors: [Theme.Colors.accentSubtle, NativeStyle.canvas], startPoint: .top, endPoint: .center)
                .ignoresSafeArea()
            VStack(spacing: 14) {
                Spacer()
                BrandMark(size: 64)
                    .frame(width: 104, height: 104)
                    .background(NativeStyle.card, in: RoundedRectangle(cornerRadius: 26, style: .continuous))
                    .shadow(color: Color.black.opacity(0.08), radius: 20, x: 0, y: 10)
                Text(language.t("ios:native.lock.locked"))
                    .font(NativeStyle.title(26, lang: sample.lang))
                    .multilineTextAlignment(.center)
                    .padding(.top, 12)
                Text(language.t("ios:native.lock.note"))
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
                Spacer()
                Image(systemName: "faceid")
                    .font(.system(size: 58, weight: .light))
                    .foregroundStyle(NativeStyle.tint)
                    .padding(.bottom, 12)
                Button { tries += 1 } label: {
                    Text(language.t("ios:native.lock.unlock"))
                        .frame(maxWidth: .infinity)
                }
                .nativeGlassButton(prominent: true)
                Button(language.t("ios:native.lock.passcode")) {}
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(NativeStyle.tint)
                    .frame(minHeight: 44)
            }
            .padding(.horizontal, 32)
            .padding(.bottom, 12)
        }
        .sensoryFeedback(.success, trigger: tries)
    }
}
