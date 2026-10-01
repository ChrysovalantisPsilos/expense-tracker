// Your salary (Insights' card), after the web's salary page: the regular pay
// with its last raise and the pay chart (each month's pay as a dot over the
// regular pay's steps, the extras as bars under it), the raises, the extras
// (each corrected in place: Holiday pay, 13th month, Bonus or Not an extra;
// without a Bonus category, which one holds them), where the pay goes if
// things go on (1–10 years, three ways, a yearly raise to try), the pay
// against prices in Belgium or Greece, and the totals year by year. Before
// there's a Salary category or any pay, it says how to start. Every figure
// and word is SalaryModel's (the core's); Swift Charts draws the series.
import Charts
import SwiftUI

@MainActor
struct SalaryView: View {
    let model: SalaryModel
    /// Add, preset: income in `category`.
    let addIncome: (_ category: String?) -> Void
    @Environment(AppLanguage.self) private var language
    @State private var projectionInfo = false
    @State private var pricesInfo = false

    var body: some View {
        List {
            switch model.state {
            case .loading:
                Section { NativeLoading() }.listRowBackground(Color.clear)
            case .failed(let message):
                Section { NativeFailed(message: message) { await model.load() } }.listRowBackground(Color.clear)
            case .loaded(let figures):
                if figures.salaryId == nil {
                    emptySection(title: "salary:empty.noCategoryTitle", text: "salary:empty.noCategory") {
                        NavigationLink(value: AppRoute.newCategory("income")) {
                            Label(language.t("salary:empty.addCategory"), systemImage: "plus")
                        }
                    }
                } else if let page = figures.page {
                    if let message = model.message {
                        Section { NativeNotice(text: message, warning: true) }.listRowBackground(NativeStyle.card)
                    }
                    paySection(page)
                    raisesSection(page.raises)
                    extrasSection(page.extras, figures: figures)
                    projectionSection(page)
                    pricesSection(page.prices, country: figures.country)
                    yearsSection(page.years)
                } else {
                    emptySection(title: "salary:empty.noEntriesTitle", text: "salary:empty.noEntries") {
                        Button {
                            addIncome(figures.salaryId)
                        } label: {
                            Label(language.t("salary:empty.addIncome"), systemImage: "plus")
                        }
                        .accessibilityIdentifier("salary.addIncome")
                    }
                }
            }
        }
        .listStyle(.insetGrouped)
        .listSectionSpacing(20)
        .scrollContentBackground(.hidden)
        .background(NativeStyle.canvas)
        .nativeTabBarRoom()
        .navigationTitle(language.t("salary:title"))
        .refreshable { await model.load() }
        .task(id: language.current) { await model.load() }
    }

    // MARK: How to start

    private func emptySection<Action: View>(title: String, text: String,
                                            @ViewBuilder action: () -> Action) -> some View {
        Section {
            VStack(spacing: 10) {
                Image(systemName: "banknote")
                    .font(.system(size: 34, weight: .semibold))
                    .foregroundStyle(NativeStyle.coral)
                    .accessibilityHidden(true)
                Text(language.t(title)).font(.title3.weight(.semibold)).multilineTextAlignment(.center)
                Text(language.t(text))
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 12)
            action()
        }
        .listRowBackground(NativeStyle.card)
    }

    // MARK: The pay

    private func paySection(_ page: SalaryPageParts) -> some View {
        Section {
            VStack(alignment: .leading, spacing: 10) {
                SalaryHeadlineView(headline: page.headline, big: true)
                if page.chart.rows.count > 1 {
                    PayChartView(chart: page.chart)
                        .padding(.top, 6)
                }
                if page.paidMonths == 1 {
                    Text(language.t("salary:oneMonth")).font(.footnote).foregroundStyle(.secondary)
                }
            }
            .padding(.vertical, 8)
        } header: {
            Text(language.t("salary:lead")).font(.footnote).foregroundStyle(.secondary).textCase(nil)
        }
        .listRowBackground(NativeStyle.card)
    }

    // MARK: Raises

