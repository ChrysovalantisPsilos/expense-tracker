// Home: a large title, then the month's spend as one big figure with Income
// and Net beneath it, on pages you swipe sideways between months. Below it,
// iOS inset-grouped sections: Budgets, the month in plain words (when its
// helper is on), Coming up (or what a past month was charged), By category
// and Meal vouchers, a few rows each and "See all" for the whole list.
// Every figure and word is HomeViewModel's (the core's); the digits roll
// and the bars ease when the month changes, a pull to refresh taps, and a
// past month that kept every budget says so with a burst of confetti.
import SwiftUI

@MainActor
struct HomeView: View {
    let model: HomeViewModel
    let chrome: PageChrome
    @Environment(AppLanguage.self) private var language
    @State private var month: String?
    @State private var showSum = false
    @State private var refreshes = 0
    @State private var celebrating = false

    private static let celebratedKey = "budgeer.celebratedMonths"

    init(model: HomeViewModel, chrome: PageChrome) {
        self.model = model
        self.chrome = chrome
        // The pager opens on the month the model is showing, not always this one.
        _month = State(initialValue: model.currentValue.isEmpty ? nil : model.currentValue)
    }

    var body: some View {
        List {
            Section { hero }
                .listRowInsets(EdgeInsets())
                .listRowBackground(Color.clear)
            switch model.state {
            case .loading:
                Section { NativeLoading() }.listRowBackground(Color.clear)
            case .failed(let message):
                Section { NativeFailed(message: message) { await model.load() } }.listRowBackground(Color.clear)
            case .loaded(let figures):
                if let error = model.refreshError {
                    Section { NativeNotice(text: error, warning: true) }
                }
                if let held = heldNote {
                    Section { heldRow(held) }
                        .listRowBackground(Theme.Colors.accentSubtle)
                }
                budgetsSection
                wordsSection
                comingUpSection(figures.recurring)
                categoriesSection(figures)
                vouchersSection
            }
        }
        .listStyle(.insetGrouped)
        .listSectionSpacing(20)
        .scrollContentBackground(.hidden)
        .background {
            ZStack {
                NativeStyle.canvas
                if celebrating { NativeConfetti() }
            }
            .ignoresSafeArea()
        }
        .nativeTabBarRoom()
        .navigationTitle(language.t("shell:nav.home"))
        .pageChrome(chrome)
        .refreshable {
            await model.refresh()
            refreshes += 1
        }
        .sensoryFeedback(.success, trigger: refreshes)
        .sensoryFeedback(.selection, trigger: month)
        .task(id: language.current) { await model.load() }
        .onChange(of: model.currentValue) { _, value in if month != value { month = value } }
        .onChange(of: month) { _, value in
            if let value, value != model.currentValue { Task { await model.setPeriod(value) } }
        }
        .onChange(of: heldNote?.title) { _, title in celebrate(title) }
        .sheet(isPresented: $showSum) { sumSheet }
    }

    // MARK: The paging hero

    private var hero: some View {
        let months = model.monthPeriods
        let shown = months.firstIndex { $0.value == (month ?? model.currentValue) } ?? (months.count - 1)
        return VStack(spacing: 10) {
            ScrollView(.horizontal, showsIndicators: false) {
                LazyHStack(spacing: 0) {
                    ForEach(months, id: \.value) { period in
                        HomeHero(period: period, figures: figures(for: period), onSum: { showSum = true })
                            .containerRelativeFrame(.horizontal)
                            .id(period.value)
                    }
                }
                .scrollTargetLayout()
            }
            .scrollTargetBehavior(.paging)
            .scrollPosition(id: $month)
            .defaultScrollAnchor(.trailing)
            .frame(height: 200)
            .accessibilityIdentifier("home.hero")

            if months.count > 1 {
                HStack(spacing: 7) {
                    ForEach(Array(months.suffix(7).enumerated()), id: \.offset) { index, _ in
                        Circle()
                            .fill(index == min(shown, months.count - 1) - max(0, months.count - 7)
                                  ? NativeStyle.tint : Color.primary.opacity(0.18))
                            .frame(width: 7, height: 7)
                    }
                }
                .accessibilityHidden(true)
            }
        }
        .padding(.bottom, 6)
        .accessibilityElement(children: .contain)
        .accessibilityAdjustableAction { direction in
            let next = direction == .increment ? shown + 1 : shown - 1
            if months.indices.contains(next) { month = months[next].value }
        }
    }

