// Activity (the web's Transactions): the picked month at a glance (spent,
// income and net, a bar per day, the biggest day), a row of chips that
// filter by kind and category, then the month's entries by day, each day in
// its own card (a day's bar opens its card in the list); search over all
// history in the bar, and a floating glass pill that steps through the
// months. Swipe left to delete (it asks first); swipe right to duplicate
// or split with a group; tap a row to edit it in the Add sheet. A group's
// share is read-only here (it's edited in the group). Every figure and
// word is LedgerModel's (the core's).
import SwiftUI

@MainActor
struct ActivityView: View {
    let model: LedgerModel
    let chrome: PageChrome
    /// A row's saved transaction, to edit, duplicate or split.
    let open: (JSONValue) -> Void
    let duplicate: (JSONValue) -> Void
    let split: (JSONValue) -> Void
    /// Nothing logged yet: Add your first expense.
    var addFirst: () -> Void = {}
    @Environment(AppLanguage.self) private var language
    @State private var pendingDelete: String?
    @State private var deleted = 0
    @State private var notice: String?
    /// The day a bar just opened: its card glows for a moment.
    @State private var lit: String?

    var body: some View {
        ScrollViewReader { proxy in
            list(proxy)
        }
        .searchable(text: Binding(get: { model.text }, set: { model.setText($0) }),
                    placement: .navigationBarDrawer(displayMode: .automatic),
                    prompt: language.t("transactions:ledger.search"))
        .safeAreaInset(edge: .bottom, spacing: 0) {
            ActivityPill(model: model).padding(.bottom, 8)
        }
        .nativeTabBarRoom()
        .navigationTitle(language.t("ios:native.tabs.activity"))
        .pageChrome(chrome)
        .refreshable { await model.reloadRows() }
        .task(id: language.current) { await model.load() }
        .confirmationDialog(pendingDelete.map { model.deleteWords(id: $0).title } ?? "",
                            isPresented: Binding(get: { pendingDelete != nil }, set: { if !$0 { pendingDelete = nil } }),
                            titleVisibility: .visible, presenting: pendingDelete) { id in
            Button(language.t("common:actions.delete"), role: .destructive) {
                Task {
                    if await model.delete(id: id) {
                        notice = nil
                        deleted += 1
                    } else {
                        notice = language.t("transactions:list.notDeleted")
                    }
                }
            }
            Button(language.t("common:actions.cancel"), role: .cancel) {}
        } message: { id in
            Text(model.deleteWords(id: id).body)
        }
        .sensoryFeedback(.success, trigger: deleted)
        .sensoryFeedback(.selection, trigger: lit)
    }

    private func list(_ proxy: ScrollViewProxy) -> some View {
        List {
            switch model.state {
            case .loading:
                NativeLoading().listRowSeparator(.hidden).listRowBackground(Color.clear)
            case .failed(let message):
                NativeFailed(message: message) { await model.load() }
                    .listRowSeparator(.hidden)
                    .listRowBackground(Color.clear)
            case .loaded(let figures):
                loaded(figures) { key in scrollToDay(key, in: figures, proxy) }
            }
        }
        .listStyle(.insetGrouped)
        .listSectionSpacing(14)
        .scrollContentBackground(.hidden)
        .background(NativeStyle.canvas)
        // Every change of the list (a month, a chip, a search) moves smoothly.
        .animation(.smooth(duration: 0.35), value: model.state)
    }

    /// A bar tapped: scroll its day's card to the top, and light the card up for a moment.
    private func scrollToDay(_ key: String, in figures: LedgerFigures, _ proxy: ScrollViewProxy) {
        guard figures.days.contains(where: { $0.key == key }) else { return }
        withAnimation(.smooth(duration: 0.45)) { proxy.scrollTo(DayAnchor(key: key), anchor: .top) }
        lit = key
        Task {
            try? await Task.sleep(nanoseconds: 1_400_000_000)
            if lit == key { withAnimation(.easeOut(duration: 0.5)) { lit = nil } }
        }
    }