    private func raisesSection(_ raises: SalaryRaises) -> some View {
        Section {
            HStack(spacing: 8) {
                SalaryTile(label: language.t("salary:raises.sinceLabel"), text: raises.since, tone: "default", note: nil)
                SalaryTile(label: language.t("salary:raises.average"), text: raises.average.text, tone: raises.average.tone,
                           note: raises.average.note)
            }
            .listRowInsets(EdgeInsets(top: 10, leading: 12, bottom: 10, trailing: 12))
            if raises.rows.isEmpty {
                Text(language.t("salary:raises.none")).font(.subheadline).foregroundStyle(.secondary)
            }
            ForEach(model.allRaises ? raises.rows : Array(raises.rows.prefix(5))) { row in
                HStack(spacing: 12) {
                    NativeIconTile(symbol: row.up ? "chart.line.uptrend.xyaxis" : "chart.line.downtrend.xyaxis",
                                   color: row.up ? NativeTone.green : NativeStyle.negative)
                    VStack(alignment: .leading, spacing: 2) {
                        Text(row.title).font(.body.weight(.semibold))
                        Text(row.meta).font(.footnote).foregroundStyle(.secondary)
                    }
                    Spacer(minLength: 8)
                    Text(row.amount)
                        .font(.subheadline.weight(.bold))
                        .foregroundStyle(row.up ? NativeStyle.positive : NativeStyle.negative)
                        .monospacedDigit()
                }
                .accessibilityElement(children: .combine)
            }
            if let all = raises.all {
                Button(model.allRaises ? language.t("salary:raises.fewer") : all) {
                    withAnimation(.snappy) { model.allRaises.toggle() }
                }
                .frame(maxWidth: .infinity)
            }
        } header: {
            NativeSectionHeader(title: language.t("salary:raises.title"))
        }
        .listRowBackground(NativeStyle.card)
    }

    // MARK: Extras

    private func extrasSection(_ years: [SalaryExtrasYear], figures: SalaryFigures) -> some View {
        Section {
            if figures.bonusId == nil { bonusPicker(figures.bonus) }
            if years.isEmpty {
                Text(language.t("salary:extras.none")).font(.subheadline).foregroundStyle(.secondary)
            }
            let window = model.extrasWindow
            ForEach(years.prefix(window.shown)) { year in
                HStack {
                    Text(verbatim: String(year.year)).font(.headline)
                    Spacer()
                    Text(year.total).font(.subheadline.weight(.bold)).monospacedDigit()
                }
                ForEach(year.rows, id: \.key) { row in extraRow(row) }
            }
            if window.more {
                Button(language.t("salary:extras.older")) { withAnimation(.snappy) { model.showOlderExtras() } }
                    .frame(maxWidth: .infinity)
            }
        } header: {
            SavingsHeader(title: language.t("salary:extras.title"), subtitle: language.t("salary:extras.subtitle"))
        }
        .listRowBackground(NativeStyle.card)
    }

    @ViewBuilder
    private func extraRow(_ row: SalaryExtrasYear.Row) -> some View {
        HStack(spacing: 12) {
            NativeIconTile(symbol: SalaryView.symbol(row.kind), color: SalaryView.extraColor(row.kind))
            VStack(alignment: .leading, spacing: 2) {
                Text(row.title).font(.body.weight(.semibold))
                HStack(spacing: 6) {
                    Text(row.meta).lineLimit(1)
                    if row.guess {
                        Text(language.t("salary:extras.guess"))
                            .fontWeight(.bold)
                            .foregroundStyle(NativeStyle.warning)
                    }
                    if row.fixed {
                        Text(language.t("salary:extras.fixed")).fontWeight(.semibold).foregroundStyle(NativeStyle.positive)
                    }
                }
                .font(.footnote)
                .foregroundStyle(.secondary)
            }
            Spacer(minLength: 6)
            Text(row.amount)
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(row.regular ? Color.secondary : Color.primary)
                .monospacedDigit()
            if model.fixing != row.id {
                Button {
                    withAnimation(.snappy) { model.startFix(row) }
                } label: {
                    Image(systemName: "pencil")
                }
                .buttonStyle(.bordered)
                .controlSize(.small)
                .tint(NativeStyle.tint)
                .accessibilityLabel(Text(row.fixLabel))
            }
        }
        if model.fixing == row.id {
            VStack(alignment: .leading, spacing: 10) {
                Text(language.t("salary:extras.what")).font(.footnote).foregroundStyle(.secondary)
                SalaryChips(choices: model.fixChoices, picked: model.fixKind) { model.pickFix($0) }
                HStack(spacing: 10) {
                    Button(language.t("common:actions.save")) { Task { await model.saveFix() } }
                        .buttonStyle(.borderedProminent)
                        .tint(NativeStyle.solid)
                        .disabled(model.busy)
                        .accessibilityIdentifier("salary.fixSave")
                    Button(language.t("common:actions.cancel")) { withAnimation(.snappy) { model.cancelFix() } }
                        .buttonStyle(.borderless)
                        .disabled(model.busy)
                }
            }
            .padding(.vertical, 4)
        }
    }

