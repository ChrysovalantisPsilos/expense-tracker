// Home v0, after the web's Dashboard: this month's overview (Spent as the
// hero figure, Income and Net as tiles, the savings line) and spending by
// category as ranked bars. Every string on it was formatted by the core
// (HomeFigures); the view only lays them out. Pull down to refresh.
import SwiftUI

@MainActor
struct HomeView: View {
    let model: HomeViewModel
    /// "+": the entry form (Add).
    var onAdd: () -> Void = {}
    @Environment(AppLanguage.self) private var language

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: Theme.Space.s4) {
                    switch model.state {
                    case .loading:
                        Panel { SkeletonRows() }
                    case .failed(let message):
                        Panel { LoadErrorBlock(message: message) { await model.load() } }
                    case .loaded(let figures):
                        if let error = model.refreshError {
                            Text(error)
                                .font(Theme.Fonts.body(13, lang: language.current))
                                .foregroundStyle(Theme.Colors.negative)
                                .frame(maxWidth: .infinity, alignment: .leading)
                        }
                        OverviewPanel(figures: figures)
                        CategoriesPanel(bars: figures.bars)
                    }
                }
                .padding(Theme.Space.s4)
            }
            .refreshable { await model.refresh() }
            .background(Theme.Colors.canvas.ignoresSafeArea())
            .navigationTitle(language.t("shell:nav.home"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .primaryAction) {
                    AddButton(label: language.t("transactions:ledger.add.all"), action: onAdd)
                }
            }
        }
        .task(id: language.current) { await model.load() }
    }
}

private struct OverviewPanel: View {
    let figures: HomeFigures
    @Environment(AppLanguage.self) private var language

    var body: some View {
        Panel(title: figures.period.label) {
            Figure(label: language.t("dashboard:overview.spent"), value: figures.spent)
                .accessibilityIdentifier("home.spent")
            HStack(spacing: Theme.Space.s3) {
                BalanceTile(label: language.t("dashboard:overview.income"), value: figures.income, tone: .positive)
                    .accessibilityIdentifier("home.income")
                BalanceTile(label: language.t("dashboard:overview.net"), value: figures.net, tone: tone(figures.netTone))
                    .accessibilityIdentifier("home.net")
            }
            if let saved = figures.saved {
                HStack(spacing: Theme.Space.s3) {
                    IconTile(systemName: "banknote")
                    Text(saved)
                        .font(Theme.Fonts.body(15, weight: .semibold, lang: language.current))
                        .foregroundStyle(Theme.Colors.textPrimary)
                }
                .accessibilityIdentifier("home.saved")
            }
        }
    }

    /// kitMath's tone names → the kit's tones.
    private func tone(_ name: String) -> Tone {
        switch name {
        case "positive": return .positive
        case "negative": return .negative
        default: return .muted
        }
    }
}

private struct CategoriesPanel: View {
    let bars: [HomeBar]
    @Environment(AppLanguage.self) private var language

    var body: some View {
        Panel(title: language.t("dashboard:categories.title"), icon: "chart.bar") {
            if bars.isEmpty {
                Text(language.t("dashboard:noExpenses"))
                    .font(Theme.Fonts.body(14, lang: language.current))
                    .foregroundStyle(Theme.Colors.textMuted)
            } else {
                VStack(spacing: Theme.Space.s3) {
                    ForEach(bars, id: \.name) { bar in
                        ProgressRow(title: bar.label, meta: bar.amount, ratio: bar.ratio, valueLabel: "\(bar.share)%") {
                            if bar.group { GroupBadge() } else { CategoryBadge(look: bar.look) }
                        }
                    }
                }
            }
        }
    }
}

/// Grey bars where the figures will be.
private struct SkeletonRows: View {
    var body: some View {
        VStack(alignment: .leading, spacing: Theme.Space.s3) {
            RoundedRectangle(cornerRadius: Theme.Radius.md).fill(Theme.Colors.subtle).frame(width: 120, height: 14)
            RoundedRectangle(cornerRadius: Theme.Radius.md).fill(Theme.Colors.subtle).frame(width: 200, height: 36)
            HStack(spacing: Theme.Space.s3) {
                RoundedRectangle(cornerRadius: Theme.Radius.lg).fill(Theme.Colors.subtle).frame(height: 64)
                RoundedRectangle(cornerRadius: Theme.Radius.lg).fill(Theme.Colors.subtle).frame(height: 64)
            }
        }
        .accessibilityHidden(true)
    }
}