    @ViewBuilder
    private func loaded(_ figures: LedgerFigures, openDay: @escaping (String) -> Void) -> some View {
        if let notice {
            NativeNotice(text: notice, warning: true).listRowSeparator(.hidden)
        }
        if figures.firstRun {
            FirstEntryView(add: addFirst)
                .listRowSeparator(.hidden)
                .listRowBackground(Color.clear)
        } else {
            Section {
                if !figures.pulse.days.isEmpty {
                    // A search or a filter folds the card away (and back) smoothly.
                    MonthBarsCard(pulse: figures.pulse, period: model.period?.label ?? "", open: openDay)
                        .listRowInsets(EdgeInsets(top: 4, leading: 16, bottom: 6, trailing: 16))
                        .listRowBackground(Color.clear)
                        .listRowSeparator(.hidden)
                        .transition(.opacity.combined(with: .scale(scale: 0.96, anchor: .top)))
                        .accessibilityIdentifier("activity.header")
                }
                // The chips' row runs across the card's width, with room for their shadow.
                ActivityChips(model: model)
                    .listRowInsets(EdgeInsets(top: 0, leading: 0, bottom: 0, trailing: 0))
                    .listRowBackground(Color.clear)
                    .listRowSeparator(.hidden)
                Text(figures.subtitle)
                    .font(.footnote)
                    .foregroundStyle(.secondary)
                    .listRowInsets(EdgeInsets(top: 0, leading: 20, bottom: 4, trailing: 20))
                    .listRowBackground(Color.clear)
                    .listRowSeparator(.hidden)
                    .accessibilityIdentifier("activity.summary")
            }
            ForEach(figures.days) { day in
                Section {
                    ForEach(day.rows) { row in rowView(row, lit: lit == day.key) }
                } header: {
                    DayCardHeader(day: day)
                }
                .id(DayAnchor(key: day.key))
            }
            // Room for the last day to scroll clear of the month pill and the tab bar.
            Color.clear
                .frame(height: NativeFoot.room)
                .listRowBackground(Color.clear)
                .listRowSeparator(.hidden)
                .accessibilityHidden(true)
        }
    }

    @ViewBuilder
    private func rowView(_ row: EntryRow, lit: Bool) -> some View {
        if row.shared {
            rowChrome(EntryRowView(row: row), lit: lit)
        } else {
            rowChrome(Button {
                if let saved = model.row(id: row.id) { open(saved) }
            } label: {
                EntryRowView(row: row)
            }
            .foregroundStyle(Color.primary), lit: lit)
            .swipeActions(edge: .trailing, allowsFullSwipe: false) {
                Button(role: .destructive) {
                    pendingDelete = row.id
                } label: {
                    Label(language.t("common:actions.delete"), systemImage: "trash")
                }
            }
            .swipeActions(edge: .leading, allowsFullSwipe: false) {
                Button {
                    if let saved = model.row(id: row.id) { duplicate(saved) }
                } label: {
                    Label(language.t("ios:native.activity.duplicate"), systemImage: "plus.square.on.square")
                }
                .tint(Color.gray)
                if row.kind == "expense" {
                    Button {
                        if let saved = model.row(id: row.id) { split(saved) }
                    } label: {
                        Label(language.t("ios:native.activity.split"), systemImage: "person.2.fill")
                    }
                    .tint(NativeStyle.solid)
                }
            }
            .accessibilityIdentifier("activity.row.\(row.id)")
        }
    }

    /// A row's place on its day's card, the hairline starting under the words; `lit`: the
    /// day a bar just opened, its card washed in the tint for a moment.
    private func rowChrome<Content: View>(_ content: Content, lit: Bool) -> some View {
        content
            .listRowBackground(ZStack {
                NativeStyle.card
                NativeStyle.tint.opacity(lit ? 0.14 : 0)
            })
            .listRowSeparatorTint(Color.primary.opacity(0.08))
            .alignmentGuide(.listRowSeparatorLeading) { _ in 56 }
    }
}

// MARK: The month's header

/// The month's figures: spent big, then income and net (whichever the
/// list's kind shows). The big figure keeps one height, however long it is.
private struct MonthFigures: View {
    let pulse: MonthPulse
    let period: String

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(period.capsLabel)
                .font(.caption.weight(.semibold))
                .foregroundStyle(.secondary)
            let main = pulse.spent ?? pulse.income
            Text(main?.amount ?? " ")
                .font(NativeStyle.money(34))
                .foregroundStyle(pulse.spent == nil ? NativeStyle.positive : Color.primary)
                .monospacedDigit()
                .lineLimit(1)
                .minimumScaleFactor(0.6)
                .contentTransition(.numericText())
                .frame(height: 44, alignment: .leading)
            Text(main?.label ?? " ").font(.subheadline).foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityElement(children: .combine)
    }
}

