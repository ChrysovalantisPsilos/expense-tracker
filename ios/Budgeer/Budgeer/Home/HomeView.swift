// Home, after the web's Dashboard on a phone: "Overview" with the period
// picker, then the cards in the web's order (dashboardMath.homeCards): the
// overview (September with Numbers | In words when the month in plain words
// is on; Spent as the hero figure, Income and Net on their tiles, the
// savings line), Meal vouchers, Spending by category (chart or table, the
// top five then "Show all"), Budgets, the period's Expenses and Income ten
// at a time, and Recurring. Every string on it was formatted by the core
// (HomeFigures, HomeViewModel); the view only lays them out. Pull to refresh.
import SwiftUI

@MainActor
struct HomeView: View {
    @Bindable var model: HomeViewModel
    /// A row opens Edit with its saved row.
    var onOpen: (JSONValue) -> Void = { _ in }
    /// "+": the entry form (Add), also the empty states' "Add".
    var onAdd: () -> Void = {}
    /// The Budgets card's Manage and Set a budget.
    var onManageBudgets: () -> Void = {}
    /// The Recurring card's Manage.
    var onManageRecurring: () -> Void = {}
    @Environment(AppLanguage.self) private var language

    var body: some View {
        Page(fab: true, refresh: { await model.refresh() }) {
            PageHeader(title: language.t("dashboard:title")) {
                if !model.periods.isEmpty {
                    SelectMenu(options: model.periods.map { ($0.value, $0.label) }, value: model.currentValue, small: true,
                               label: language.t("dashboard:period")) { value in
                        Task { await model.setPeriod(value) }
                    }
                    .frame(minWidth: 140)
                    .fixedSize()
                    .accessibilityIdentifier("period")
                }
            }
            switch model.state {
            case .loading:
                Panel { OverviewSkeleton() }
                Panel(title: language.t("dashboard:categories.title"), icon: .chartBarDecreasing) {
                    SkeletonRows(count: 4, progress: true)
                }
            case .failed(let message):
                Panel { LoadErrorBlock(message: message) { await model.load() } }
            case .loaded(let figures):
                if let error = model.refreshError {
                    Note(text: error, tone: Theme.Colors.negative, size: 13)
                }
                ForEach(figures.cards, id: \.self) { card in
                    self.card(card, figures)
                }
            }
        }
        .task(id: language.current) { await model.load() }
    }

    @ViewBuilder private func card(_ id: String, _ figures: HomeFigures) -> some View {
        switch id {
        case "overview":
            OverviewPanel(model: model, figures: figures)
        case "firstEntry":
            Panel { FirstEntryBlock(add: onAdd) }
        case "vouchers":
            if let vouchers = model.vouchers { VoucherPanel(card: vouchers) }
        case "categories":
            CategoriesPanel(model: model, figures: figures, onAdd: onAdd)
        case "budgets":
            BudgetsCardPanel(state: model.budgets, onManage: onManageBudgets)
        case "expenses":
            ListPanel(list: figures.expenseList, icon: .receiptText, tone: .accent, page: $model.expensePage,
                      model: model, onOpen: onOpen)
        case "income":
            ListPanel(list: figures.incomeList, icon: .wallet, tone: .positive, page: $model.incomePage,
                      model: model, onOpen: onOpen)
        case "recurring":
            RecurringCardPanel(card: figures.recurring, onManage: onManageRecurring, onAdd: onAdd)
        default:
            EmptyView()
        }
    }
}

// MARK: Overview

@MainActor
private struct OverviewPanel: View {
    let model: HomeViewModel
    let figures: HomeFigures
    @Environment(AppLanguage.self) private var language
    @State private var info = false