    /// The loaded figures when they are this page's month.
    private func figures(for period: HomePeriod) -> HomeFigures? {
        if case .loaded(let figures) = model.state, figures.period.value == period.value { return figures }
        return nil
    }

    // MARK: Budgets

    private var heldNote: HeldNote? {
        if case .loaded(let card) = model.budgets { return card.held }
        return nil
    }

    private func heldRow(_ held: HeldNote) -> some View {
        HStack(alignment: .top, spacing: 12) {
            Image(systemName: "party.popper.fill")
                .symbolRenderingMode(.palette)
                .foregroundStyle(NativeStyle.coral, NativeStyle.amber)
                .font(.title2)
            VStack(alignment: .leading, spacing: 2) {
                Text(held.title).font(.subheadline.weight(.semibold))
                Text(held.note).font(.footnote).foregroundStyle(.secondary)
            }
        }
        .padding(.vertical, 4)
    }

    /// Once per month a past month's note shows: the burst and a success tap.
    private func celebrate(_ title: String?) {
        guard let title else { return }
        var seen = UserDefaults.standard.stringArray(forKey: HomeView.celebratedKey) ?? []
        guard !seen.contains(title) else { return }
        seen.append(title)
        UserDefaults.standard.set(seen, forKey: HomeView.celebratedKey)
        celebrating = true
    }

    @ViewBuilder private var budgetsSection: some View {
        switch model.budgets {
        case .loading:
            EmptyView()
        case .failed:
            EmptyView()
        case .loaded(let card):
            Section {
                if card.items.isEmpty {
                    Text(card.empty).font(.subheadline).foregroundStyle(.secondary)
                    if card.canSet {
                        NavigationLink(value: AppRoute.budgets) {
                            Label(language.t("budgets:card.set"), systemImage: "plus.circle.fill")
                        }
                    }
                } else {
                    ForEach(card.items.prefix(3)) { BudgetRowView(item: $0) }
                }
            } header: {
                NativeSectionHeader(title: language.t("shell:nav.budgets"), seeAll: language.t("ios:native.seeAll"),
                                    route: .budgets)
            } footer: {
                if !card.subtitle.isEmpty { Text(card.subtitle) }
            }
            .listRowBackground(NativeStyle.card)
        }
    }

    // MARK: The month in words

    @ViewBuilder private var wordsSection: some View {
        if let words = model.words, words.offered {
            Section {
                switch words.state {
                case "writing":
                    HStack(spacing: 10) {
                        ProgressView()
                        Text(language.t("ai:summary.working")).foregroundStyle(.secondary)
                    }
                case "failed":
                    Button(language.t("ai:summary.retry")) { Task { await model.writeSummary() } }
                default:
                    ForEach(Array(words.lines.enumerated()), id: \.offset) { _, line in
                        Text(line).font(.subheadline)
                    }
                    if words.state == "stale" {
                        Button(language.t("ai:summary.update")) { Task { await model.writeSummary() } }
                    }
                }
            } header: {
                NativeSectionHeader(title: words.title)
            }
            .listRowBackground(NativeStyle.card)
        }
    }

    // MARK: Coming up

    private func comingUpSection(_ card: RecurringCard) -> some View {
        let rows = card.groups.flatMap(\.rows)
        return Section {
            if rows.isEmpty {
                Text(card.empty).font(.subheadline).foregroundStyle(.secondary)
            } else {
                ForEach(rows.prefix(4)) { ChargeRowView(row: $0) }
            }
        } header: {
            NativeSectionHeader(title: card.upcoming ? language.t("ios:native.home.comingUp") : (card.subtitle ?? ""),
                                seeAll: language.t("ios:native.seeAll"), route: .recurring)
        }
        .listRowBackground(NativeStyle.card)
    }

    // MARK: By category

    @ViewBuilder private func categoriesSection(_ figures: HomeFigures) -> some View {
        if !figures.bars.isEmpty {
            Section {
                NativeShareBar(shares: figures.bars.map { ($0.name, $0.share) })
                    .padding(.vertical, 6)
                ForEach(Array(figures.bars.prefix(4).enumerated()), id: \.offset) { index, bar in
                    CategoryShareRow(bar: bar, index: index)
                }
            } header: {
                NativeSectionHeader(title: language.t("ios:native.home.byCategory"), seeAll: language.t("ios:native.seeAll"),
                                    route: .categories)
            }
            .listRowBackground(NativeStyle.card)
        }
    }