    /// No Bonus category: which income category holds the bonuses (saved at once).
    @ViewBuilder
    private func bonusPicker(_ choices: [SalaryFigures.Choice]) -> some View {
        if choices.isEmpty {
            VStack(alignment: .leading, spacing: 6) {
                Text(language.t("salary:bonus.noneYet")).font(.subheadline).foregroundStyle(.secondary)
                NavigationLink(value: AppRoute.newCategory("income")) { Text(language.t("salary:bonus.add")) }
            }
        } else {
            VStack(alignment: .leading, spacing: 6) {
                Text(language.t("salary:bonus.label")).font(.subheadline.weight(.semibold))
                Text(language.t("salary:bonus.hint")).font(.footnote).foregroundStyle(.secondary)
                Menu {
                    ForEach(choices) { choice in
                        Button(choice.label) { Task { await model.setBonusCategory(choice.id) } }
                    }
                } label: {
                    Label(language.t("salary:bonus.choose"), systemImage: "chevron.up.chevron.down")
                }
                .disabled(model.busy)
            }
            .padding(.vertical, 4)
        }
    }

    // MARK: If things go on

    private func projectionSection(_ page: SalaryPageParts) -> some View {
        let projection = page.projection
        return Section {
            Picker(language.t("salary:projection.horizon"),
                   selection: Binding(get: { model.years }, set: { value in withAnimation(.snappy) { model.setYears(value) } })) {
                ForEach(projection.horizons, id: \.value) { choice in Text(choice.label).tag(choice.value) }
            }
            .pickerStyle(.segmented)
            .listRowBackground(Color.clear)
            .listRowInsets(EdgeInsets(top: 0, leading: 0, bottom: 4, trailing: 0))
            if projectionInfo {
                Text(language.t("salary:projection.info")).font(.footnote).foregroundStyle(.secondary)
            }
            ProjectionChartView(projection: projection)
                .padding(.vertical, 8)
            Text(projection.total).font(.caption.weight(.semibold)).foregroundStyle(.secondary)
            ForEach(projection.ways) { way in
                HStack(spacing: 12) {
                    RoundedRectangle(cornerRadius: 2)
                        .fill(SalaryView.wayColor(way.id))
                        .frame(width: 18, height: 4)
                        .frame(width: 32, height: 32)
                        .background(Theme.Colors.subtle, in: RoundedRectangle(cornerRadius: 8, style: .continuous))
                        .accessibilityHidden(true)
                    VStack(alignment: .leading, spacing: 2) {
                        Text(way.title).font(.subheadline.weight(.semibold))
                        Text(way.meta).font(.footnote).foregroundStyle(.secondary)
                    }
                    Spacer(minLength: 6)
                    VStack(alignment: .trailing, spacing: 0) {
                        Text(way.total).font(.subheadline.weight(.bold)).monospacedDigit()
                        Text(language.t("salary:projection.earned")).font(.caption).foregroundStyle(.secondary)
                    }
                }
                .accessibilityElement(children: .combine)
                if way.id == "whatIf" {
                    HStack(spacing: 10) {
                        Text(language.t("salary:projection.slider")).font(.footnote).foregroundStyle(.secondary)
                        Slider(value: Binding(get: { model.whatIf }, set: { model.setWhatIf($0) }),
                               in: projection.slider.min...projection.slider.max, step: projection.slider.step)
                            .tint(NativeStyle.tint)
                            .accessibilityValue(Text(projection.slider.value))
                        Text(projection.slider.value)
                            .font(.subheadline.weight(.bold))
                            .monospacedDigit()
                            .frame(width: 52, alignment: .trailing)
                    }
                    .padding(.leading, 44)
                }
            }
            if let later = projection.trendLater {
                Text(later).font(.footnote).foregroundStyle(.secondary)
            }
            Text(language.t("salary:projection.estimate")).font(.footnote).foregroundStyle(.secondary)
        } header: {
            infoHeader(language.t("salary:projection.title"), shown: $projectionInfo)
        }
        .listRowBackground(NativeStyle.card)
    }

    // MARK: Against prices

