// The Insights page (from More), after the web's first two cards: "Where
// your money went" (the picked month's spending as a stacked bar and its
// legend, then the last six months' spending as bars: tap one to split that
// month) and "Income vs expenses" (this month's income and spend, what's
// left over, the change from last month, and the six months side by side).
// Every figure and word is InsightsFigures'; Swift Charts only draws.
import BudgeerCore
import Charts
import SwiftUI

@MainActor
struct InsightsView: View {
    let model: InsightsModel
    @Environment(AppLanguage.self) private var language

    var body: some View {
        ScrollView {
            VStack(spacing: Theme.Space.s4) {
                switch model.state {
                case .loading:
                    Panel { ProgressView().frame(maxWidth: .infinity, minHeight: 160) }
                case .failed(let message):
                    Panel { LoadErrorBlock(message: message) { await model.load() } }
                case .loaded(let figures):
                    spending(figures)
                    income(figures)
                }
            }
            .padding(Theme.Space.s4)
        }
        .refreshable { await model.load() }
        .background(Theme.Colors.canvas.ignoresSafeArea())
        .navigationTitle(language.t("insights:title"))
        .navigationBarTitleDisplayMode(.inline)
        .task(id: language.current) { await model.load() }
    }

    // MARK: Where your money went

    private func spending(_ figures: InsightsFigures) -> some View {
        Panel {
            VStack(alignment: .leading, spacing: Theme.Space.s4) {
                CardTitle(title: language.t("insights:spending.title"), subtitle: figures.monthLabel)
                if figures.shares.isEmpty {
                    Note(text: language.t("insights:spending.empty"))
                } else {
                    StackedShares(items: figures.shares)
                }
                if figures.hasTrend {
                    SectionHead(label: language.t("insights:lastMonths"), aside: figures.bars.aside)
                    Chart {
                        ForEach(Array(figures.bars.bars.enumerated()), id: \.offset) { index, bar in
                            BarMark(x: .value("month", bar.label), y: .value("spent", bar.value), width: .ratio(0.6))
                                .foregroundStyle(index == figures.picked ? Theme.Palette.brand500 : Theme.Colors.trendRest)
                                .cornerRadius(5)
                                .accessibilityLabel(Text(bar.ariaLabel))
                        }
                    }
                    .chartYAxis(.hidden)
                    .chartXAxis {
                        AxisMarks { _ in AxisValueLabel().foregroundStyle(Theme.Colors.textMuted) }
                    }
                    .chartOverlay { proxy in
                        GeometryReader { geometry in
                            Rectangle().fill(Color.clear).contentShape(Rectangle())
                                .gesture(SpatialTapGesture().onEnded { tap in
                                    guard let plot = proxy.plotFrame else { return }
                                    let x = tap.location.x - geometry[plot].origin.x
                                    if let label: String = proxy.value(atX: x),
                                       let index = figures.bars.bars.firstIndex(where: { $0.label == label }) {
                                        model.pick(index)
                                    }
                                })
                        }
                    }
                    .frame(height: 120)
                    .accessibilityIdentifier("insights.months")
                }
            }
        }
    }

    // MARK: Income vs expenses

    private func income(_ figures: InsightsFigures) -> some View {
        Panel {
            VStack(alignment: .leading, spacing: Theme.Space.s4) {
                HStack(alignment: .firstTextBaseline) {
                    CardTitle(title: language.t("insights:income.title"), subtitle: nil)
                    Spacer(minLength: Theme.Space.s2)
                    if let delta = figures.income.delta {
                        HStack(spacing: 2) {
                            Image(systemName: delta > 0 ? "arrow.up.right" : "arrow.down.right")
                            Text("\(abs(delta))%")
                            Text(language.t("insights:income.vsLastMonth"))
                                .foregroundStyle(Theme.Colors.textMuted)
                                .fontWeight(.regular)
                        }
                        .font(Theme.Fonts.body(13, weight: .bold, lang: language.current))
                        .foregroundStyle(delta > 0 ? Theme.Colors.negative : Theme.Colors.positive)
                    }
                }
                SectionHead(label: language.t("insights:thisMonth"), aside: nil)
                HStack(spacing: Theme.Space.s3) {
                    BalanceTile(label: language.t("insights:income.income"), value: figures.income.income, tone: .positive)
                    BalanceTile(label: language.t("insights:income.spent"), value: figures.income.spent)
                }
                HStack {
                    Text(language.t("insights:income.leftOver"))
                        .font(Theme.Fonts.body(14, weight: .semibold, lang: language.current))
                        .foregroundStyle(Theme.Colors.textMuted)
                    Spacer()
                    Text(figures.income.net.text)
                        .font(Theme.Fonts.heading(18, weight: .bold, lang: language.current))
                        .foregroundStyle(tone(figures.income.net.tone))
                }
                .accessibilityElement(children: .combine)
                if figures.hasTrend {
                    SectionHead(label: language.t("insights:lastMonths"), aside: nil)
                    let income = language.t("insights:income.income")
                    let expenses = language.t("insights:income.expenses")
                    Chart {
                        ForEach(Array(figures.chart.enumerated()), id: \.offset) { _, month in
                            BarMark(x: .value("month", month.label), y: .value("amount", month.income))
                                .foregroundStyle(by: .value("series", income))
                                .position(by: .value("series", income))
                                .cornerRadius(3)
                            BarMark(x: .value("month", month.label), y: .value("amount", month.expense))
                                .foregroundStyle(by: .value("series", expenses))
                                .position(by: .value("series", expenses))
                                .cornerRadius(3)
                        }
                    }
                    .chartForegroundStyleScale([income: Theme.Colors.positive, expenses: Theme.Palette.brand500])
                    .chartYAxis {
                        // The web's tick labels ("1.6k", "1,6 χιλ."): chartAxis.axisTick.
                        AxisMarks(position: .leading) { value in
                            AxisGridLine()
                            AxisValueLabel {
                                if let amount = value.as(Double.self) {
                                    Text(Self.axisTick(amount)).foregroundStyle(Theme.Colors.textMuted)
                                }
                            }
                        }
                    }
                    .chartLegend(position: .bottom)
                    .frame(height: 220)
                } else {
                    Note(text: language.t("insights:income.empty"))
                }
            }
        }
    }

