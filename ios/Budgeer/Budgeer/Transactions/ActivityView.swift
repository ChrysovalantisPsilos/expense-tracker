// Activity (the web's Transactions): the picked month at a glance (spent,
// income and net, a bar per day), a row of glass chips that filter by kind
// and category, then the month's entries by day; search over all history in
// the bar, and a floating glass pill that steps through the months. Two
// designs are on trial (DesignOptions.activity): A puts each day in its own
// card under the month's card; B is one list under sticky glass day
// headers, with the month's running line. Swipe left to delete (it asks
// first); swipe right to duplicate or split with a group; tap a row to edit
// it in the Add sheet. A group's share is read-only here (it's edited in the
// group). Every figure and word is LedgerModel's (the core's).
import SwiftUI

@MainActor
struct ActivityView: View {
    let model: LedgerModel
    let chrome: PageChrome
    /// A row's saved transaction, to edit, duplicate or split.
    let open: (JSONValue) -> Void
    let duplicate: (JSONValue) -> Void
    let split: (JSONValue) -> Void
    @Environment(AppLanguage.self) private var language
    @State private var pendingDelete: String?
    @State private var deleted = 0
    @State private var notice: String?

    private var option: DesignOption { DesignOptions.activity }

    var body: some View {
        List {
            switch model.state {
            case .loading:
                NativeLoading().listRowSeparator(.hidden).listRowBackground(Color.clear)
            case .failed(let message):
                NativeFailed(message: message) { await model.load() }
                    .listRowSeparator(.hidden)
                    .listRowBackground(Color.clear)
            case .loaded(let figures):
                loaded(figures)
            }
        }
        .activityListStyle(option)
        .listSectionSpacing(option == .a ? 14 : 0)
        .scrollContentBackground(.hidden)
        .background(option == .a ? NativeStyle.canvas : NativeStyle.card)
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
    }

