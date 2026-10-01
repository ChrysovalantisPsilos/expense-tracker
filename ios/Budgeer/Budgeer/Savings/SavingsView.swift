// Savings (from More › Money and Home's savings line), after the web's
// Savings page: the pot (its total, where it comes from, this month's chip,
// the month-end line as a soft coral area, Add to savings), This month (from
// income, received, from savings, the net change and the savings that
// repeat), the goals (a ring in the logo's colours each, "+ / −" a tenth of
// the target in place, tap to edit, swipe to delete after a question) and
// the history (All / In / Out, month by month, swipe to delete after the
// web's question, tap to edit; Show older). Before anything was ever saved
// it explains how savings work instead. Every figure and word is
// SavingsModel's (the core's); Swift Charts only draws the line.
import Charts
import SwiftUI

@MainActor
struct SavingsView: View {
    let model: SavingsModel
    /// Add on the savings category (nil without one); `repeats` for "Make it automatic".
    let add: (_ category: String?, _ repeats: Bool) -> Void
    /// A history entry, to edit.
    let open: (JSONValue) -> Void
    /// A repeating saving's rule, to edit.
    let openRule: (JSONValue) -> Void
    @Environment(AppLanguage.self) private var language
    @State private var pendingEntry: JSONValue?
    @State private var pendingGoal: String?

    var body: some View {
        List {
            switch model.state {
            case .loading:
                Section { NativeLoading() }.listRowBackground(Color.clear)
            case .failed(let message):
                Section { NativeFailed(message: message) { await model.load() } }.listRowBackground(Color.clear)
            case .loaded(let figures):
                if let message = model.message {
                    Section { NativeNotice(text: message, warning: model.warning) }.listRowBackground(NativeStyle.card)
                }
                if figures.first {
                    firstRun(figures)
                } else {
                    potSection(figures.pot)
                    monthSection(figures.month)
                    goalsSection(figures.goals)
                    historySections(figures.history)
                }
            }
        }
        .listStyle(.insetGrouped)
        .listSectionSpacing(20)
        .scrollContentBackground(.hidden)
        .background(NativeStyle.canvas)
        .nativeTabBarRoom()
        .navigationTitle(language.t("savings:title"))
        .refreshable { await model.load() }
        .task(id: language.current) { await model.load() }
        .confirmationDialog(TransactionWords.deleteTitle(pendingEntry ?? [:]),
                            isPresented: Binding(get: { pendingEntry != nil }, set: { if !$0 { pendingEntry = nil } }),
                            titleVisibility: .visible, presenting: pendingEntry) { row in
            Button(language.t("common:actions.delete"), role: .destructive) { Task { await model.delete(entry: row) } }
            Button(language.t("common:actions.cancel"), role: .cancel) {}
        } message: { row in
            Text(TransactionWords.deleteBody(row))
        }
        .confirmationDialog(pendingGoal.map { model.deleteGoalQuestion(id: $0) } ?? "",
                            isPresented: Binding(get: { pendingGoal != nil }, set: { if !$0 { pendingGoal = nil } }),
                            titleVisibility: .visible, presenting: pendingGoal) { id in
            Button(language.t("common:actions.delete"), role: .destructive) { Task { await model.deleteGoal(id: id) } }
            Button(language.t("common:actions.cancel"), role: .cancel) {}
        }
    }

    // MARK: The pot