    private func pricesSection(_ prices: SalaryPrices, country: String) -> some View {
        Section {
            Picker(language.t("salary:inflation.country"),
                   selection: Binding(get: { country }, set: { value in Task { await model.setCountry(value) } })) {
                ForEach(prices.countries, id: \.value) { choice in Text(choice.label).tag(choice.value) }
            }
            .pickerStyle(.segmented)
            .listRowBackground(Color.clear)
            .listRowInsets(EdgeInsets(top: 0, leading: 0, bottom: 4, trailing: 0))
            if let empty = prices.empty {
                Text(empty).font(.subheadline).foregroundStyle(.secondary)
            } else {
                if prices.choices.count > 1 {
                    HStack {
                        Text(language.t("salary:inflation.since")).font(.subheadline).foregroundStyle(.secondary)
                        Picker(language.t("salary:inflation.since"),
                               selection: Binding(get: { prices.from ?? 0 }, set: { model.setSince($0) })) {
                            ForEach(prices.choices, id: \.value) { choice in Text(choice.label).tag(choice.value) }
                        }
                        .pickerStyle(.segmented)
                    }
                }
                if let headline = prices.headline {
                    Text(headline).font(.body.weight(.semibold))
                }
                HStack(spacing: 8) {
                    ForEach(prices.tiles, id: \.key) { tile in
                        SalaryTile(label: tile.label, text: tile.text, tone: tile.tone, note: nil)
                    }
                }
                .listRowInsets(EdgeInsets(top: 10, leading: 12, bottom: 10, trailing: 12))
                if let gap = prices.gap {
                    NativeRich.text(model.rich(gap)).font(.subheadline).foregroundStyle(.secondary)
                }
            }
            if pricesInfo {
                Text(prices.info).font(.footnote).foregroundStyle(.secondary)
            }
        } header: {
            infoHeader(language.t("salary:inflation.title"), shown: $pricesInfo)
        }
        .listRowBackground(NativeStyle.card)
    }

    // MARK: Year by year

    private func yearsSection(_ years: [SalaryYear]) -> some View {
        Section {
            ForEach(years) { year in
                HStack {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(year.title).font(.body.weight(.semibold))
                        Text(year.meta).font(.footnote).foregroundStyle(.secondary)
                    }
                    Spacer(minLength: 8)
                    Text(year.amount).font(.subheadline.weight(.bold)).monospacedDigit()
                }
                .accessibilityElement(children: .combine)
            }
        } header: {
            NativeSectionHeader(title: language.t("salary:years.title"))
        }
        .listRowBackground(NativeStyle.card)
    }

    /// A section's title with its ⓘ (opens the explanation in place).
    private func infoHeader(_ title: String, shown: Binding<Bool>) -> some View {
        HStack(spacing: 6) {
            Text(title).font(.title3.weight(.semibold)).foregroundStyle(Color.primary)
            NativeInfoButton(shown: shown)
        }
        .textCase(nil)
        .padding(.horizontal, -4)
    }

    // MARK: Looks

    static func symbol(_ kind: String) -> String {
        switch kind {
        case "holiday": return "sun.max.fill"
        case "thirteenth": return "gift.fill"
        case "bonus": return "sparkles"
        default: return "wallet.pass.fill"
        }
    }

    /// An extra's colour, as the web's chart series (holiday amber, 13th month chart.6, bonus chart.7).
    static func extraColor(_ kind: String) -> Color {
        switch kind {
        case "holiday": return Theme.Palette.amber400
        case "thirteenth": return Theme.Palette.chart6
        case "bonus": return Theme.Colors.chart7
        default: return NativeTone.sand
        }
    }

    /// A projection's line: my trend coral, indexation chart.7, what if amber (dashed).
    static func wayColor(_ id: String) -> Color {
        switch id {
        case "trend": return NativeStyle.coral
        case "index": return Theme.Colors.chart7
        default: return Theme.Palette.amber400
        }
    }
}

// MARK: - Pieces