    var body: some View {
        Panel {
            if let words = model.words, words.offered {
                // CardHeader: the month (or "✦ September in short"), Numbers | In words.
                HStack(spacing: Theme.Space.s3) {
                    if model.showsWords {
                        HStack(spacing: Theme.Space.s2) {
                            LucideIcon(icon: .sparkle, size: 16).foregroundStyle(Theme.Colors.accentFg)
                            Text(words.title).kitText(14, .bold)
                        }
                    } else {
                        Text(model.monthTitle).kitHeading(18)
                    }
                    Spacer(minLength: 0)
                    SegmentedControl(options: [("numbers", language.t("dashboard:overview.numbers")),
                                               ("words", language.t("dashboard:overview.words"))],
                                     value: model.showsWords ? "words" : "numbers") { model.pickTab($0) }
                        .accessibilityLabel(language.t("dashboard:overview.showAs"))
                }
                .padding(.bottom, Theme.Space.s4)
            }
            if model.showsWords, let words = model.words {
                MonthSummaryView(words: words, failed: model.summaryFailedToUpdate) {
                    Task { await model.writeSummary() }
                }
            } else {
                numbers
            }
        }
    }

    private var numbers: some View {
        VStack(alignment: .leading, spacing: Theme.Space.s4) {
            Figure(label: language.t("dashboard:overview.spent"), value: figures.spent, size: .hero,
                   labelAccessory: AnyView(InfoButton(open: $info, label: language.t("common:info"))))
                .accessibilityIdentifier("home.spent")
            VStack(spacing: Theme.Space.s2) {
                HStack(spacing: Theme.Space.s2) {
                    BalanceTile(label: language.t("dashboard:overview.income"), value: figures.income, tone: .positive, md: true)
                        .accessibilityIdentifier("home.income")
                    BalanceTile(label: language.t("dashboard:overview.net"), value: figures.net,
                                tone: Tone(name: figures.netTone), md: true)
                        .accessibilityIdentifier("home.net")
                }
                if let saved = figures.saved {
                    ItemRow(title: saved, meta: nil, vertical: Theme.Space.s1) {
                        IconTile(icon: .piggyBank)
                    }
                    .accessibilityIdentifier("home.saved")
                }
            }
            if info {
                // What Spent, Income and Net fold in (the ⓘ's box).
                VStack(alignment: .leading, spacing: Theme.Space.s2) {
                    SumStepsView(sum: figures.sum)
                    ForEach(figures.notes, id: \.self) { Text($0).kitText(12, color: Theme.Colors.textMuted) }
                }
                .padding(.horizontal, Theme.Space.s3)
                .padding(.vertical, Theme.Space.s2)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(Theme.Colors.subtle)
                .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.lg, style: .continuous))
            }
        }
    }
}

/// SumSteps: the title, each step with its signed amount, then the total
/// over a hairline in its tone.
private struct SumStepsView: View {
    let sum: NetSum

    var body: some View {
        VStack(alignment: .leading, spacing: Theme.Space.s1) {
            Text(sum.title).kitText(14, .bold)
            ForEach(sum.steps, id: \.key) { step in
                HStack(spacing: Theme.Space.s3) {
                    Text(step.label).kitText(14, color: Theme.Colors.textMuted)
                    Spacer(minLength: 0)
                    Text(step.value).kitText(14, .semibold).fixedSize()
                }
            }
            Rectangle().fill(Theme.Colors.border).frame(height: 1).padding(.top, Theme.Space.s1)
            HStack {
                Text(sum.total.label).kitText(14, .bold)
                Spacer()
                Text(sum.total.value).kitText(14, .bold, color: Tone(name: sum.total.tone).color)
            }
        }
    }
}

/// The overview's "In words" side (MonthSummary): the lines with their
/// dots, "Your totals changed" with Update, who wrote it; while writing, the
/// skeleton; when it failed, Try again.
@MainActor
private struct MonthSummaryView: View {
    let words: OverviewWords
    let failed: Bool
    let write: () -> Void
    @Environment(AppLanguage.self) private var language