    @ViewBuilder
    private func loaded(_ figures: LedgerFigures) -> some View {
        if let notice {
            NativeNotice(text: notice, warning: true).listRowSeparator(.hidden)
        }
        if figures.firstRun {
            ContentUnavailableView(language.t("transactions:firstEntry.title"), systemImage: "tray")
                .listRowSeparator(.hidden)
                .listRowBackground(Color.clear)
        } else {
            Section {
                if !figures.pulse.days.isEmpty {
                    Group {
                        if option == .a {
                            MonthBarsCard(pulse: figures.pulse, period: model.period?.label ?? "")
                        } else {
                            MonthLineCard(pulse: figures.pulse, period: model.period?.label ?? "")
                        }
                    }
                    .listRowInsets(EdgeInsets(top: 4, leading: 16, bottom: 6, trailing: 16))
                    .listRowBackground(Color.clear)
                    .listRowSeparator(.hidden)
                    .accessibilityIdentifier("activity.header")
                }
                // The chips' row runs edge to edge, with room for the glass's shadow.
                ActivityChips(model: model, inset: option == .a ? 4 : 16, glass: option == .b)
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
                    ForEach(day.rows) { row in rowView(row) }
                } header: {
                    if option == .a {
                        DayCardHeader(day: day)
                    } else {
                        DayGlassHeader(day: day)
                    }
                }
            }
        }
    }

    @ViewBuilder
    private func rowView(_ row: EntryRow) -> some View {
        if row.shared {
            rowChrome(EntryRowView(row: row, badge: option == .a ? 44 : 40))
        } else {
            rowChrome(Button {
                if let saved = model.row(id: row.id) { open(saved) }
            } label: {
                EntryRowView(row: row, badge: option == .a ? 44 : 40)
            }
            .foregroundStyle(Color.primary))
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

    /// A row's place in the list: on its day's card (A) or the page (B),
    /// the hairline starting under the words.
    private func rowChrome<Content: View>(_ content: Content) -> some View {
        content
            .listRowBackground(option == .a ? NativeStyle.card : Color.clear)
            .listRowSeparatorTint(Color.primary.opacity(0.08))
            .alignmentGuide(.listRowSeparatorLeading) { _ in option == .a ? 56 : 52 }
    }
}

extension View {
    /// Design A's inset cards, or design B's plain list (its headers stick).
    @ViewBuilder
    func activityListStyle(_ option: DesignOption) -> some View {
        switch option {
        case .a: listStyle(InsetGroupedListStyle())
        case .b: listStyle(PlainListStyle())
        }
    }
}

// MARK: The month's header

/// The month's figures: spent big, then income and net (whichever the
/// list's kind shows).
private struct MonthFigures: View {
    let pulse: MonthPulse
    let period: String

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(period.capsLabel)
                .font(.caption.weight(.semibold))
                .foregroundStyle(.secondary)
            if let main = pulse.spent ?? pulse.income {
                Text(main.amount)
                    .font(NativeStyle.money(34))
                    .foregroundStyle(pulse.spent == nil ? NativeStyle.positive : Color.primary)
                    .monospacedDigit()
                    .lineLimit(1)
                    .minimumScaleFactor(0.6)
                    .contentTransition(.numericText())
                Text(main.label).font(.subheadline).foregroundStyle(.secondary)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityElement(children: .combine)
    }
}

/// Income and net as two small figures side by side.
private struct MonthSideFigures: View {
    let pulse: MonthPulse

    var body: some View {
        VStack(alignment: .trailing, spacing: 8) {
            if pulse.spent != nil, let income = pulse.income {
                side(income.label, income.amount, NativeStyle.positive)
            }
            if let net = pulse.net {
                side(net.label, net.text, NativeStyle.tone(net.tone))
            }
        }
    }

    private func side(_ label: String, _ amount: String, _ color: Color) -> some View {
        VStack(alignment: .trailing, spacing: 1) {
            Text(label).font(.caption).foregroundStyle(.secondary)
            Text(amount).font(.subheadline.weight(.semibold)).foregroundStyle(color).monospacedDigit().lineLimit(1)
        }
        .accessibilityElement(children: .combine)
    }
}

/// Design A's header card: the figures, then a bar per day (today in the
/// tint, the days ahead faint) and the biggest day.
struct MonthBarsCard: View {
    let pulse: MonthPulse
    let period: String

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack(alignment: .top) {
                MonthFigures(pulse: pulse, period: period)
                MonthSideFigures(pulse: pulse)
            }
            HStack(alignment: .bottom, spacing: 3) {
                ForEach(pulse.days) { day in
                    VStack(spacing: 4) {
                        Capsule()
                            .fill(color(day))
                            .frame(height: max(4, 54 * day.bar))
                            .frame(height: 54, alignment: .bottom)
                        Text(day.label)
                            .font(.system(size: 8, weight: day.today ? .bold : .regular))
                            .foregroundStyle(day.today ? NativeStyle.tint : Color.secondary)
                            .opacity(showsLabel(day) ? 1 : 0)
                            .fixedSize()
                    }
                    .frame(maxWidth: .infinity)
                }
            }
            .accessibilityHidden(true)
            if let peak = pulse.peak {
                Label(peak, systemImage: "flame.fill")
                    .font(.footnote)
                    .foregroundStyle(.secondary)
                    .labelStyle(PeakLabelStyle())
            }
        }
        .padding(18)
        .background(NativeStyle.card, in: RoundedRectangle(cornerRadius: 26, style: .continuous))
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

/// Design B's header: the figures over the month's running line (how the
/// spending built up day by day), filled under it, today marked.
struct MonthLineCard: View {
    let pulse: MonthPulse
    let period: String

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .top) {
                MonthFigures(pulse: pulse, period: period)
                MonthSideFigures(pulse: pulse)
            }
            RunningLine(days: pulse.days)
                .frame(height: 64)
                .accessibilityHidden(true)
            if let peak = pulse.peak {
                Label(peak, systemImage: "flame.fill")
                    .font(.footnote)
                    .foregroundStyle(.secondary)
                    .labelStyle(PeakLabelStyle())
            }
        }
        .padding(18)
        .background {
            RoundedRectangle(cornerRadius: 26, style: .continuous)
                .fill(LinearGradient(colors: [Theme.Colors.accentSubtle, NativeStyle.card],
                                     startPoint: .topLeading, endPoint: .bottomTrailing))
        }
        .overlay { RoundedRectangle(cornerRadius: 26, style: .continuous).stroke(Color.primary.opacity(0.06)) }
    }
}

/// The running line: one point per day up to today, the area under it in a
/// soft coral, a dot on today.
private struct RunningLine: View {
    let days: [MonthPulse.Day]

