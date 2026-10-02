// The widgets at their sizes on an iPhone 17 (small 170 × 170, medium
// 364 × 170 and large 364 × 382 on the Home Screen; the Lock Screen's circle
// 76 × 76, rectangle 172 × 76 and line), with Home's fixture as the snapshot
// the app writes: "widgets" with this month's figures, "widgets-stale" with
// none (signed out, or a new month: open the app), "widgets-large" the large
// one with a month's budgets read. The Lock Screen ones are drawn white
// on a dark wallpaper, as the system tints them. The iPad's (large and extra
// large) are in SnapshotTests+iPad.swift.
import SwiftUI
import XCTest
import BudgeerCore
@testable import Budgeer

extension SnapshotTests {
    func testWidgetSnapshots() async throws {
        let fixture = try HomeFixture.load()
        for (lang, dark) in SnapshotTests.variants {
            _ = language(lang)
            let snapshot = try WidgetSync.snapshot(fixture.homeInput(), written: fixture.now, core: .shared)
            let words = WidgetWords(language: lang)
            try await shots(WidgetBoard(figures: snapshot, words: words), name: "widgets", lang: lang, dark: dark)
            try await shots(WidgetBoard(figures: nil, words: words), name: "widgets-stale", lang: lang, dark: dark)
            try await shots(HomeScreenWidgets(figures: try widgetSnapshot(fixture, lang: lang), words: words,
                                              sizes: [(.large, CGSize(width: 364, height: 382))]),
                            name: "widgets-large", lang: lang, dark: dark)
        }
    }

    /// This month's snapshot with Home's Budgets card as the app reads it (the fixture's caps).
    func widgetSnapshot(_ fixture: HomeFixture, lang: String) async throws -> WidgetSnapshot {
        let home = try await homeModel(fixture, lang: lang)
        guard case .loaded(let card) = home.budgets else { throw XCTSkip("Home's budgets didn't load") }
        return try WidgetSync.snapshot(fixture.homeInput(), budgets: card, written: fixture.now, core: .shared)
    }
}

/// The Home Screen's wallpaper, light or dark, behind widgets.
struct WidgetWallpaper: ViewModifier {
    @Environment(\.colorScheme) private var scheme

    func body(content: Content) -> some View {
        let colors = scheme == .dark ? [Color(hex: 0x2A1E19), Color(hex: 0x14100D)] : [Color(hex: 0xFDE3C8), Color(hex: 0xF9B79C)]
        return content
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
            .background(LinearGradient(colors: colors, startPoint: .topLeading, endPoint: .bottomTrailing).ignoresSafeArea())
    }
}

/// A Home Screen widget's card: its margins and the surface.
struct WidgetCard<Content: View>: View {
    @ViewBuilder var content: () -> Content

    var body: some View {
        content()
            .padding(16)
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .background(Theme.Colors.surface, in: RoundedRectangle(cornerRadius: 22, style: .continuous))
            .shadow(color: .black.opacity(0.1), radius: 9, y: 6)
    }
}

/// Home Screen widgets of the sizes given, one under another, on the wallpaper.
struct HomeScreenWidgets: View {
    let figures: WidgetSnapshot?
    let words: WidgetWords
    let sizes: [(MonthWidgetSize, CGSize)]

    var body: some View {
        VStack(alignment: .leading, spacing: 22) {
            ForEach(sizes.indices, id: \.self) { index in
                WidgetCard { MonthWidgetView(figures: figures, words: words, size: sizes[index].0) }
                    .frame(width: sizes[index].1.width, height: sizes[index].1.height)
            }
        }
        .padding(.horizontal, 19)
        .padding(.top, 70)
        .modifier(WidgetWallpaper())
    }
}

/// The widgets laid out as they sit on the Home Screen and the Lock Screen.
private struct WidgetBoard: View {
    let figures: WidgetSnapshot?
    let words: WidgetWords

    var body: some View {
        VStack(alignment: .leading, spacing: 22) {
            HStack(alignment: .top, spacing: 24) {
                WidgetCard { MonthWidgetView(figures: figures, words: words, size: .small) }
                    .frame(width: 170, height: 170)
                Spacer(minLength: 0)
            }
            WidgetCard { MonthWidgetView(figures: figures, words: words, size: .medium) }
                .frame(width: 364, height: 170)
            VStack(spacing: 18) {
                LockInlineView(figures: figures, words: words)
                    .font(.system(size: 17, weight: .semibold))
                    .lineLimit(1)
                    .frame(maxWidth: 257)
                HStack(spacing: 16) {
                    AddCircleView(words: words)
                        .frame(width: 76, height: 76)
                        .background(Color.white.opacity(0.16), in: Circle())
                    LockMonthView(figures: figures, words: words)
                        .frame(width: 172, height: 76)
                }
            }
            .foregroundStyle(.white)
            .padding(.vertical, 24)
            .frame(width: 364)
            .background(LinearGradient(colors: [Color(hex: 0x4A2A1E), Color(hex: 0x0E0A08)], startPoint: .top,
                                       endPoint: .bottom),
                        in: RoundedRectangle(cornerRadius: 22, style: .continuous))
            .environment(\.colorScheme, .dark)
        }
        .padding(.horizontal, 19)
        .padding(.top, 70)
        .modifier(WidgetWallpaper())
    }
}
