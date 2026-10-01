// Home's By category: a donut of the four biggest and "Other" with what
// was spent in its middle, and a legend with each one's amount; and a
// category's row on its See all page (amount, share and a thin bar). The
// figures are the core's (categoryBars, bucketLabel, formatMoney); the
// colours kitMath's.
import Charts
import SwiftUI

/// A category's (or a group's) row: the badge, the name and the amount, then
/// its bar (relative to the biggest) and its share of the spending; what its
/// groups add, when they add anything, under the name.
struct CategoryRankRow: View {
    let bar: HomeBar
    let index: Int

    var body: some View {
        HStack(spacing: 12) {
            if bar.group { GroupBadge(size: 36) } else { CategoryBadge(look: bar.look, size: 36) }
            VStack(alignment: .leading, spacing: 6) {
                HStack(alignment: .firstTextBaseline, spacing: 8) {
                    Text(bar.label).font(.subheadline.weight(.medium)).lineLimit(1)
                    Spacer(minLength: 6)
                    Text(bar.amount)
                        .font(.subheadline.weight(.semibold))
                        .monospacedDigit()
                        .contentTransition(.numericText(value: bar.value))
                }
                if bar.meta != bar.amount {
                    Text(bar.meta).font(.caption).foregroundStyle(.secondary).lineLimit(2)
                }
                HStack(spacing: 10) {
                    NativeBar(fraction: bar.ratio, color: NativeSwatch.color(index, bar.name), height: 5)
                    Text(verbatim: "\(bar.share)%")
                        .font(.caption.weight(.medium))
                        .foregroundStyle(.secondary)
                        .monospacedDigit()
                        .frame(minWidth: 34, alignment: .trailing)
                }
            }
        }
        .accessibilityElement(children: .combine)
    }
}

/// The donut and its legend.
struct CategoryDonut: View {
    /// The four biggest, then "Other" (HomeFigures.legend).
    let legend: [HomeBar]
    let spent: String
    let spentValue: Double
    @Environment(AppLanguage.self) private var language

    var body: some View {
        HStack(alignment: .center, spacing: 18) {
            ZStack {
                Chart(Array(legend.enumerated()), id: \.element.name) { item in
                    SectorMark(angle: .value("spent", item.element.value), innerRadius: .ratio(0.68), angularInset: 1.5)
                        .cornerRadius(3)
                        .foregroundStyle(NativeSwatch.color(item.offset, item.element.name))
                }
                .chartLegend(.hidden)
                .animation(.smooth(duration: 0.5), value: legend)
                VStack(spacing: 0) {
                    Text(language.t("dashboard:overview.spent")).font(.caption2).foregroundStyle(.secondary)
                    Text(spent)
                        .font(NativeStyle.money(15, relativeTo: .subheadline))
                        .monospacedDigit()
                        .lineLimit(1)
                        .minimumScaleFactor(0.6)
                        .contentTransition(.numericText(value: spentValue))
                }
                .padding(.horizontal, 24)
            }
            .frame(width: 128, height: 128)
            .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 10) {
                ForEach(Array(legend.enumerated()), id: \.element.name) { index, bar in
                    HStack(spacing: 8) {
                        Circle().fill(NativeSwatch.color(index, bar.name)).frame(width: 9, height: 9)
                        Text(bar.label).font(.footnote).lineLimit(1)
                        Spacer(minLength: 4)
                        Text(bar.amount)
                            .font(.footnote.weight(.semibold))
                            .monospacedDigit()
                            .contentTransition(.numericText(value: bar.value))
                    }
                    .accessibilityElement(children: .combine)
                }
            }
        }
    }
}