    var body: some View {
        GeometryReader { proxy in
            let shown = days.filter { !$0.future }
            let step = days.count > 1 ? proxy.size.width / CGFloat(days.count - 1) : 0
            let point = { (index: Int, day: MonthPulse.Day) in
                CGPoint(x: CGFloat(index) * step, y: proxy.size.height * (1 - CGFloat(day.line)) * 0.92 + 3)
            }
            let points = shown.enumerated().map { point($0.offset, $0.element) }
            ZStack(alignment: .topLeading) {
                Path { path in
                    path.move(to: CGPoint(x: 0, y: proxy.size.height))
                    path.addLine(to: CGPoint(x: proxy.size.width, y: proxy.size.height))
                }
                .stroke(Color.primary.opacity(0.08), style: StrokeStyle(lineWidth: 1, dash: [3, 4]))
                if let last = points.last {
                    Path { path in
                        path.move(to: CGPoint(x: 0, y: proxy.size.height))
                        for next in points { path.addLine(to: next) }
                        path.addLine(to: CGPoint(x: last.x, y: proxy.size.height))
                        path.closeSubpath()
                    }
                    .fill(LinearGradient(colors: [NativeStyle.coral.opacity(0.35), NativeStyle.coral.opacity(0.02)],
                                         startPoint: .top, endPoint: .bottom))
                    Path { path in
                        path.move(to: points[0])
                        for next in points.dropFirst() { path.addLine(to: next) }
                    }
                    .stroke(NativeStyle.tint, style: StrokeStyle(lineWidth: 2.5, lineCap: .round, lineJoin: .round))
                    Circle()
                        .fill(NativeStyle.tint)
                        .overlay(Circle().stroke(NativeStyle.card, lineWidth: 2.5))
                        .frame(width: 11, height: 11)
                        .position(last)
                }
            }
        }
    }
}

// MARK: The chips

/// All · Expenses · Income, then the kind's categories, as chips in one
/// sideways row; the picked one in the tint.
@MainActor
struct ActivityChips: View {
    let model: LedgerModel
    /// The row's lead-in before the first chip.
    var inset: CGFloat = 16
    /// Glass chips (B); A's sit on the sand as solid cards (inside an inset
    /// list's cell the glass's backdrop shows as a band).
    var glass = true
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
            .padding(.horizontal, inset)
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
                .modifier(ChipSurface(picked: picked, glass: glass))
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(picked ? .isSelected : [])
    }
}

/// A chip's surface: glass, or a solid card with a hairline (the tint when picked).
private struct ChipSurface: ViewModifier {
    let picked: Bool
    let glass: Bool

    func body(content: Content) -> some View {
        if glass {
            content.nativeGlass(Capsule(), tint: picked ? NativeStyle.solid : nil, interactive: true)
        } else {
            content
                .background(picked ? NativeStyle.solid : NativeStyle.card, in: Capsule())
                .overlay { Capsule().stroke(Color.primary.opacity(picked ? 0 : 0.08), lineWidth: 1) }
        }
    }
}

// MARK: The days

/// Design A's day heading over its card: the day, then what it spent.
private struct DayCardHeader: View {
    let day: EntryDay

    var body: some View {
        HStack(alignment: .firstTextBaseline) {
            Text(day.title).font(.headline).foregroundStyle(Color.primary)
            Spacer()
            if let spent = day.spent {
                Text(spent).font(.subheadline).foregroundStyle(Theme.Colors.textMuted).monospacedDigit()
            }
        }
        .textCase(nil)
        .padding(.horizontal, -4)
    }
}

/// Design B's sticky day heading: a glass capsule with the day and what it spent.
private struct DayGlassHeader: View {
    let day: EntryDay

    var body: some View {
        HStack(spacing: 8) {
            Text(day.title).font(.subheadline.weight(.semibold)).foregroundStyle(Color.primary)
            if let spent = day.spent {
                Text(verbatim: "·").foregroundStyle(Theme.Colors.textMuted)
                Text(spent).font(.subheadline).foregroundStyle(Theme.Colors.textMuted).monospacedDigit()
            }
        }
        .lineLimit(1)
        .padding(.horizontal, 14)
        .padding(.vertical, 7)
        .nativeGlass(Capsule())
        .frame(maxWidth: .infinity, alignment: .leading)
        .textCase(nil)
        .padding(.vertical, 4)
        .listRowInsets(EdgeInsets(top: 0, leading: 12, bottom: 0, trailing: 12))
    }
}

/// An entry: its badge, its name (the merchant or description first), the
/// muted line (the category, where savings came from, the notes; the group
/// it's shared in; how it repeats; a yearly payment's monthly share; which
/// month a late salary counts for), and the amount (income in green, with
/// its plus) with a foreign amount's value.
struct EntryRowView: View {
    let row: EntryRow
    var badge: CGFloat = 44

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