    // MARK: Meal vouchers

    @ViewBuilder private var vouchersSection: some View {
        if let vouchers = model.vouchers {
            Section {
                HStack(spacing: 12) {
                    NativeIconTile(symbol: "creditcard.fill", color: NativeStyle.amber, size: 34)
                    Text(language.t("vouchers:balance"))
                    Spacer(minLength: 8)
                    Text(vouchers.balance)
                        .font(.body.weight(.semibold))
                        .foregroundStyle(vouchers.tone == "negative" ? NativeStyle.negative : Color.primary)
                        .monospacedDigit()
                }
                HStack(spacing: 12) {
                    NativeIconTile(symbol: "calendar", color: NativeStyle.positive, size: 34)
                    Text(vouchers.nextWhy).lineLimit(2)
                    Spacer(minLength: 8)
                    Text(vouchers.nextAmount)
                        .font(.body.weight(.semibold))
                        .foregroundStyle(NativeStyle.positive)
                        .monospacedDigit()
                }
            } header: {
                NativeSectionHeader(title: language.t("shell:nav.vouchers"))
            }
            .listRowBackground(NativeStyle.card)
        }
    }

    // MARK: How Net adds up

    private var sumSheet: some View {
        NavigationStack {
            List {
                if case .loaded(let figures) = model.state {
                    Section {
                        ForEach(figures.sum.steps, id: \.key) { step in
                            HStack {
                                Text(step.label)
                                Spacer()
                                Text(step.value).monospacedDigit()
                            }
                        }
                        HStack {
                            Text(figures.sum.total.label).fontWeight(.semibold)
                            Spacer()
                            Text(figures.sum.total.value)
                                .fontWeight(.semibold)
                                .foregroundStyle(NativeStyle.tone(figures.sum.total.tone))
                                .monospacedDigit()
                        }
                    } footer: {
                        if !figures.notes.isEmpty { Text(figures.notes.joined(separator: "\n")) }
                    }
                    .navigationTitle(figures.sum.title)
                }
            }
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button(language.t("common:actions.done")) { showSum = false }
                }
            }
        }
        .presentationDetents([.medium])
    }
}

/// One month's page of the hero: the month, the big spend, Income and Net
/// (a tap on Net shows how it adds up), and the savings line.
struct HomeHero: View {
    let period: HomePeriod
    /// nil while this month's figures load (the page shows a dash).
    let figures: HomeFigures?
    let onSum: () -> Void
    @Environment(AppLanguage.self) private var language

    var body: some View {
        VStack(spacing: 4) {
            Text(period.label)
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(NativeStyle.tint)
            Text(language.t("dashboard:overview.spent"))
                .font(.subheadline)
                .foregroundStyle(.secondary)
            if let figures {
                NativeMoney(text: figures.spent, value: figures.spentTotal, font: NativeStyle.money(46))
                    .accessibilityIdentifier("home.spent")
            } else {
                Text(verbatim: "—").font(NativeStyle.money(46)).foregroundStyle(.tertiary)
            }
            HStack(spacing: 10) {
                stat(language.t("dashboard:overview.income"), figures?.income, value: figures?.earnedTotal ?? 0,
                     color: .primary)
                Button(action: onSum) {
                    stat(language.t("dashboard:overview.net"), figures?.net, value: figures?.netTotal ?? 0,
                         color: NativeStyle.tone(figures?.netTone ?? "muted"), info: true)
                }
                .buttonStyle(.plain)
                .disabled(figures == nil)
                .accessibilityHint(figures?.sum.title ?? "")
            }
            .padding(.top, 8)
            if let saved = figures?.saved {
                Text(saved).font(.footnote).foregroundStyle(.secondary).padding(.top, 2)
            }
        }
        .padding(.horizontal, 4)
        .frame(maxWidth: .infinity)
    }