    private func tone(_ name: String) -> Color {
        switch name {
        case "positive": return Theme.Colors.positive
        case "negative": return Theme.Colors.negative
        default: return Theme.Colors.textMuted
        }
    }

    /// A y-axis tick in major units, worded by the core as the web's money charts word it.
    static func axisTick(_ amount: Double) -> String {
        (try? BudgeerCore.shared.call("chartAxis", "axisTick", [amount]) as String) ?? ""
    }
}

/// A card's heading and its muted subtitle.
private struct CardTitle: View {
    let title: String
    let subtitle: String?
    @Environment(AppLanguage.self) private var language

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(title)
                .font(Theme.Fonts.heading(16, weight: .semibold, lang: language.current))
                .foregroundStyle(Theme.Colors.textPrimary)
            if let subtitle {
                Text(subtitle)
                    .font(Theme.Fonts.body(13, lang: language.current))
                    .foregroundStyle(Theme.Colors.textMuted)
            }
        }
    }
}

/// The web's SectionLabel: a small caps label with an aside at the end.
private struct SectionHead: View {
    let label: String
    let aside: String?
    @Environment(AppLanguage.self) private var language

    var body: some View {
        HStack {
            Text(label.capsLabel)
                .font(Theme.Fonts.body(11, weight: .bold, lang: language.current))
                .kerning(0.6)
                .foregroundStyle(Theme.Colors.textMuted)
            Spacer(minLength: Theme.Space.s2)
            if let aside {
                Text(aside)
                    .font(Theme.Fonts.body(13, weight: .semibold, lang: language.current))
                    .foregroundStyle(Theme.Colors.textPrimary)
            }
        }
    }
}

/// The web's StackedBar and ShareLegend: the shares side by side in one bar,
/// then a two-column legend. Colours by position (kitMath.shareSwatch), "Other" muted.
private struct StackedShares: View {
    let items: [ShareItem]
    @Environment(AppLanguage.self) private var language

    var body: some View {
        VStack(alignment: .leading, spacing: Theme.Space.s3) {
            GeometryReader { geometry in
                HStack(spacing: 2) {
                    ForEach(Array(items.enumerated()), id: \.offset) { index, item in
                        Rectangle()
                            .fill(StackedShares.swatch(index, item))
                            .frame(width: max(2, (geometry.size.width - CGFloat(items.count - 1) * 2) * CGFloat(item.share) / 100))
                    }
                }
            }
            .frame(height: 12)
            .clipShape(Capsule())
            LazyVGrid(columns: [GridItem(.flexible(), alignment: .leading), GridItem(.flexible(), alignment: .leading)],
                      spacing: Theme.Space.s2) {
                ForEach(Array(items.enumerated()), id: \.offset) { index, item in
                    HStack(spacing: Theme.Space.s2) {
                        Circle().fill(StackedShares.swatch(index, item)).frame(width: 8, height: 8)
                        Text(item.label)
                            .font(Theme.Fonts.body(13, lang: language.current))
                            .foregroundStyle(Theme.Colors.textPrimary)
                            .lineLimit(1)
                        Text("\(item.share)%")
                            .font(Theme.Fonts.body(13, weight: .semibold, lang: language.current))
                            .foregroundStyle(Theme.Colors.textMuted)
                    }
                    .accessibilityElement(children: .combine)
                }
            }
        }
    }

    /// kitMath.shareSwatch's colour tokens (coral and amber first; "Other" muted).
    private static let tokens: [String: Color] = [
        "brand.500": Theme.Palette.brand500, "amber.400": Theme.Palette.amber400, "brand.300": Theme.Palette.brand300,
        "amber.600": Color(hex: 0xD97A06), "chart.5": Color(hex: 0xF6C453), "chart.6": Color(hex: 0xC2703D),
        "chart.3": Color(hex: 0xEF8A5A), "text.muted": Theme.Colors.textMuted,
    ]

    static func swatch(_ index: Int, _ item: ShareItem) -> Color {
        let token: String = (try? BudgeerCore.shared.call("kitMath", "shareSwatch", [index, item.name])) ?? "brand.500"
        return tokens[token] ?? Theme.Palette.brand500
    }
}