/// Income and net as two small figures, one above the other. Both places
/// are always kept (a figure the kind leaves out is an empty place), so the
/// card doesn't change size when a chip changes the kind.
private struct MonthSideFigures: View {
    let pulse: MonthPulse

    var body: some View {
        VStack(alignment: .trailing, spacing: 8) {
            let income = pulse.spent == nil ? nil : pulse.income
            side(income?.label, income?.amount, NativeStyle.positive)
            side(pulse.net?.label, pulse.net?.text, NativeStyle.tone(pulse.net?.tone))
        }
    }

    private func side(_ label: String?, _ amount: String?, _ color: Color) -> some View {
        VStack(alignment: .trailing, spacing: 1) {
            Text(label ?? " ").font(.caption).foregroundStyle(.secondary)
            Text(amount ?? " ")
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(color)
                .monospacedDigit()
                .lineLimit(1)
                .contentTransition(.numericText())
        }
        .opacity(amount == nil ? 0 : 1)
        .accessibilityElement(children: .combine)
        .accessibilityHidden(amount == nil)
    }
}

/// The month's card: the figures, then a bar per day (today in the tint,
/// the days ahead faint) and the biggest day. Its size is the same every
/// month: the bars stand in 31 even places whatever the month's length,
/// the peak's line keeps its place when there's none, and everything sits
/// well inside the card's edge. Moving between months, the bars grow and
/// shrink in place and the figures roll.
struct MonthBarsCard: View {
    let pulse: MonthPulse
    let period: String
    /// A day's bar tapped: its key ('YYYY-MM-DD'), to open its day in the list.
    var open: (String) -> Void = { _ in }

    /// A day's place in the row: the longest month's days.
    private static let places = 31
    private static let barHeight: CGFloat = 54

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack(alignment: .top, spacing: 12) {
                MonthFigures(pulse: pulse, period: period)
                MonthSideFigures(pulse: pulse)
            }
            bars
            Label(pulse.peak ?? " ", systemImage: "flame.fill")
                .font(.footnote)
                .foregroundStyle(.secondary)
                .labelStyle(PeakLabelStyle())
                .lineLimit(1)
                .opacity(pulse.peak == nil ? 0 : 1)
        }
        .padding(.horizontal, 20)
        .padding(.top, 18)
        .padding(.bottom, 16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(NativeStyle.card, in: RoundedRectangle(cornerRadius: 26, style: .continuous))
        .animation(.smooth(duration: 0.4), value: pulse)
    }

    private var bars: some View {
        GeometryReader { proxy in
            let place = proxy.size.width / CGFloat(MonthBarsCard.places)
            HStack(alignment: .bottom, spacing: 0) {
                ForEach(0..<MonthBarsCard.places, id: \.self) { index in
                    let day: MonthPulse.Day? = pulse.days.indices.contains(index) ? pulse.days[index] : nil
                    column(day, place: place)
                }
            }
        }
        .frame(height: MonthBarsCard.barHeight + 14)
    }

    /// A day's place: its bar over its number. A day with a bar that isn't ahead is a button
    /// that opens its day in the list (VoiceOver reads "2 Oct · €89.00"); the others are only drawn.
    @ViewBuilder
    private func column(_ day: MonthPulse.Day?, place: CGFloat) -> some View {
        if let day, let spoken = day.spoken {
            Button { open(day.key) } label: {
                bar(day, place: place).contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel(spoken)
        } else {
            bar(day, place: place).accessibilityHidden(true)
        }
    }

    private func bar(_ day: MonthPulse.Day?, place: CGFloat) -> some View {
        VStack(spacing: 4) {
            Capsule()
                .fill(day.map(color) ?? Color.clear)
                .frame(width: max(3, place * 0.6), height: barHeight(day))
                .frame(height: MonthBarsCard.barHeight, alignment: .bottom)
            Text(day?.label ?? "")
                .font(.system(size: 8, weight: day?.today == true ? .bold : .regular))
                .foregroundStyle(day?.today == true ? NativeStyle.tint : Color.secondary)
                .opacity(day.map(showsLabel) == true ? 1 : 0)
                .fixedSize()
                .frame(height: 10)
        }
        .frame(width: place)
    }

    /// A day's bar: its share of the biggest day's height (a sliver at least); none past the month's end.
    private func barHeight(_ day: MonthPulse.Day?) -> CGFloat {
        guard let day else { return 0 }
        return max(4, MonthBarsCard.barHeight * day.bar)
    }

    private func color(_ day: MonthPulse.Day) -> Color {
        if day.today { return NativeStyle.tint }
        if day.future { return Color.primary.opacity(0.06) }
        return day.bar > 0 ? NativeStyle.coral.opacity(0.35 + 0.45 * day.bar) : Color.primary.opacity(0.08)
    }

    /// The 1st, every fifth day and today carry their number.
    private func showsLabel(_ day: MonthPulse.Day) -> Bool {
        day.today || day.label == "1" || (Int(day.label) ?? 0) % 5 == 0
    }
}