    var body: some View {
        VStack(alignment: .leading, spacing: Theme.Space.s3) {
            switch words.state {
            case "writing":
                VStack(alignment: .leading, spacing: 10) {
                    SkeletonBlock(height: 12)
                    SkeletonBlock(width: 220, height: 12)
                    SkeletonBlock(width: 250, height: 12)
                }
                Note(text: language.t("ai:summary.working"), size: 14)
            case "failed":
                HStack(spacing: Theme.Space.s3) {
                    Text(language.t("ai:summary.failed")).kitText(14, color: Theme.Colors.textMuted)
                    Spacer(minLength: 0)
                    Button(language.t("ai:summary.retry"), action: write).buttonStyle(.kit(.outline, .sm, scheme: .gray))
                }
            default:
                VStack(alignment: .leading, spacing: Theme.Space.s2) {
                    ForEach(words.lines, id: \.self) { line in
                        HStack(alignment: .top, spacing: 10) {
                            Circle().fill(Theme.Colors.accentFg).frame(width: 6, height: 6).padding(.top, 8)
                            Text(line).kitText(16).fixedSize(horizontal: false, vertical: true)
                        }
                    }
                }
                if words.state == "stale" {
                    HStack(spacing: 4) {
                        Text(language.t(failed ? "ai:summary.updateFailed" : "ai:summary.stale"))
                            .kitText(14, color: Theme.Colors.textMuted)
                        Button(language.t(failed ? "ai:summary.retry" : "ai:summary.update"), action: write)
                            .buttonStyle(.kit(.link, .sm))
                    }
                    .padding(.horizontal, Theme.Space.s3)
                    .padding(.vertical, Theme.Space.s2)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(Theme.Colors.subtle)
                    .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.lg, style: .continuous))
                }
                Text(language.t("ai:summary.by")).kitText(12, color: Theme.Colors.textMuted)
            }
        }
    }
}

/// Where Spent, Income and Net will be (OverviewSkeleton).
@MainActor
private struct OverviewSkeleton: View {
    var body: some View {
        VStack(alignment: .leading, spacing: Theme.Space.s4) {
            VStack(alignment: .leading, spacing: 6) {
                SkeletonBlock(width: 60, height: 12)
                SkeletonBlock(width: 200, height: 34)
            }
            HStack(spacing: Theme.Space.s2) {
                SkeletonBlock(height: 64, radius: Theme.Radius.lg)
                SkeletonBlock(height: 64, radius: Theme.Radius.lg)
            }
        }
    }
}

// MARK: Meal vouchers

@MainActor
private struct VoucherPanel: View {
    let card: VoucherCardFigures
    @Environment(AppLanguage.self) private var language

    var body: some View {
        Panel(title: language.t("vouchers:title"), icon: .ticket) {
            HStack(alignment: .bottom, spacing: Theme.Space.s3) {
                Figure(label: language.t("vouchers:balance"), value: card.balance, tone: Tone(name: card.tone), size: .lg)
                Spacer(minLength: 0)
                VStack(alignment: .trailing, spacing: 0) {
                    Text(card.nextAmount).kitText(14, .bold, color: Theme.Colors.positive)
                    Text(card.nextWhy).kitText(12, color: Theme.Colors.textMuted).multilineTextAlignment(.trailing)
                }
            }
            .padding(.top, Theme.Space.s1)
        }
        .accessibilityIdentifier("home.vouchers")
    }
}

// MARK: Spending by category

@MainActor
private struct CategoriesPanel: View {
    @Bindable var model: HomeViewModel
    let figures: HomeFigures
    let onAdd: () -> Void
    @Environment(AppLanguage.self) private var language