    private func stat(_ label: String, _ text: String?, value: Double, color: Color, info: Bool = false) -> some View {
        VStack(spacing: 2) {
            HStack(spacing: 3) {
                Text(label)
                if info { Image(systemName: "info.circle").imageScale(.small) }
            }
            .font(.footnote)
            .foregroundStyle(.secondary)
            NativeMoney(text: text ?? "—", value: value, font: .headline, color: text == nil ? .secondary : color)
        }
        .frame(maxWidth: .infinity, minHeight: 58)
        .background(NativeStyle.card, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
    }
}

// MARK: Rows

/// A budget: its badge and name over "€312.40 of €400.00", the percent, and
/// the bar in its tone ("Over budget" in red once over).
struct BudgetRowView: View {
    let item: BudgetItem

    var body: some View {
        VStack(alignment: .leading, spacing: 9) {
            HStack(spacing: 12) {
                CategoryBadge(look: item.look, size: 34)
                VStack(alignment: .leading, spacing: 2) {
                    HStack(alignment: .firstTextBaseline) {
                        Text(item.name).font(.body.weight(.medium)).lineLimit(1)
                        Spacer(minLength: 8)
                        Text(item.valueLabel)
                            .font(.subheadline.weight(.semibold))
                            .foregroundStyle(item.tone == nil ? Color.primary : NativeStyle.tone(item.tone))
                            .monospacedDigit()
                    }
                    HStack(alignment: .firstTextBaseline) {
                        Text(item.meta).foregroundStyle(.secondary).monospacedDigit().lineLimit(1)
                        Spacer(minLength: 6)
                        if let over = item.overLabel {
                            Text(over).foregroundStyle(NativeStyle.negative).lineLimit(1)
                        }
                    }
                    .font(.footnote)
                    .minimumScaleFactor(0.85)
                }
            }
            NativeBar(fraction: Double(item.percent) / 100, color: NativeStyle.tone(item.tone))
        }
        .padding(.vertical, 4)
        .accessibilityElement(children: .combine)
    }
}

/// A recurring charge: its badge, its name over "20 Sep · every month", the amount.
struct ChargeRowView: View {
    let row: ChargeRow

    var body: some View {
        HStack(spacing: 12) {
            CategoryBadge(look: row.look, size: 34)
            VStack(alignment: .leading, spacing: 2) {
                Text(row.title).lineLimit(1)
                Text(row.meta).font(.footnote).foregroundStyle(.secondary).lineLimit(1)
            }
            Spacer(minLength: 8)
            VStack(alignment: .trailing, spacing: 2) {
                Text(row.amount).font(.body.weight(.semibold)).monospacedDigit()
                if let hint = row.hint { Text(hint).font(.caption).foregroundStyle(.secondary) }
            }
        }
        .accessibilityElement(children: .combine)
    }
}

/// A category's (or a group's) share of the spending: its colour, badge,
/// name over its line, and the percent.
struct CategoryShareRow: View {
    let bar: HomeBar
    let index: Int

    var body: some View {
        HStack(spacing: 12) {
            if bar.group { GroupBadge(size: 34) } else { CategoryBadge(look: bar.look, size: 34) }
            VStack(alignment: .leading, spacing: 2) {
                HStack(spacing: 6) {
                    Circle().fill(NativeSwatch.color(index, bar.name)).frame(width: 8, height: 8)
                    Text(bar.label).lineLimit(1)
                }
                Text(bar.meta).font(.footnote).foregroundStyle(.secondary).lineLimit(2)
            }
            Spacer(minLength: 8)
            Text(verbatim: "\(bar.share)%")
                .font(.subheadline.weight(.semibold))
                .monospacedDigit()
        }
        .accessibilityElement(children: .combine)
    }
}

/// By category's "See all": every share of the shown month.
@MainActor
struct HomeCategoriesPage: View {
    let model: HomeViewModel
    @Environment(AppLanguage.self) private var language

    var body: some View {
        List {
            if case .loaded(let figures) = model.state {
                Section {
                    NativeShareBar(shares: figures.bars.map { ($0.name, $0.share) }).padding(.vertical, 6)
                    ForEach(Array(figures.bars.enumerated()), id: \.offset) { index, bar in
                        CategoryShareRow(bar: bar, index: index)
                    }
                } header: {
                    NativeCapsHeader(title: figures.period.label)
                }
                .listRowBackground(NativeStyle.card)
            }
        }
        .listStyle(.insetGrouped)
        .scrollContentBackground(.hidden)
        .background(NativeStyle.canvas)
        .nativeTabBarRoom()
        .navigationTitle(language.t("ios:native.home.byCategory"))
    }
}