/// The peak's flame in the amber, the words muted.
private struct PeakLabelStyle: LabelStyle {
    func makeBody(configuration: Configuration) -> some View {
        HStack(spacing: 6) {
            configuration.icon.foregroundStyle(NativeStyle.amber)
            configuration.title
        }
    }
}

// MARK: The chips

/// All · Expenses · Income · Groups, then the kind's categories, as chips in one
/// sideways row: solid cards with a hairline, the picked one in the tint.
@MainActor
struct ActivityChips: View {
    let model: LedgerModel
    @Environment(AppLanguage.self) private var language

    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                chip(language.t("transactions:ledger.types.all"), picked: model.type == "all") {
                    Task { await model.setType("all") }
                }
                chip(language.t("transactions:ledger.types.expense"), picked: model.type == "expense") {
                    Task { await model.setType("expense") }
                }
                chip(language.t("transactions:ledger.types.income"), picked: model.type == "income") {
                    Task { await model.setType("income") }
                }
                // Only your shares of group expenses (txnFilter's shared filter).
                chip(language.t("groups:title"), picked: model.sharedOnly) {
                    Task { await model.setSharedOnly(!model.sharedOnly) }
                }
                if !model.categoryOptions.isEmpty {
                    Capsule().fill(Color.primary.opacity(0.12)).frame(width: 1, height: 22)
                }
                ForEach(model.categoryOptions, id: \.id) { option in
                    let picked = model.filter("categoryId") == option.id
                    chip(option.name, picked: picked) {
                        Task { await model.setFilter("categoryId", picked ? "" : option.id) }
                    }
                }
            }
            .padding(.horizontal, 4)
            .padding(.vertical, 10)
        }
        .scrollClipDisabled()
        .sensoryFeedback(.selection, trigger: model.type)
        .accessibilityIdentifier("activity.chips")
    }

    private func chip(_ title: String, picked: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Text(title)
                .font(.subheadline.weight(picked ? .semibold : .medium))
                .foregroundStyle(picked ? Color.white : Color.primary)
                .lineLimit(1)
                .padding(.horizontal, 14)
                .frame(minHeight: 36)
                .background(picked ? NativeStyle.solid : NativeStyle.card, in: Capsule())
                .overlay { Capsule().stroke(Color.primary.opacity(picked ? 0 : 0.08), lineWidth: 1) }
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(picked ? .isSelected : [])
    }
}

// MARK: The days

/// A day's card in the list, as a bar scrolls to it.
private struct DayAnchor: Hashable {
    let key: String
}

/// A day's heading over its card: the day, then what it spent, or its net (in its tone) when money came in.
private struct DayCardHeader: View {
    let day: EntryDay

    var body: some View {
        HStack(alignment: .firstTextBaseline) {
            Text(day.title).font(.headline).foregroundStyle(Color.primary)
            Spacer()
            if let net = day.net {
                Text(net.text).font(.subheadline.weight(.semibold)).foregroundStyle(NativeStyle.tone(net.tone))
                    .monospacedDigit()
            } else if let spent = day.spent {
                Text(spent).font(.subheadline).foregroundStyle(Theme.Colors.textMuted).monospacedDigit()
            }
        }
        .textCase(nil)
        .padding(.horizontal, -4)
    }
}