    private func potSection(_ pot: PotCard) -> some View {
        Section {
            VStack(alignment: .leading, spacing: 6) {
                Text(language.t("savings:pot.label")).font(.subheadline).foregroundStyle(.secondary)
                NativeMoney(text: pot.total, value: pot.points.last?.value ?? 0, font: NativeStyle.money(42),
                            color: SavingsView.color(pot.tone))
                    .accessibilityIdentifier("savings.total")
                Text(pot.note).font(.footnote).foregroundStyle(.secondary)
                HStack(spacing: 8) {
                    SavingsChip(chip: pot.chip)
                    Spacer(minLength: 4)
                    if let since = pot.since {
                        Text(since).font(.footnote).foregroundStyle(.secondary).lineLimit(1)
                    }
                }
                .padding(.top, 2)
                if !pot.points.isEmpty {
                    PotChart(points: pot.points)
                        .frame(height: 150)
                        .padding(.top, 6)
                        .accessibilityElement()
                        .accessibilityLabel(Text(pot.chart))
                }
                Button {
                    add(model.savingsCategory, false)
                } label: {
                    Label(language.t("savings:add"), systemImage: "plus").frame(maxWidth: .infinity)
                }
                .nativeGlassButton(prominent: true)
                .padding(.top, 8)
                .accessibilityIdentifier("savings.add")
            }
            .padding(.vertical, 8)
        }
        .listRowBackground(NativeStyle.card)
    }

    // MARK: This month

