// Home, redesigned: a large title, then the month's spend as one big figure
// with Income and Net beneath it, on pages you swipe sideways between
// months (no dropdown). Below it, iOS inset-grouped sections: Budgets,
// Coming up, By category and Meal vouchers, three or four rows each and a
// "See all" that pushes the whole list. Pull to refresh gives a tap of
// haptics; the figures roll and the bars ease when the month changes.
import SwiftUI

struct NativeHomeView: View {
    let sample: NativeSample
    @Environment(AppLanguage.self) private var language
    @State private var month: String?
    @State private var refreshes = 0

    var body: some View {
        NavigationStack {
            List {
                Section {
                    hero
                }
                .listRowInsets(EdgeInsets())
                .listRowBackground(Color.clear)

                if sample.months.dropLast().last?.allHeld == true {
                    Section { celebration }
                        .listRowBackground(Theme.Colors.accentSubtle)
                }

                Section {
                    ForEach(sample.budgets.prefix(3)) { budget in
                        NativeBudgetRow(budget: budget)
                    }
                } header: {
                    NativeSectionHeader(title: language.t("shell:nav.budgets"), seeAll: seeAll) {
                        NativeListPage(title: language.t("shell:nav.budgets")) {
                            ForEach(sample.budgets) { NativeBudgetRow(budget: $0) }
                        }
                    }
                }
                .listRowBackground(NativeStyle.card)

                Section {
                    ForEach(sample.upcoming.prefix(3)) { item in
                        NativeUpcomingRow(item: item)
                    }
                } header: {
                    NativeSectionHeader(title: language.t("ios:native.home.comingUp"), seeAll: seeAll) {
                        NativeListPage(title: language.t("ios:native.home.comingUp")) {
                            ForEach(sample.upcoming) { NativeUpcomingRow(item: $0) }
                        }
                    }
                }
                .listRowBackground(NativeStyle.card)

                Section {
                    NativeShareBar(shares: sample.shares)
                        .padding(.vertical, 6)
                    ForEach(sample.shares.prefix(4)) { share in
                        NativeShareRow(share: share)
                    }
                } header: {
                    NativeSectionHeader(title: language.t("ios:native.home.byCategory"), seeAll: seeAll) {
                        NativeListPage(title: language.t("ios:native.home.byCategory")) {
                            ForEach(sample.shares) { NativeShareRow(share: $0) }
                        }
                    }
                }
                .listRowBackground(NativeStyle.card)

                Section {
                    HStack(spacing: 12) {
                        NativeIconTile(symbol: "creditcard.fill", color: NativeStyle.amber, size: 34)
                        Text(language.t("ios:native.home.cardBalance"))
                        Spacer()
                        Text(sample.voucherBalance)
                            .font(.body.weight(.semibold))
                            .monospacedDigit()
                    }
                    HStack(spacing: 12) {
                        NativeIconTile(symbol: "calendar", color: NativeStyle.positive, size: 34)
                        Text(sample.voucherNext)
                        Spacer()
                        Text(sample.voucherTopUp)
                            .font(.body.weight(.semibold))
                            .foregroundStyle(NativeStyle.positive)
                            .monospacedDigit()
                    }
                } header: {
                    NativeSectionHeader(title: language.t("shell:nav.vouchers"), seeAll: seeAll) {
                        NativeListPage(title: language.t("shell:nav.vouchers")) { EmptyView() }
                    }
                }
                .listRowBackground(NativeStyle.card)
            }
            .listStyle(.insetGrouped)
            .listSectionSpacing(20)
            .scrollContentBackground(.hidden)
            .background(NativeStyle.canvas)
            .navigationTitle(language.t("shell:nav.home"))
            .toolbar {
                NativeAccountItems(me: sample.me, unread: true, bellLabel: language.t("notifications:bell.title"),
                                   profileLabel: language.t("ios:native.home.profile"))
            }
            .refreshable { refreshes += 1 }
            .sensoryFeedback(.success, trigger: refreshes)
            .sensoryFeedback(.selection, trigger: month)
        }
    }

    private var seeAll: String { language.t("ios:native.home.seeAll") }

    private var shownIndex: Int {
        sample.months.firstIndex { $0.id == month } ?? sample.months.count - 1
    }

    // MARK: The paging hero

    private var hero: some View {
        VStack(spacing: 10) {
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 0) {
                    ForEach(sample.months) { item in
                        NativeMonthHero(month: item)
                            .containerRelativeFrame(.horizontal)
                            .id(item.id)
                    }
                }
                .scrollTargetLayout()
            }
            .scrollTargetBehavior(.paging)
            .scrollPosition(id: $month)
            .defaultScrollAnchor(.trailing)
            .frame(height: 196)

            HStack(spacing: 7) {
                ForEach(Array(sample.months.enumerated()), id: \.offset) { index, _ in
                    Circle()
                        .fill(index == shownIndex ? NativeStyle.tint : Color.primary.opacity(0.18))
                        .frame(width: 7, height: 7)
                }
            }
            .accessibilityHidden(true)
        }
        .padding(.bottom, 6)
        .accessibilityElement(children: .contain)
        .accessibilityAdjustableAction { direction in
            let next = direction == .increment ? shownIndex + 1 : shownIndex - 1
            if sample.months.indices.contains(next) { month = sample.months[next].id }
        }
    }

    private var celebration: some View {
        HStack(alignment: .top, spacing: 12) {
            Image(systemName: "party.popper.fill")
                .font(.title2)
                .foregroundStyle(NativeStyle.coral, NativeStyle.amber)
                .symbolRenderingMode(.palette)
            VStack(alignment: .leading, spacing: 2) {
                Text(language.t("ios:native.home.allHeld"))
                    .font(.subheadline.weight(.semibold))
                Text(language.t("ios:native.home.allHeldNote", ["count": .int(sample.budgets.count)]))
                    .font(.footnote)
                    .foregroundStyle(.secondary)
            }
        }
        .padding(.vertical, 4)
    }
}