/// An entry: its badge, its name (the merchant or description first), the
/// muted line (the category, where savings came from, the notes; the group
/// it's shared in; how it repeats; a yearly payment's monthly share; which
/// month a late salary counts for), and the amount (income in green, with
/// its plus) with a foreign amount's value.
struct EntryRowView: View {
    let row: EntryRow
    private let badge: CGFloat = 44

    var body: some View {
        HStack(alignment: .center, spacing: 12) {
            CategoryBadge(look: row.look, size: badge)
            VStack(alignment: .leading, spacing: 3) {
                Text(row.title).font(.body.weight(.semibold)).lineLimit(1)
                if !line.isEmpty {
                    Text(line).font(.footnote).foregroundStyle(.secondary).lineLimit(2)
                }
                if row.group != nil || row.repeats != nil {
                    HStack(spacing: 8) {
                        if let group = row.group {
                            Label(group, systemImage: "person.2.fill")
                                .font(.caption.weight(.semibold))
                                .foregroundStyle(NativeStyle.tint)
                                .lineLimit(1)
                        }
                        if let repeats = row.repeats {
                            Label(repeats, systemImage: "repeat")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                                .lineLimit(1)
                        }
                    }
                }
            }
            Spacer(minLength: 8)
            VStack(alignment: .trailing, spacing: 2) {
                Text(row.amount)
                    .font(.body.weight(.semibold))
                    .foregroundStyle(row.tone == "positive" ? NativeStyle.positive : Color.primary)
                    .monospacedDigit()
                if let approx = row.approx {
                    Text([approx, row.estimated].compactMap { $0 }.joined(separator: " · "))
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }
        }
        .padding(.vertical, 4)
        .accessibilityElement(children: .combine)
    }

    /// The muted line's parts in the web's order, " · " between them.
    private var line: String {
        (row.meta + [row.notes, row.spread, row.countsFor].compactMap { $0 }).joined(separator: " · ")
    }
}

// MARK: The month pill

/// The floating pill over Activity: the previous and next month either
/// side of the picked one, which opens the list of months.
@MainActor
struct ActivityPill: View {
    let model: LedgerModel
    @Environment(AppLanguage.self) private var language

    var body: some View {
        HStack(spacing: 2) {
            step(-1, symbol: "chevron.left", label: "ios:native.activity.previousMonth")
            Menu {
                Picker(language.t("dashboard:period"), selection: Binding(get: { model.periodValue }, set: { value in
                    Task { await model.setPeriod(value) }
                })) {
                    ForEach(Array(model.monthPeriods.reversed()), id: \.value) { period in Text(period.label).tag(period.value) }
                }
                if model.hasFilters || model.type != "all" {
                    Button(language.t("ios:native.activity.clearFilters"), role: .destructive) {
                        Task {
                            await model.setType("all")
                            await model.clearAll()
                        }
                    }
                }
            } label: {
                HStack(spacing: 6) {
                    Image(systemName: "calendar")
                    Text(model.period?.label ?? "")
                        .font(.subheadline.weight(.semibold))
                        .lineLimit(1)
                }
                .foregroundStyle(Color.primary)
                .padding(.horizontal, 6)
                .frame(minHeight: 44)
            }
            .accessibilityIdentifier("activity.filter")
            step(1, symbol: "chevron.right", label: "ios:native.activity.nextMonth")
        }
        .padding(.horizontal, 4)
        .nativeGlass(Capsule(), interactive: true)
        .sensoryFeedback(.selection, trigger: model.periodValue)
    }

    private func step(_ direction: Int, symbol: String, label: String) -> some View {
        let next = model.neighbour(direction)
        return Button {
            if let next { Task { await model.setPeriod(next.value) } }
        } label: {
            Image(systemName: symbol)
                .font(.subheadline.weight(.semibold))
                .frame(width: 44, height: 44)
        }
        .foregroundStyle(next == nil ? Color.secondary : NativeStyle.tint)
        .disabled(next == nil)
        .accessibilityLabel(language.t(label))
    }
}