    var body: some View {
        Panel(title: language.t("dashboard:categories.title"), icon: .chartBarDecreasing) {
            if figures.bars.isEmpty {
                CardEmptyState(text: language.t("dashboard:noExpenses")) {
                    Button(language.t("dashboard:categories.add"), action: onAdd).buttonStyle(.kit(.outline, .sm, scheme: .gray))
                }
            } else if model.view == "table" {
                table
            } else {
                chart
            }
        } action: {
            HStack(spacing: Theme.Space.s1) {
                toggle(.chartBarDecreasing, "chart", label: "dashboard:categories.chartView")
                toggle(.table, "table", label: "dashboard:categories.tableView")
            }
            .padding(Theme.Space.s1)
            .background(Theme.Colors.subtle)
            .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.lg, style: .continuous))
        }
    }

    private func toggle(_ icon: Lucide, _ value: String, label: String) -> some View {
        let on = model.view == value || (value == "chart" && model.view != "table")
        return Button { model.view = value } label: {
            LucideIcon(icon: icon, size: 15)
                .foregroundStyle(on ? Theme.Colors.onAccent : Theme.Colors.textMuted)
                .frame(width: 42, height: 24)
                .background(on ? Theme.Colors.accentSolid : Color.clear)
                .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.lg, style: .continuous))
        }
        .buttonStyle(.plain)
        .accessibilityLabel(language.t(label))
        .accessibilityAddTraits(on ? .isSelected : [])
    }

    private var chart: some View {
        let shown = model.showAllBars ? figures.bars : Array(figures.bars.prefix(figures.fold.top))
        return VStack(spacing: Theme.Space.s4) {
            ForEach(shown, id: \.name) { bar in
                ProgressRow(title: bar.label, meta: bar.meta, ratio: max(bar.ratio, 0.02), valueLabel: "\(bar.share)%") {
                    if bar.group { GroupBadge() } else { CategoryBadge(look: bar.look) }
                }
            }
            if figures.fold.hidden > 0 {
                Button {
                    model.showAllBars.toggle()
                } label: {
                    IconLabel(text: model.showAllBars ? figures.fold.showTop : figures.fold.showAll,
                              icon: model.showAllBars ? .chevronUp : .chevronDown, trailing: true)
                }
                .buttonStyle(.kit(.outline, .sm, scheme: .gray, full: true))
                .accessibilityIdentifier("home.showAllBars")
            }
        }
    }

    /// The table view (Chakra's simple sm Table): Category | Amount | Share.
    private var table: some View {
        VStack(spacing: 0) {
            HStack {
                head(language.t("dashboard:categories.category")).frame(maxWidth: .infinity, alignment: .leading)
                head(language.t("dashboard:categories.amount")).frame(width: 110, alignment: .trailing)
                head(language.t("dashboard:categories.share")).frame(width: 56, alignment: .trailing)
            }
            .padding(.vertical, Theme.Space.s2)
            .overlay(alignment: .bottom) { Rectangle().fill(Theme.Colors.border).frame(height: 1) }
            ForEach(figures.bars, id: \.name) { bar in
                HStack {
                    Text(bar.label).kitText(14).frame(maxWidth: .infinity, alignment: .leading)
                    Text(bar.amount).kitText(14, .semibold).frame(width: 110, alignment: .trailing)
                    Text("\(bar.share)%").kitText(14, color: Theme.Colors.textMuted).frame(width: 56, alignment: .trailing)
                }
                .padding(.vertical, Theme.Space.s2)
                .overlay(alignment: .bottom) { Rectangle().fill(Theme.Colors.border).frame(height: 1) }
            }
        }
    }

    private func head(_ text: String) -> some View {
        Text(text.capsLabel)
            .font(Theme.Fonts.body(12, weight: .bold, lang: language.current))
            .kerning(0.6)
            .foregroundStyle(Theme.Colors.textMuted)
    }
}

// MARK: Budgets

@MainActor
private struct BudgetsCardPanel: View {
    let state: HomeViewModel.CardState<BudgetCardFigures>
    let onManage: () -> Void
    @Environment(AppLanguage.self) private var language

    private var subtitle: String? {
        if case .loaded(let card) = state { return card.subtitle }
        return nil
    }

    var body: some View {
        Panel(title: language.t("budgets:title"), icon: .target, subtitle: subtitle) {
            switch state {
            case .loading:
                SkeletonRows(count: 3, progress: true)
            case .failed(let message):
                LoadErrorBlock(message: message) {}
            case .loaded(let card):
                if card.items.isEmpty {
                    CardEmptyState(text: card.empty) {
                        if card.canSet {
                            Button(language.t("budgets:card.set"), action: onManage).buttonStyle(.kit(.outline, .sm, scheme: .gray))
                        }
                    }
                } else {
                    VStack(spacing: Theme.Space.s4) {
                        ForEach(card.items) { item in
                            ProgressRow(title: item.name, meta: item.meta, ratio: Double(item.percent) / 100,
                                        valueLabel: item.valueLabel, fill: Tone(name: item.tone).fill,
                                        over: item.over, overLabel: item.overLabel) {
                                CategoryBadge(look: item.look)
                            }
                        }
                    }
                }
            }
        } action: {
            Button(language.t("budgets:card.manage"), action: onManage).buttonStyle(.kit(.ghost, .xs))
        }
        .accessibilityIdentifier("home.budgets")
    }
}