/// One month's page of the hero: the month, the big spend, Income and Net.
struct NativeMonthHero: View {
    let month: NativeSample.Month
    @Environment(AppLanguage.self) private var language

    var body: some View {
        VStack(spacing: 4) {
            Text(month.title)
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(NativeStyle.tint)
            Text(language.t(month.current ? "ios:native.home.spentThisMonth" : "ios:native.home.spentIn"))
                .font(.subheadline)
                .foregroundStyle(.secondary)
            NativeMoney(text: month.spentText, value: month.spent, font: NativeStyle.money(46))
                .padding(.bottom, 8)
            HStack(spacing: 10) {
                stat(language.t("dashboard:overview.income"), month.incomeText, value: month.income, color: .primary)
                stat(language.t("dashboard:overview.net"), month.netText, value: month.net,
                     color: month.net >= 0 ? NativeStyle.positive : NativeStyle.negative)
            }
        }
        .padding(.horizontal, 4)
        .frame(maxWidth: .infinity)
    }

    private func stat(_ label: String, _ text: String, value: Int, color: Color) -> some View {
        VStack(spacing: 2) {
            Text(label)
                .font(.footnote)
                .foregroundStyle(.secondary)
            NativeMoney(text: text, value: value, font: .headline, color: color)
        }
        .frame(maxWidth: .infinity, minHeight: 58)
        .background(NativeStyle.card, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
    }
}

// MARK: Rows

struct NativeBudgetRow: View {
    let budget: NativeSample.Budget

    var body: some View {
        VStack(alignment: .leading, spacing: 9) {
            HStack(spacing: 12) {
                CategoryBadge(look: budget.look, size: 34)
                VStack(alignment: .leading, spacing: 2) {
                    Text(budget.name)
                        .font(.body.weight(.medium))
                        .lineLimit(1)
                    Text(budget.meta)
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                        .monospacedDigit()
                        .lineLimit(1)
                }
                Spacer(minLength: 8)
                VStack(alignment: .trailing, spacing: 2) {
                    Text(verbatim: "\(budget.percent)%")
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(budget.tone == nil ? Color.primary : NativeStyle.tone(budget.tone))
                        .monospacedDigit()
                    Text(budget.note)
                        .font(.caption)
                        .foregroundStyle(budget.tone == "negative" ? NativeStyle.negative : Color.secondary)
                        .lineLimit(1)
                }
            }
            NativeBar(fraction: Double(budget.percent) / 100, color: NativeStyle.tone(budget.tone))
        }
        .padding(.vertical, 4)
    }
}

struct NativeUpcomingRow: View {
    let item: NativeSample.Upcoming

    var body: some View {
        HStack(spacing: 12) {
            CategoryBadge(look: item.look, size: 34)
            VStack(alignment: .leading, spacing: 2) {
                Text(item.name).lineLimit(1)
                Text(item.when)
                    .font(.footnote)
                    .foregroundStyle(.secondary)
            }
            Spacer(minLength: 8)
            Text(item.amount)
                .font(.body.weight(.semibold))
                .monospacedDigit()
        }
    }
}

struct NativeShareRow: View {
    let share: NativeSample.Share

    var body: some View {
        HStack(spacing: 12) {
            Circle().fill(share.color).frame(width: 10, height: 10)
            Text(share.name).lineLimit(1)
            Spacer(minLength: 8)
            Text(share.amount)
                .font(.body.weight(.semibold))
                .monospacedDigit()
            Text(verbatim: "\(share.percent)%")
                .font(.footnote)
                .foregroundStyle(.secondary)
                .monospacedDigit()
                .frame(minWidth: 34, alignment: .trailing)
        }
    }
}

/// The month's spend in one bar, a segment per category in its colour.
struct NativeShareBar: View {
    let shares: [NativeSample.Share]

    var body: some View {
        GeometryReader { proxy in
            let gaps = CGFloat(max(0, shares.count - 1)) * 3
            HStack(spacing: 3) {
                ForEach(shares) { share in
                    RoundedRectangle(cornerRadius: 3, style: .continuous)
                        .fill(share.color)
                        .frame(width: max(4, (proxy.size.width - gaps) * CGFloat(share.percent) / 100))
                }
            }
        }
        .frame(height: 14)
        .clipShape(Capsule())
        .accessibilityHidden(true)
    }
}

/// A "See all" page: the section's whole list under a large title.
struct NativeListPage<Rows: View>: View {
    let title: String
    @ViewBuilder var rows: () -> Rows

    var body: some View {
        List {
            Section { rows() }
                .listRowBackground(NativeStyle.card)
        }
        .listStyle(.insetGrouped)
        .scrollContentBackground(.hidden)
        .background(NativeStyle.canvas)
        .navigationTitle(title)
    }
}