/// The regular pay a month, big, with the last raise under it (or "No raise yet").
struct SalaryHeadlineView: View {
    let headline: SalaryHeadline
    var big = false
    @Environment(AppLanguage.self) private var language

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(language.t("salary:regular")).font(.footnote).foregroundStyle(.secondary)
            HStack(alignment: .firstTextBaseline, spacing: 6) {
                Text(headline.level)
                    .font(NativeStyle.money(big ? 38 : 26))
                    .monospacedDigit()
                    .lineLimit(1)
                    .minimumScaleFactor(0.6)
                    .accessibilityIdentifier("salary.level")
                Text(language.t("salary:perMonth")).font(.subheadline).foregroundStyle(.secondary)
            }
            if let raise = headline.raise {
                Label(raise, systemImage: "arrow.up.right")
                    .font((big ? Font.subheadline : Font.footnote).weight(.bold))
                    .foregroundStyle(NativeStyle.positive)
                    .padding(.horizontal, 10)
                    .padding(.vertical, 4)
                    .background(NativeStyle.positive.opacity(0.12), in: Capsule())
            } else {
                Text(language.t("salary:noRaise")).font(big ? Font.subheadline : Font.footnote).foregroundStyle(.secondary)
            }
        }
    }
}

/// A figure on a soft tile, its note under it.
struct SalaryTile: View {
    let label: String
    let text: String
    let tone: String
    let note: String?

    var body: some View {
        VStack(spacing: 3) {
            Text(label).font(.caption).foregroundStyle(.secondary).multilineTextAlignment(.center).lineLimit(2)
            Text(text)
                .font(.headline)
                .foregroundStyle(SavingsView.color(tone))
                .monospacedDigit()
                .lineLimit(1)
                .minimumScaleFactor(0.7)
            if let note { Text(note).font(.caption2).foregroundStyle(.secondary).multilineTextAlignment(.center) }
        }
        .padding(.horizontal, 4)
        .frame(maxWidth: .infinity, minHeight: 62)
        .background(Theme.Colors.subtle, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
        .accessibilityElement(children: .combine)
    }
}

/// The correction's choices as chips: the picked one filled with a check.
struct SalaryChips: View {
    let choices: [CoreChoice]
    let picked: String
    let pick: (String) -> Void

    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ForEach(choices, id: \.value) { choice in
                    let on = choice.value == picked
                    Button {
                        pick(choice.value)
                    } label: {
                        Label(choice.label, systemImage: on ? "checkmark" : SalaryView.symbol(choice.value))
                            .font(.footnote.weight(.semibold))
                            .padding(.horizontal, 12)
                            .padding(.vertical, 7)
                            .foregroundStyle(on ? Color.white : Color.primary)
                            .background(on ? NativeStyle.solid : Theme.Colors.subtle, in: Capsule())
                    }
                    .buttonStyle(.plain)
                    .accessibilityAddTraits(on ? .isSelected : [])
                }
            }
        }
    }
}

/// The pay chart: the regular pay's steps as a soft area with its line, each
/// month's pay as a dot (hollow off the level), the extras stacked under it,
/// a tick a year, and the legend.
struct PayChartView: View {
    let chart: PayChart
    @Environment(AppLanguage.self) private var language