    private func monthSection(_ month: SavingsMonth) -> some View {
        Section {
            HStack(spacing: 8) {
                ForEach(month.tiles, id: \.key) { tile in
                    VStack(spacing: 3) {
                        Text(tile.label)
                            .font(.caption)
                            .foregroundStyle(.secondary)
                            .multilineTextAlignment(.center)
                            .lineLimit(2)
                            .minimumScaleFactor(0.8)
                        Text(tile.text)
                            .font(.subheadline.weight(.semibold))
                            .foregroundStyle(SavingsView.color(tile.tone))
                            .monospacedDigit()
                            .lineLimit(1)
                            .minimumScaleFactor(0.7)
                    }
                    .padding(.horizontal, 4)
                    .frame(maxWidth: .infinity, minHeight: 62)
                    .background(Theme.Colors.subtle, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                    .accessibilityElement(children: .combine)
                }
            }
            .listRowInsets(EdgeInsets(top: 10, leading: 12, bottom: 10, trailing: 12))
            HStack {
                Text(language.t("savings:month.net"))
                Spacer()
                Text(month.net.text)
                    .fontWeight(.semibold)
                    .foregroundStyle(SavingsView.color(month.net.tone))
                    .monospacedDigit()
            }
            if !month.repeating.isEmpty {
                Text(language.t("savings:month.repeating").capsLabel)
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(.secondary)
                ForEach(month.repeating) { item in
                    Button {
                        if let rule = model.rule(id: item.id) { openRule(rule) }
                    } label: {
                        HStack(spacing: 12) {
                            NativeIconTile(symbol: "repeat", color: SettingsRow.purple)
                            VStack(alignment: .leading, spacing: 2) {
                                Text(item.title).lineLimit(1)
                                Text(item.meta).font(.footnote).foregroundStyle(.secondary).lineLimit(2)
                            }
                            Spacer(minLength: 8)
                            Image(systemName: "chevron.right")
                                .font(.footnote.weight(.semibold))
                                .foregroundStyle(.tertiary)
                        }
                    }
                    .foregroundStyle(Color.primary)
                }
            }
        } header: {
            SavingsHeader(title: language.t("savings:month.title"), subtitle: month.subtitle)
        }
        .listRowBackground(NativeStyle.card)
    }

    // MARK: Goals

    private func goalsSection(_ goals: [GoalCard]) -> some View {
        Section {
            if goals.isEmpty {
                Text(language.t("savings:goals.empty")).font(.subheadline).foregroundStyle(.secondary)
            }
            ForEach(goals) { card in
                GoalRow(card: card, busy: model.busy) { step in
                    Task { await model.addTo(card, step: step) }
                }
                .swipeActions(edge: .trailing, allowsFullSwipe: false) {
                    Button(role: .destructive) {
                        pendingGoal = card.id
                    } label: {
                        Label(language.t("common:actions.delete"), systemImage: "trash")
                    }
                }
            }
        } header: {
            HStack(alignment: .firstTextBaseline) {
                Text(language.t("savings:goals.title")).font(.title3.weight(.semibold)).foregroundStyle(Color.primary)
                Spacer(minLength: 8)
                NavigationLink(value: AppRoute.newGoal) {
                    Label(language.t("savings:goals.add"), systemImage: "plus").font(.subheadline)
                }
                .foregroundStyle(NativeStyle.tint)
                .accessibilityIdentifier("savings.newGoal")
            }
            .textCase(nil)
            .padding(.horizontal, -4)
            .padding(.bottom, 2)
        }
        .listRowBackground(NativeStyle.card)
    }

    // MARK: The history

    @ViewBuilder
    private func historySections(_ history: SavingsHistoryFigures) -> some View {
        Section {
            Picker(language.t("savings:history.show"),
                   selection: Binding(get: { model.filter }, set: { model.setFilter($0) })) {
                ForEach(model.filters, id: \.value) { option in Text(option.label).tag(option.value) }
            }
            .pickerStyle(.segmented)
            .listRowBackground(Color.clear)
            .listRowInsets(EdgeInsets(top: 0, leading: 0, bottom: 0, trailing: 0))
            if let empty = history.empty {
                Text(empty).font(.subheadline).foregroundStyle(.secondary).listRowBackground(NativeStyle.card)
            }
        } header: {
            SavingsHeader(title: language.t("savings:history.title"), subtitle: language.t("savings:history.subtitle"))
        }
        let window = model.window
        ForEach(history.groups.prefix(window.shown)) { group in
            Section {
                ForEach(group.rows) { row in entryRow(row) }
            } header: {
                HStack(alignment: .firstTextBaseline) {
                    Text(group.heading).font(.headline).foregroundStyle(Color.primary)
                    Spacer()
                    Text(group.net.text)
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(group.net.tone == "positive" ? NativeStyle.positive : Theme.Colors.textMuted)
                        .monospacedDigit()
                }
                .textCase(nil)
                .padding(.horizontal, -4)
            }
            .listRowBackground(NativeStyle.card)
        }
        if window.more {
            Section {
                Button(language.t("savings:history.older")) { model.showOlder() }
                    .frame(maxWidth: .infinity)
                    .accessibilityIdentifier("savings.older")
            }
            .listRowBackground(NativeStyle.card)
        }
    }

    private func entryRow(_ row: SavingsEntryRow) -> some View {
        Button {
            open(row.row)
        } label: {
            HStack(spacing: 12) {
                CategoryBadge(look: row.look, size: 36)
                VStack(alignment: .leading, spacing: 2) {
                    Text(row.title).font(.body.weight(.medium)).lineLimit(1)
                    HStack(spacing: 4) {
                        Text(row.date)
                        if let note = row.note {
                            Text(verbatim: "·")
                            Text(note)
                                .fontWeight(row.out ? .semibold : .regular)
                                .foregroundStyle(row.out ? Color.primary : Color.secondary)
                        }
                        if row.repeats {
                            Image(systemName: "repeat")
                                .imageScale(.small)
                                .accessibilityLabel(Text(language.t("savings:history.repeats")))
                        }
                    }
                    .font(.footnote)
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
                }
                Spacer(minLength: 8)
                Text(row.amount)
                    .font(.body.weight(.semibold))
                    .foregroundStyle(SavingsView.color(row.tone))
                    .monospacedDigit()
            }
            .accessibilityElement(children: .combine)
        }
        .foregroundStyle(Color.primary)
        .swipeActions(edge: .trailing, allowsFullSwipe: false) {
            Button(role: .destructive) {
                pendingEntry = row.row
            } label: {
                Label(language.t("common:actions.delete"), systemImage: "trash")
            }
        }
        .accessibilityIdentifier("savings.row.\(row.id)")
    }

    // MARK: Nothing saved yet

    @ViewBuilder
    private func firstRun(_ figures: SavingsFigures) -> some View {
        Section {
            VStack(spacing: 12) {
                Image(systemName: "chart.line.uptrend.xyaxis")
                    .font(.system(size: 34, weight: .semibold))
                    .foregroundStyle(NativeStyle.coral)
                    .accessibilityHidden(true)
                Text(language.t("savings:empty.title")).font(.title3.weight(.semibold)).multilineTextAlignment(.center)
                Text(language.t("savings:empty.text"))
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
                Button {
                    add(model.savingsCategory, false)
                } label: {
                    Label(language.t("savings:add"), systemImage: "plus").frame(maxWidth: .infinity)
                }
                .nativeGlassButton(prominent: true)
                .accessibilityIdentifier("savings.add")
                if figures.goals.isEmpty {
                    NavigationLink(value: AppRoute.newGoal) {
                        Label(language.t("savings:empty.setGoal"), systemImage: "target").frame(maxWidth: .infinity)
                    }
                    .nativeGlassButton()
                }
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 12)
        }
        .listRowBackground(NativeStyle.card)
        if !figures.goals.isEmpty { goalsSection(figures.goals) }
        Section {
            howRow("fromIncome", symbol: "banknote.fill", color: SettingsRow.green)
            howRow("received", symbol: "gift.fill", color: SettingsRow.amber)
            howRow("fromSavings", symbol: "bag.fill", color: SettingsRow.coral)
            Button {
                add(model.savingsCategory, true)
            } label: {
                HStack(spacing: 14) {
                    NativeIconTile(symbol: "repeat", color: SettingsRow.purple)
                    VStack(alignment: .leading, spacing: 2) {
                        Text(language.t("savings:how.auto.title"))
                        Text(language.t("savings:how.auto.meta")).font(.footnote).foregroundStyle(.secondary)
                    }
                    Spacer(minLength: 8)
                    Image(systemName: "chevron.right").font(.footnote.weight(.semibold)).foregroundStyle(.tertiary)
                }
            }
            .foregroundStyle(Color.primary)
            .accessibilityIdentifier("savings.auto")
        } header: {
            SavingsHeader(title: language.t("savings:how.title"), subtitle: language.t("savings:how.subtitle"))
        }
        .listRowBackground(NativeStyle.card)
    }

    private func howRow(_ id: String, symbol: String, color: Color) -> some View {
        HStack(alignment: .top, spacing: 14) {
            NativeIconTile(symbol: symbol, color: color)
            VStack(alignment: .leading, spacing: 2) {
                Text(language.t("savings:how.\(id).title"))
                Text(language.t("savings:how.\(id).meta")).font(.footnote).foregroundStyle(.secondary)
            }
        }
        .padding(.vertical, 2)
        .accessibilityElement(children: .combine)
    }

    /// A savings tone as a colour: growth green, below zero red, nothing muted, the rest plain.
    static func color(_ tone: String) -> Color {
        switch tone {
        case "positive": return NativeStyle.positive
        case "negative": return NativeStyle.negative
        case "muted": return Theme.Colors.textMuted
        default: return Color.primary
        }
    }
}

/// A section's title with a muted line under it.
struct SavingsHeader: View {
    let title: String
    let subtitle: String

