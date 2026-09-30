// Home, after the web's Dashboard: the period picker (this month by
// default; months, years and all time from the first entry, next month once
// its salary is in), the overview (Spent as the hero figure with what's
// still to come from recurring payments, Income and Net as tiles, the
// savings line), spending by category as ranked bars, and the Recurring
// card. Every string on it was formatted by the core (HomeFigures); the view
// only lays them out. Pull down to refresh.
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
                        RecurringCardPanel(card: figures.recurring)
                    }
                }
                .padding(Theme.Space.s4)
            }
            .refreshable { await model.refresh() }
            .background(Theme.Colors.canvas.ignoresSafeArea())
            .navigationTitle(language.t("shell:nav.home"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    if !model.periods.isEmpty {
                        PeriodMenu(periods: model.periods, value: model.currentValue) { value in
                            Task { await model.setPeriod(value) }
                        }
                    }
                }
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

/// The Recurring card (SubscriptionsCard): a chip per frequency, its
/// headline and note, then the next charges ("Show all N charges") or, for
/// a past period, what it was charged.
private struct RecurringCardPanel: View {
    let card: RecurringCard
    @Environment(AppLanguage.self) private var language
    @State private var picked: String?
    @State private var showAll = false

    var body: some View {
        Panel(title: language.t("recurring:list.title"), icon: "repeat") {
            VStack(alignment: .leading, spacing: Theme.Space.s3) {
                if let subtitle = card.subtitle { Note(text: subtitle) }
                if card.groups.isEmpty {
                    Text(card.empty)
                        .font(Theme.Fonts.body(14, lang: language.current))
                        .foregroundStyle(Theme.Colors.textMuted)
                } else {
                    let group = card.groups.first { $0.key == picked } ?? card.groups[0]
                    if card.groups.count > 1 {
                        HStack(spacing: Theme.Space.s1) {
                            ForEach(card.groups) { g in
                                Button(g.label) { picked = g.key; showAll = false }
                                    .font(Theme.Fonts.body(13, weight: .semibold, lang: language.current))
                                    .foregroundStyle(g.key == group.key ? Theme.Colors.accentFg : Theme.Colors.textMuted)
                                    .padding(.horizontal, Theme.Space.s3)
                                    .padding(.vertical, 5)
                                    .background(g.key == group.key ? Theme.Colors.accentSubtle : Color.clear)
                                    .clipShape(Capsule())
                            }
                        }
                    }
                    VStack(alignment: .leading, spacing: 2) {
                        Text(group.headline.label ?? "")
                            .font(Theme.Fonts.body(13, weight: .semibold, lang: language.current))
                            .foregroundStyle(Theme.Colors.textMuted)
                        HStack(alignment: .lastTextBaseline) {
                            Text(group.headline.value)
                                .font(Theme.Fonts.heading(22, weight: .bold, lang: language.current))
                                .foregroundStyle(Theme.Colors.textPrimary)
                            Spacer(minLength: Theme.Space.s2)
                            if let perMonth = group.headline.perMonth { Note(text: perMonth) }
                        }
                        if let converted = group.headline.converted { Note(text: converted) }
                        if let missing = group.headline.missing { Note(text: missing, tone: Theme.Colors.warning) }
                        if let note = group.note { Note(text: note) }
                    }
                    Text(group.section.uppercased())
                        .font(Theme.Fonts.body(11, weight: .bold, lang: language.current))
                        .kerning(0.6)
                        .foregroundStyle(Theme.Colors.textMuted)
                        .padding(.top, Theme.Space.s1)
                    VStack(spacing: 0) {
                        ForEach(showAll ? group.all : group.rows) { row in
                            ChargeRowView(row: row)
                        }
                    }
                    if let toggle = group.toggle {
                        Button {
                            showAll.toggle()
                        } label: {
                            Label(showAll ? toggle.showNext : toggle.showAll, systemImage: showAll ? "chevron.up" : "chevron.down")
                        }
                        .buttonStyle(OutlineButtonStyle())
                        .accessibilityIdentifier("home.showAll")
                    }
                }
            }
        }
    }
}

/// One charge on the card: badge, name over "20 Sep · every month", the amount and its hint.
private struct ChargeRowView: View {
    let row: ChargeRow
    @Environment(AppLanguage.self) private var language

    var body: some View {
        HStack(alignment: .top, spacing: Theme.Space.s3) {
            CategoryBadge(look: row.look)
            VStack(alignment: .leading, spacing: 2) {
                Text(row.title)
                    .font(Theme.Fonts.body(15, weight: .semibold, lang: language.current))
                    .foregroundStyle(Theme.Colors.textPrimary)
                Note(text: row.meta)
            }
            Spacer(minLength: Theme.Space.s2)
            VStack(alignment: .trailing, spacing: 2) {
                Text(row.amount)
                    .font(Theme.Fonts.body(15, weight: .bold, lang: language.current))
                    .foregroundStyle(Theme.Colors.textPrimary)
                if let hint = row.hint { Note(text: hint) }
            }
        }
        .padding(.vertical, Theme.Space.s2)
        .accessibilityElement(children: .combine)
    }
}
