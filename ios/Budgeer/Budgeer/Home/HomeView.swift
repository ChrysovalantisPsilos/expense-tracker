// Home: a large title, then the month's spend as one big figure with Income
// and Net beneath it, on pages you swipe sideways between months. Below it,
// a summary first: the month in plain words (when its helper is on), Coming
// up (or what a past month was charged) as a strip of tiles, By category as
// a donut with its legend, Budgets and the Meal vouchers card, each title on
// the canvas over a rounded card without hairlines, "See all" for the whole
// list (the savings line under the figures opens Savings). Every figure and
// word is HomeViewModel's (the core's); the digits roll, the bars ease and
// the cards spring when the month changes, a pull to refresh taps, and a
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
        ScrollView {
            VStack(spacing: 18) {
                hero
                Group {
                    switch model.state {
                    case .loading:
                        NativeLoading()
                    case .failed(let message):
                        NativeFailed(message: message) { await model.load() }
                    case .loaded(let figures):
                        cards(figures)
                    }
                }
                .padding(.horizontal, 16)
            }
            .padding(.bottom, 28)
            // Cards come and go, and figures change, with one soft spring.
            .animation(HomeCardStyle.spring, value: model.state)
            .animation(HomeCardStyle.spring, value: model.budgets)
            .animation(HomeCardStyle.spring, value: model.vouchers)
            .animation(HomeCardStyle.spring, value: model.words)
        }
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

    /// The cards under the hero: the month in words, what's coming, where
    /// it went, the budgets and the vouchers.
    @ViewBuilder private func cards(_ figures: HomeFigures) -> some View {
        if let error = model.refreshError {
            NativeNotice(text: error, warning: true)
                .padding(14)
                .background(NativeStyle.card, in: HomeCardStyle.shape)
        }
        if let held = heldNote {
            heldRow(held)
                .padding(16)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(Theme.Colors.accentSubtle, in: HomeCardStyle.shape)
        }
        wordsCard
        // The tour's stops point at these cards (tourTarget).
        comingUpCard(figures.recurring).tourTarget("subscriptions")
        categoriesCard(figures).tourTarget("categories")
        budgetsCard.tourTarget("budgets")
        if let vouchers = model.vouchers {
            VoucherWallet(card: vouchers).transition(HomeCardStyle.transition)
        }
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
        .tourTarget("period", "overview")
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

    @ViewBuilder private var budgetsCard: some View {
        if case .loaded(let card) = model.budgets {
            HomeCard(title: language.t("shell:nav.budgets"), seeAll: language.t("ios:native.seeAll"), route: .budgets) {
                if card.items.isEmpty {
                    Text(card.empty).font(.subheadline).foregroundStyle(.secondary)
                    if card.canSet {
                        NavigationLink(value: AppRoute.budgets) {
                            Label(language.t("budgets:card.set"), systemImage: "plus.circle.fill")
                                .font(.subheadline.weight(.semibold))
                        }
                        .foregroundStyle(NativeStyle.tint)
                    }
                } else {
                    ForEach(card.items.prefix(3)) { item in
                        // The row opens its category's page for the month shown (BudgetRow's link).
                        NavigationLink(value: AppRoute.categoryPage(item.categoryId, model.currentValue.isEmpty ? nil
                                                                        : model.currentValue)) {
                            BudgetRowView(item: item)
                        }
                        .buttonStyle(.plain)
                    }
                }
                if !card.subtitle.isEmpty {
                    Text(card.subtitle).font(.footnote).foregroundStyle(.secondary)
                }
            }
        }
    }

    // MARK: The month in words

    @ViewBuilder private var wordsCard: some View {
        if let words = model.words, words.offered {
            HomeCard(title: words.title) {
                switch words.state {
                case "writing":
                    HStack(spacing: 10) {
                        ProgressView()
                        Text(language.t("ai:summary.working")).foregroundStyle(.secondary)
                    }
                case "failed":
                    Button(language.t("ai:summary.retry")) { Task { await model.writeSummary() } }
                        .foregroundStyle(NativeStyle.tint)
                default:
                    ForEach(Array(words.lines.enumerated()), id: \.offset) { _, line in
                        Text(line).font(.subheadline).fixedSize(horizontal: false, vertical: true)
                    }
                    if words.state == "stale" {
                        Button(language.t("ai:summary.update")) { Task { await model.writeSummary() } }
                            .foregroundStyle(NativeStyle.tint)
                    }
                }
            }
        }
    }

    // MARK: Coming up

    /// Coming up (or what a past month was charged): the charges as a
    /// sideways strip of tiles, or the empty line on a card.
    @ViewBuilder private func comingUpCard(_ card: RecurringCard) -> some View {
        let rows = card.groups.flatMap(\.rows)
        if rows.isEmpty {
            HomeCard(title: comingUpTitle(card), seeAll: language.t("ios:native.seeAll"), route: .recurring) {
                Text(card.empty).font(.subheadline).foregroundStyle(.secondary)
            }
        } else {
            HomeCard(title: comingUpTitle(card), seeAll: language.t("ios:native.seeAll"), route: .recurring,
                     bare: true) {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 10) {
                        ForEach(rows.prefix(8)) { ChargeTile(row: $0) }
                    }
                    .padding(.horizontal, 16)
                    .scrollTargetLayout()
                }
                .scrollTargetBehavior(.viewAligned)
                .scrollClipDisabled()
                .padding(.horizontal, -16)
            }
        }
    }

    private func comingUpTitle(_ card: RecurringCard) -> String {
        card.upcoming ? language.t("ios:native.home.comingUp") : (card.subtitle ?? "")
    }

    // MARK: By category

    @ViewBuilder private func categoriesCard(_ figures: HomeFigures) -> some View {
        if !figures.bars.isEmpty {
            HomeCard(title: language.t("ios:native.home.byCategory"), seeAll: language.t("ios:native.seeAll"),
                     route: .categories) {
                CategoryDonut(legend: figures.legend, spent: figures.spent, spentValue: figures.spentTotal)
            }
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
                // What was put aside, opening Savings (Dashboard's savings row).
                NavigationLink(value: AppRoute.savings) {
                    HStack(spacing: 6) {
                        Text(saved).foregroundStyle(.secondary)
                        Text(language.t("insights:netWorth.seeSavings")).fontWeight(.semibold).foregroundStyle(NativeStyle.tint)
                    }
                    .font(.footnote)
                    .lineLimit(1)
                    .minimumScaleFactor(0.8)
                }
                .buttonStyle(.plain)
                .padding(.top, 2)
                .accessibilityIdentifier("home.savings")
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
                        BarLink(bar: bar) { CategoryRankRow(bar: bar, index: index).padding(.vertical, 4) }
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