    var body: some View {
        VStack(alignment: .leading, spacing: 1) {
            Text(title).font(.title3.weight(.semibold)).foregroundStyle(Color.primary)
            Text(subtitle).font(.footnote).foregroundStyle(.secondary)
        }
        .textCase(nil)
        .padding(.horizontal, -4)
        .padding(.bottom, 2)
    }
}

/// This month's chip: green when the pot grew, otherwise a muted one (never red).
struct SavingsChip: View {
    let chip: PotCard.Chip

    var body: some View {
        let up = chip.kind == "up"
        Label(chip.text, systemImage: up ? "arrow.up.right" : "bag")
            .font(.footnote.weight(.semibold))
            .foregroundStyle(up ? NativeStyle.positive : Theme.Colors.textMuted)
            .lineLimit(1)
            .minimumScaleFactor(0.8)
            .padding(.horizontal, 10)
            .padding(.vertical, 4)
            .background(up ? NativeStyle.positive.opacity(0.12) : Theme.Colors.subtle, in: Capsule())
    }
}

/// The pot's month-end totals as a soft coral area under its line.
struct PotChart: View {
    let points: [PotPoint]

    var body: some View {
        Chart {
            ForEach(Array(points.enumerated()), id: \.offset) { _, point in
                AreaMark(x: .value("month", point.label), y: .value("pot", point.value))
                    .foregroundStyle(LinearGradient(colors: [NativeStyle.coral.opacity(0.32), NativeStyle.coral.opacity(0.02)],
                                                    startPoint: .top, endPoint: .bottom))
                    .interpolationMethod(.monotone)
                LineMark(x: .value("month", point.label), y: .value("pot", point.value))
                    .foregroundStyle(NativeStyle.coral)
                    .lineStyle(StrokeStyle(lineWidth: 2.5, lineCap: .round))
                    .interpolationMethod(.monotone)
            }
        }
        .chartYAxis(.hidden)
        .chartYScale(domain: .automatic(includesZero: true))
    }
}

/// A goal: its ring, name, "€X of €Y" and status, opening its page, then
/// "+ €X" / "− €X" in place until it's reached.
struct GoalRow: View {
    let card: GoalCard
    let busy: Bool
    let step: (Int) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            NavigationLink(value: AppRoute.goal(card.id)) {
                HStack(spacing: 12) {
                    GoalRing(card: card)
                    VStack(alignment: .leading, spacing: 2) {
                        Text(card.name).font(.body.weight(.semibold)).lineLimit(1)
                        Text(card.of).font(.footnote).foregroundStyle(.secondary).lineLimit(1)
                        Text(card.status.text)
                            .font(.footnote.weight(card.status.strong ? .semibold : .regular))
                            .foregroundStyle(card.status.strong ? Color.primary : Color.secondary)
                            .lineLimit(2)
                    }
                }
            }
            .accessibilityIdentifier("savings.goal.\(card.id)")
            if let plus = card.plus {
                HStack(spacing: 8) {
                    Button(plus) { step(card.step) }
                        .buttonStyle(.bordered)
                        .tint(NativeStyle.tint)
                    if let minus = card.minus {
                        Button(minus) { step(-card.step) }
                            .buttonStyle(.borderless)
                            .tint(NativeStyle.tint)
                    }
                }
                .font(.subheadline.weight(.semibold))
                .controlSize(.small)
                .padding(.leading, 66)
                .disabled(busy)
            }
        }
        .padding(.vertical, 4)
    }
}

/// A goal's progress as a ring in the logo's colours: amber, the gap, then
/// coral (goalParts' arcs), on a soft track, with the percentage inside.
struct GoalRing: View {
    let card: GoalCard
    var size: CGFloat = 50
    private let line: CGFloat = 6

    var body: some View {
        ZStack {
            Circle().stroke(Color.primary.opacity(0.1), lineWidth: line)
            arc(card.arcs.amber, NativeStyle.amber)
            arc(card.arcs.coral, NativeStyle.coral)
            Text(verbatim: "\(card.pct)%")
                .font(.system(size: 11, weight: .heavy))
                .monospacedDigit()
        }
        .padding(line / 2)
        .frame(width: size + line, height: size + line)
        .accessibilityHidden(true)
    }

    @ViewBuilder private func arc(_ part: [Double], _ color: Color) -> some View {
        if part.count == 2, part[1] > 0 {
            Circle()
                .trim(from: part[0], to: min(1, part[0] + part[1]))
                .stroke(color, style: StrokeStyle(lineWidth: line, lineCap: .butt))
                .rotationEffect(.degrees(-90))
        }
    }
}
