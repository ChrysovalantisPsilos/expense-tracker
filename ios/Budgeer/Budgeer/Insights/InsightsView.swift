// Insights (from More), after the web's first cards: "Where your money
// went" (the picked month's spending as a stacked bar and its shares, then
// the last six months as bars: tap one to split that month), "Spending
// abroad" when there was some, and "Income vs expenses" (this month's
// income, spend, what's left over, the change from last month, and the six
// months side by side). Every figure and word is InsightsFigures'; Swift
// Charts only draws.
import BudgeerCore
import Charts
import SwiftUI

@MainActor
struct InsightsView: View {
    let model: InsightsModel
    @Environment(AppLanguage.self) private var language

    var body: some View {
        List {
            switch model.state {
            case .loading:
                Section { NativeLoading() }.listRowBackground(Color.clear)
            case .failed(let message):
                Section { NativeFailed(message: message) { await model.load() } }.listRowBackground(Color.clear)
            case .loaded(let figures):
                spending(figures)
                if let abroad = figures.abroad { abroadSection(abroad) }
                income(figures)
            }
        }
        .listStyle(.insetGrouped)
        .scrollContentBackground(.hidden)
        .background(NativeStyle.canvas)
        .nativeTabBarRoom()
        .navigationTitle(language.t("insights:title"))
        .refreshable { await model.load() }
        .task(id: language.current) { await model.load() }
    }

    // MARK: Where your money went

    private func spending(_ figures: InsightsFigures) -> some View {
        Section {
            if figures.shares.isEmpty {
                Text(language.t("insights:spending.empty")).foregroundStyle(.secondary)
            } else {
                NativeShareBar(shares: figures.shares.map { ($0.name, $0.share) }).padding(.vertical, 6)
                ForEach(Array(figures.shares.enumerated()), id: \.offset) { index, item in
                    HStack(spacing: 10) {
                        Circle().fill(NativeSwatch.color(index, item.name)).frame(width: 10, height: 10)
                        Text(item.label).lineLimit(1)
                        Spacer()
                        Text(verbatim: "\(item.share)%").fontWeight(.semibold).monospacedDigit()
                    }
                    .accessibilityElement(children: .combine)
                }
            }
            if figures.hasTrend {
                VStack(alignment: .leading, spacing: 8) {
                    HStack {
                        Text(language.t("insights:lastMonths")).font(.footnote.weight(.semibold)).foregroundStyle(.secondary)
                        Spacer()
                        Text(figures.bars.aside).font(.footnote).foregroundStyle(.secondary)
                    }
                    Chart {
                        ForEach(Array(figures.bars.bars.enumerated()), id: \.offset) { index, bar in
                            BarMark(x: .value("month", bar.label), y: .value("spent", bar.value), width: .ratio(0.6))
                                .foregroundStyle(index == figures.picked ? Theme.Palette.brand500 : Theme.Colors.trendRest)
                                .cornerRadius(5)
                                .accessibilityLabel(Text(bar.ariaLabel))
                        }
                    }
                    .chartYAxis(.hidden)
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
                    .animation(.snappy, value: figures.picked)
                    .accessibilityIdentifier("insights.months")
                }
                .padding(.vertical, 6)
            }
        } header: {
            NativeSectionHeader(title: language.t("insights:spending.title"))
        } footer: {
            Text(figures.monthLabel)
        }
        .listRowBackground(NativeStyle.card)
        .sensoryFeedback(.selection, trigger: figures.picked)
    }

    // MARK: Spending abroad

    private func abroadSection(_ card: InsightsFigures.Abroad) -> some View {
        Section {
            ForEach(card.rows) { row in
                VStack(alignment: .leading, spacing: 2) {
                    HStack {
                        Text(row.label).fontWeight(.semibold)
                        Spacer()
                        Text(verbatim: "@ " + row.rate).font(.caption).foregroundStyle(.secondary)
                    }
                    HStack(spacing: 6) {
                        Text(row.from).foregroundStyle(.secondary)
                        Image(systemName: "arrow.right").font(.caption).foregroundStyle(.secondary)
                        Text(row.to).fontWeight(.semibold).foregroundStyle(NativeStyle.tint)
                    }
                    .font(.subheadline)
                }
                .accessibilityElement(children: .combine)
            }
            HStack {
                Text(language.t("insights:total")).foregroundStyle(.secondary)
                Spacer()
                Text(card.total).fontWeight(.semibold)
            }
        } header: {
            NativeSectionHeader(title: language.t("insights:abroad.title"))
        } footer: {
            Text([card.subtitle, card.more].compactMap { $0 }.joined(separator: " · "))
        }
        .listRowBackground(NativeStyle.card)
        .accessibilityIdentifier("insights.abroad")
    }

    // MARK: Income vs expenses

    private func income(_ figures: InsightsFigures) -> some View {
        Section {
            HStack(spacing: 10) {
                tile(language.t("insights:income.income"), figures.income.income, color: NativeStyle.positive)
                tile(language.t("insights:income.spent"), figures.income.spent, color: .primary)
            }
            .listRowInsets(EdgeInsets(top: 10, leading: 12, bottom: 10, trailing: 12))
            HStack {
                Text(language.t("insights:income.leftOver")).foregroundStyle(.secondary)
                Spacer()
                Text(figures.income.net.text).fontWeight(.semibold).foregroundStyle(NativeStyle.tone(figures.income.net.tone))
            }
            if let delta = figures.income.delta {
                // SpendDelta: up is the bad direction for spending.
                HStack {
                    Text(language.t("insights:income.vsLastMonth")).foregroundStyle(.secondary)
                    Spacer()
                    Label(String(abs(delta)) + "%", systemImage: delta > 0 ? "arrow.up.right" : "arrow.down.right")
                        .fontWeight(.semibold)
                        .foregroundStyle(delta > 0 ? NativeStyle.negative : NativeStyle.positive)
                }
            }
            if figures.hasTrend {
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
                            if let amount = value.as(Double.self) { Text(InsightsView.axisTick(amount)) }
                        }
                    }
                }
                .chartLegend(position: .bottom)
                .frame(height: 220)
                .padding(.vertical, 8)
            } else {
                Text(language.t("insights:income.empty")).foregroundStyle(.secondary)
            }
        } header: {
            NativeSectionHeader(title: language.t("insights:income.title"))
        } footer: {
            Text(language.t("insights:thisMonth"))
        }
        .listRowBackground(NativeStyle.card)
    }

    private func tile(_ label: String, _ value: String, color: Color) -> some View {
        VStack(spacing: 2) {
            Text(label).font(.footnote).foregroundStyle(.secondary)
            Text(value).font(.headline).foregroundStyle(color).monospacedDigit().lineLimit(1).minimumScaleFactor(0.7)
        }
        .frame(maxWidth: .infinity, minHeight: 58)
        .background(Theme.Colors.subtle, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
    }

    /// A y-axis tick in major units, worded by the core as the web's money charts word it.
    static func axisTick(_ amount: Double) -> String {
        (try? BudgeerCore.shared.call("chartAxis", "axisTick", [amount]) as String) ?? ""
    }
}