// MARK: Expenses and Income

@MainActor
private struct ListPanel: View {
    let list: HomeList
    let icon: Lucide
    let tone: Tone
    @Binding var page: Int
    let model: HomeViewModel
    let onOpen: (JSONValue) -> Void

    var body: some View {
        Panel(title: list.title, icon: icon, iconTone: tone, subtitle: list.subtitle, divider: true) {
            if list.rows.isEmpty {
                Text(list.empty).kitText(14, color: Theme.Colors.textMuted)
            } else {
                let shown = model.page(list, page)
                TransactionListView(rows: shown.rows, saved: { model.row(id: $0) }, open: onOpen) { row in
                    await model.delete(row)
                }
                if shown.pages > 1 {
                    Paginator(page: page, pages: shown.pages, position: shown.position) { page = $0 }
                }
            }
        }
    }
}

// MARK: Recurring

/// The Recurring card (SubscriptionsCard): Manage; a pill per frequency, its
/// headline and note, then the next charges ("Show all N charges") or, for
/// a past period, what it was charged.
@MainActor
private struct RecurringCardPanel: View {
    let card: RecurringCard
    let onManage: () -> Void
    let onAdd: () -> Void
    @Environment(AppLanguage.self) private var language
    @State private var picked: String?
    @State private var showAll = false

    var body: some View {
        Panel(title: language.t("recurring:list.title"), icon: .repeat, subtitle: card.subtitle) {
            if card.groups.isEmpty {
                CardEmptyState(text: card.empty) {
                    if card.upcoming {
                        Button(language.t("recurring:card.add"), action: onAdd).buttonStyle(.kit(.outline, .sm, scheme: .gray))
                    }
                }
            } else {
                let group = card.groups.first { $0.key == picked } ?? card.groups[0]
                VStack(alignment: .leading, spacing: 0) {
                    if card.groups.count > 1 {
                        PillTabs(options: card.groups.map { ($0.key, $0.label) }, value: group.key) {
                            picked = $0
                            showAll = false
                        }
                        .padding(.bottom, Theme.Space.s4)
                    }
                    HStack(alignment: .bottom, spacing: Theme.Space.s3) {
                        Figure(label: group.headline.label ?? "", value: group.headline.value, size: .lg)
                        Spacer(minLength: 0)
                        if let perMonth = group.headline.perMonth { Text(perMonth).kitText(14, color: Theme.Colors.textMuted) }
                    }
                    if let converted = group.headline.converted { Note(text: converted).padding(.top, Theme.Space.s1) }
                    if let missing = group.headline.missing { Note(text: missing) }
                    if let note = group.note { Note(text: note).padding(.top, Theme.Space.s1) }
                    SectionLabel(text: group.section)
                        .padding(.top, Theme.Space.s4)
                        .padding(.bottom, Theme.Space.s1)
                    ForEach(showAll ? group.all : group.rows) { row in
                        ItemRow(title: row.title, meta: row.meta, amount: row.amount, amountMeta: row.hint) {
                            CategoryBadge(look: row.look)
                        }
                    }
                    if let toggle = group.toggle {
                        Button {
                            showAll.toggle()
                        } label: {
                            IconLabel(text: showAll ? toggle.showNext : toggle.showAll,
                                      icon: showAll ? .chevronUp : .chevronDown, trailing: true)
                        }
                        .buttonStyle(.kit(.outline, .sm, scheme: .gray, full: true))
                        .padding(.top, Theme.Space.s2)
                        .accessibilityIdentifier("home.showAll")
                    }
                }
            }
        } action: {
            Button(language.t("recurring:card.manage"), action: onManage).buttonStyle(.kit(.ghost, .xs))
        }
    }
}