    private var low: Double { chart.axis.domain.first ?? 0 }
    private var high: Double { chart.axis.domain.last ?? 1 }
    private var dot: CGFloat { chart.rows.count > 36 ? 4.5 : 6 }

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Chart {
                ForEach(chart.rows, id: \.key) { row in
                    AreaMark(x: .value("month", row.key), yStart: .value("low", low), yEnd: .value("level", row.level))
                        .interpolationMethod(.stepEnd)
                        .foregroundStyle(LinearGradient(colors: [NativeStyle.coral.opacity(0.2), NativeStyle.coral.opacity(0.02)],
                                                        startPoint: .top, endPoint: .bottom))
                    LineMark(x: .value("month", row.key), y: .value("level", row.level))
                        .interpolationMethod(.stepEnd)
                        .foregroundStyle(NativeStyle.coral.opacity(0.7))
                        .lineStyle(StrokeStyle(lineWidth: 1.25))
                    if let pay = row.pay {
                        PointMark(x: .value("month", row.key), y: .value("pay", pay))
                            .symbol {
                                if row.off {
                                    Circle().strokeBorder(NativeStyle.coral, lineWidth: 1.5).frame(width: dot, height: dot)
                                } else {
                                    Circle().fill(NativeStyle.coral).frame(width: dot, height: dot)
                                }
                            }
                    }
                }
            }
            .chartYScale(domain: low...high)
            .chartYAxis { valueAxis(chart.axis) }
            .chartXAxis { yearAxis(chart.ticks, hidden: chart.hasExtras) }
            .frame(height: 170)
            if chart.hasExtras {
                Chart {
                    ForEach(chart.rows, id: \.key) { row in
                        ForEach(SalaryView.extraKinds, id: \.self) { kind in
                            BarMark(x: .value("month", row.key), y: .value("amount", row.amount(kind)))
                                .foregroundStyle(SalaryView.extraColor(kind))
                        }
                    }
                }
                .chartYAxis { AxisMarks(position: .leading, values: [Double]()) }
                .chartXAxis { yearAxis(chart.ticks, hidden: false) }
                .frame(height: 64)
            }
            legend
        }
        .accessibilityElement()
        .accessibilityLabel(Text(chart.aria))
    }

    /// A legend entry: its mark ('dot', 'ring', 'line', 'square'), its words' key, its colour.
    private struct LegendItem: Identifiable {
        let shape: String
        let key: String
        let color: Color
        var id: String { key }
    }

    private var legendItems: [LegendItem] {
        var items = [LegendItem(shape: "dot", key: "salary:chart.pay", color: NativeStyle.coral)]
        if chart.hasOff { items.append(LegendItem(shape: "ring", key: "salary:chart.off", color: NativeStyle.coral)) }
        items.append(LegendItem(shape: "line", key: "salary:chart.regular", color: NativeStyle.coral))
        if chart.hasExtras {
            for kind in SalaryView.extraKinds {
                items.append(LegendItem(shape: "square", key: "salary:extras.\(kind)", color: SalaryView.extraColor(kind)))
            }
        }
        return items
    }

    private var legend: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 12) {
                ForEach(legendItems) { item in
                    HStack(spacing: 5) {
                        swatch(item.shape, item.color)
                        Text(language.t(item.key)).font(.caption).foregroundStyle(.secondary)
                    }
                }
            }
        }
        .accessibilityHidden(true)
    }

    @ViewBuilder private func swatch(_ shape: String, _ color: Color) -> some View {
        switch shape {
        case "dot": Circle().fill(color).frame(width: 8, height: 8)
        case "ring": Circle().strokeBorder(color, lineWidth: 1.5).frame(width: 8, height: 8)
        case "line": Capsule().fill(color.opacity(0.7)).frame(width: 14, height: 2)
        default: RoundedRectangle(cornerRadius: 2).fill(color).frame(width: 10, height: 10)
        }
    }
}

extension SalaryView {
    /// The extras in the chart's order.
    static let extraKinds = ["holiday", "thirteenth", "bonus"]
}

extension PayChart.Row {
    /// This month's extra of `kind` (major units).
    func amount(_ kind: String) -> Double {
        switch kind {
        case "holiday": return holiday
        case "thirteenth": return thirteenth
        default: return bonus
        }
    }
}

/// A money chart's value axis: the core's round ticks with their labels.
@AxisContentBuilder
func valueAxis(_ axis: ChartAxisParts) -> some AxisContent {
    AxisMarks(position: .leading, values: axis.ticks) { value in
        AxisGridLine()
        AxisValueLabel {
            if let amount = value.as(Double.self), let index = axis.ticks.firstIndex(of: amount) {
                Text(verbatim: axis.labels[index])
            }
        }
    }
}

/// A monthly chart's year ticks ("2024", "2025").
@AxisContentBuilder
func yearAxis(_ ticks: [YearTick], hidden: Bool) -> some AxisContent {
    AxisMarks(values: hidden ? [] : ticks.map(\.key)) { value in
        AxisValueLabel {
            if let key = value.as(String.self), let tick = ticks.first(where: { $0.key == key }) {
                Text(verbatim: tick.label)
            }
        }
    }
}

/// If things go on: each way's monthly pay as a step line (what if dashed).
struct ProjectionChartView: View {
    let projection: SalaryProjection

    var body: some View {
        Chart {
            ForEach(projection.ways.reversed()) { way in
                ForEach(way.series, id: \.key) { point in
                    LineMark(x: .value("month", point.key), y: .value("pay", point.value), series: .value("way", way.id))
                        .interpolationMethod(.stepEnd)
                        .foregroundStyle(SalaryView.wayColor(way.id))
                        .lineStyle(StrokeStyle(lineWidth: way.id == "trend" ? 2.5 : 2, dash: way.id == "whatIf" ? [5, 4] : []))
                }
            }
        }
        .chartYScale(domain: (projection.axis.domain.first ?? 0)...(projection.axis.domain.last ?? 1))
        .chartYAxis { valueAxis(projection.axis) }
        .chartXAxis { yearAxis(projection.ticks, hidden: false) }
        .frame(height: 160)
        .accessibilityHidden(true)
    }
}
