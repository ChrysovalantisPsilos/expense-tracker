// Insights (from More), after the web's page: "Where your money went" (the
// picked month's spending as a stacked bar and its shares, then the last six
// months as bars: tap one to split that month), "Spending abroad" when there
// was some, "Income vs expenses" (this month's income, spend, what's left
// over, the change from last month, and the six months side by side), Your
// salary (its page), Net worth (the accounts, each edited on its page,
// removed after a question; the savings pot or the savings accounts) and the
// statement as one compact row (the dates, then a small Export button: PDF or Excel, handed
// to the share sheet). Picking a month springs the bars and the split to it.
// Every figure and word is the model's (the core's); Swift Charts only draws.
import BudgeerCore
import Charts
import SwiftUI
import UIKit

@MainActor
struct InsightsView: View {
    let model: InsightsModel
    @Environment(AppLanguage.self) private var language
    @State private var removing: String?
    @State private var sharing = false

    var body: some View {
        List {
            switch model.state {
            case .loading:
                Section { NativeLoading() }.listRowBackground(Color.clear)
            case .failed(let message):
                Section { NativeFailed(message: message) { await model.load() } }.listRowBackground(Color.clear)
            case .loaded(let figures):
                spending(figures)
                if let abroad = figures.abroad { abroadSection(abroad) }
                income(figures)
                if model.salaryRead { salarySection }
                netWorthSection
                statementSection
            }
        }
        .listStyle(.insetGrouped)
        .scrollContentBackground(.hidden)
        .background(NativeStyle.canvas)
        .nativeTabBarRoom()
        .navigationTitle(language.t("insights:title"))
        .refreshable { await model.load() }
        .task(id: language.current) { await model.load() }
        .confirmationDialog(removing.map { model.removeQuestion($0) } ?? "",
                            isPresented: Binding(get: { removing != nil }, set: { if !$0 { removing = nil } }),
                            titleVisibility: .visible, presenting: removing) { id in
            Button(language.t("common:actions.delete"), role: .destructive) { Task { await model.removeAccount(id) } }
            Button(language.t("common:actions.cancel"), role: .cancel) {}
        }
        .sheet(isPresented: $sharing) {
            if let file = model.statementFile { ShareSheet(items: [file]) }
        }
    }

    // MARK: Your salary

    private var salarySection: some View {
        Section {
            if let card = model.salary {
                HStack(alignment: .bottom, spacing: 12) {
                    SalaryHeadlineView(headline: SalaryHeadline(level: card.level, raise: card.raise))
                    Spacer(minLength: 8)
                    if card.steps.count > 1 {
                        Chart {
                            ForEach(Array(card.steps.enumerated()), id: \.offset) { index, level in
                                AreaMark(x: .value("month", index), y: .value("pay", Double(level)))
                                    .interpolationMethod(.stepEnd)
                                    .foregroundStyle(NativeStyle.coral.opacity(0.12))
                                LineMark(x: .value("month", index), y: .value("pay", Double(level)))
                                    .interpolationMethod(.stepEnd)
                                    .foregroundStyle(NativeStyle.coral)
                                    .lineStyle(StrokeStyle(lineWidth: 2))
                            }
                        }
                        .chartXAxis(.hidden)
                        .chartYAxis(.hidden)
                        .chartYScale(domain: .automatic(includesZero: false))
                        .frame(width: 120, height: 64)
                        .accessibilityHidden(true)
                    }
                }
                .padding(.vertical, 6)
            } else {
                Text(language.t("salary:card.empty")).font(.subheadline).foregroundStyle(.secondary)
            }
            NavigationLink(value: AppRoute.salary) {
                Text(language.t(model.salary == nil ? "salary:card.start" : "salary:card.open"))
                    .foregroundStyle(NativeStyle.tint)
            }
            .accessibilityIdentifier("insights.salary")
        } header: {
            NativeSectionHeader(title: language.t("salary:title"))
        }
        .listRowBackground(NativeStyle.card)
    }

    // MARK: Net worth

    private var netWorthSection: some View {
        Section {
            if let message = model.netWorthError {
                NativeNotice(text: message, warning: true)
            }
            if let worth = model.netWorth {
                let card = worth.card
                HStack(spacing: 10) {
                    tile(language.t("insights:netWorth.assets"), card.assets, color: NativeStyle.positive)
                    tile(language.t("insights:netWorth.debts"), card.debts.text, color: SavingsView.color(card.debts.tone))
                }
                .listRowInsets(EdgeInsets(top: 10, leading: 12, bottom: 10, trailing: 12))
                if card.empty {
                    Text(language.t("insights:netWorth.empty")).font(.subheadline).foregroundStyle(.secondary)
                }
                if !card.savings.isEmpty {
                    NavigationLink(value: AppRoute.savings) {
                        HStack {
                            Text(language.t("insights:netWorth.savings").capsLabel)
                                .font(.caption.weight(.semibold))
                                .foregroundStyle(.secondary)
                            Spacer()
                            Text(language.t("insights:netWorth.seeSavings")).font(.footnote).foregroundStyle(NativeStyle.tint)
                        }
                    }
                    ForEach(card.savings) { row in accountRow(row) }
                }
                if card.pot != nil || !card.accounts.isEmpty {
                    Text(language.t("insights:netWorth.accounts").capsLabel)
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(.secondary)
                    if let pot = card.pot {
                        NavigationLink(value: AppRoute.savings) {
                            HStack(spacing: 12) {
                                NativeIconTile(symbol: "banknote.fill", color: NativeTone.green)
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(language.t("insights:netWorth.savings")).font(.body.weight(.semibold))
                                    Text((pot.overdrawn ?? "") + language.t("insights:netWorth.seeSavings"))
                                        .font(.footnote)
                                        .foregroundStyle(.secondary)
                                }
                                Spacer(minLength: 8)
                                Text(pot.amount)
                                    .font(.subheadline.weight(.semibold))
                                    .foregroundStyle(SavingsView.color(pot.tone))
                                    .monospacedDigit()
                            }
                        }
                    }
                    ForEach(card.accounts) { row in accountRow(row) }
                }
                HStack {
                    Text(language.t("insights:netWorth.title")).fontWeight(.semibold)
                    Spacer()
                    Text(card.net.text)
                        .font(NativeStyle.money(20, relativeTo: .title3))
                        .foregroundStyle(SavingsView.color(card.net.tone))
                        .monospacedDigit()
                        .accessibilityIdentifier("insights.netWorth")
                }
            } else if model.netWorthFailed {
                NativeFailed(message: language.t("common:errors.generic")) { await model.load() }
            }
        } header: {
            HStack(alignment: .firstTextBaseline) {
                Text(language.t("insights:netWorth.title")).font(.title3.weight(.semibold)).foregroundStyle(Color.primary)
                Spacer(minLength: 8)
                NavigationLink(value: AppRoute.newNetWorthAccount) {
                    Label(language.t("insights:netWorth.add"), systemImage: "plus").font(.subheadline)
                }
                .foregroundStyle(NativeStyle.tint)
                .accessibilityIdentifier("insights.addAccount")
            }
            .textCase(nil)
            .padding(.horizontal, -4)
            .padding(.bottom, 2)
        }
        .listRowBackground(NativeStyle.card)
    }

    /// An account: a debt (minus, red), a savings account or an asset; tap to edit, swipe to remove.
    private func accountRow(_ row: NetWorthCard.Row) -> some View {
        NavigationLink(value: AppRoute.netWorthAccount(row.id)) {
            HStack(spacing: 12) {
                NativeIconTile(symbol: InsightsView.accountSymbol(row.kind), color: InsightsView.accountColor(row.kind))
                VStack(alignment: .leading, spacing: 2) {
                    Text(row.title).font(.body.weight(.semibold)).lineLimit(1)
                    Text(row.meta).font(.footnote).foregroundStyle(.secondary)
                }
                Spacer(minLength: 8)
                Text(row.amount)
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(SavingsView.color(row.tone))
                    .monospacedDigit()
            }
        }
        .swipeActions(edge: .trailing, allowsFullSwipe: false) {
            Button(role: .destructive) {
                removing = row.id
            } label: {
                Label(language.t("common:actions.delete"), systemImage: "trash")
            }
        }
        .accessibilityIdentifier("insights.account.\(row.id)")
    }

    static func accountSymbol(_ kind: String) -> String {
        switch kind {
        case "debt": return "creditcard.fill"
        case "savings": return "banknote.fill"
        default: return "building.columns.fill"
        }
    }

    static func accountColor(_ kind: String) -> Color {
        switch kind {
        case "debt": return NativeTone.coral
        case "savings": return NativeTone.green
        default: return NativeTone.sand
        }
    }

    // MARK: The statement

    private var statementSection: some View {
        Section {
            HStack(spacing: 12) {
                NativeIconTile(symbol: "doc.text.fill")
                VStack(alignment: .leading, spacing: 4) {
                    Text(language.t("insights:reports.title")).font(.body.weight(.semibold)).lineLimit(1)
                    HStack(spacing: 4) {
                        DatePicker(language.t("insights:reports.from"),
                                   selection: Binding(get: { ISODay.date(model.statementFrom) ?? Date() },
                                                      set: { model.setStatementFrom(ISODay.string($0)) }),
                                   displayedComponents: .date)
                        Text(verbatim: "–").foregroundStyle(.secondary)
                        DatePicker(language.t("insights:reports.to"),
                                   selection: Binding(get: { ISODay.date(model.statementTo) ?? Date() },
                                                      set: { model.setStatementTo(ISODay.string($0)) }),
                                   displayedComponents: .date)
                    }
                    .labelsHidden()
                    .datePickerStyle(.compact)
                    .controlSize(.small)
                }
                Spacer(minLength: 4)
                Menu {
                    Button { export("pdf") } label: {
                        Label(language.t("insights:reports.pdf"), systemImage: "doc.richtext")
                    }
                    .accessibilityIdentifier("insights.pdf")
                    Button { export("xlsx") } label: {
                        Label(language.t("insights:reports.excel"), systemImage: "tablecells")
                    }
                    .accessibilityIdentifier("insights.excel")
                } label: {
                    HStack(spacing: 5) {
                        if model.exporting != nil {
                            ProgressView().controlSize(.small)
                            Text(language.t("insights:reports.building"))
                        } else {
                            Image(systemName: "square.and.arrow.up")
                            Text(language.t("ios:native.insights.export"))
                        }
                    }
                    .font(.subheadline.weight(.semibold))
                    .lineLimit(1)
                    .padding(.horizontal, 12)
                    .frame(minHeight: 36)
                    .background(Theme.Colors.accentSubtle, in: Capsule())
                    .foregroundStyle(NativeStyle.tint)
                }
                .fixedSize()
                .disabled(model.exporting != nil || model.noEntries)
                .accessibilityIdentifier("insights.export")
            }
            .padding(.vertical, 4)
            if model.noEntries {
                Text(language.t("insights:reports.noEntries")).font(.footnote).foregroundStyle(.secondary)
            }
            if let format = model.exporting {
                Text(language.t(format == "xlsx" ? "insights:reports.preparingExcel" : "insights:reports.preparingPdf"))
                    .font(.footnote)
                    .foregroundStyle(.secondary)
            }
            if let error = model.statementError {
                NativeNotice(text: error, warning: true)
            }
            if let file = model.statementFile {
                ShareLink(item: file) {
                    Label(file.lastPathComponent, systemImage: "square.and.arrow.up").font(.subheadline)
                }
                .accessibilityIdentifier("insights.share")
            }
        } footer: {
            Text(language.t("insights:reports.lead"))
        }
        .listRowBackground(NativeStyle.card)
    }

    /// Make the statement, then hand it to the share sheet.
    private func export(_ format: String) {
        Task {
            await model.export(format)
            if model.statementFile != nil { sharing = true }
        }
    }

    // MARK: Where your money went

    private func shareRow(_ item: ShareItem, index: Int) -> some View {
        HStack(spacing: 10) {
            Circle().fill(NativeSwatch.color(index, item.name)).frame(width: 10, height: 10)
            Text(item.label).lineLimit(1)
            Spacer()
            Text(verbatim: "\(item.share)%")
                .fontWeight(.semibold)
                .monospacedDigit()
                .nativeFigure(Double(item.share))
        }
        .accessibilityElement(children: .combine)
    }

    private func spending(_ figures: InsightsFigures) -> some View {
        Section {
            if figures.shares.isEmpty {
                Text(language.t("insights:spending.empty")).foregroundStyle(.secondary)
            } else {
                NativeShareBar(shares: figures.shares.map { ($0.name, $0.share) }).padding(.vertical, 6)
                ForEach(Array(figures.shares.enumerated()), id: \.element.name) { index, item in
                    // Each entry opens its category's page (or its group's), as the web's legend links.
                    if let route = AppPaths.route(item.to) {
                        NavigationLink(value: route) { shareRow(item, index: index) }
                            .accessibilityHint(item.linkLabel ?? "")
                    } else {
                        shareRow(item, index: index)
                    }
                }
            }
            if figures.hasTrend {
                VStack(alignment: .leading, spacing: 8) {
                    HStack {
                        Text(language.t("insights:lastMonths")).font(.footnote.weight(.semibold)).foregroundStyle(.secondary)
                        Spacer()
                        Text(figures.bars.aside).font(.footnote).foregroundStyle(.secondary)
                    }
                    Chart {
                        ForEach(Array(figures.bars.bars.enumerated()), id: \.offset) { index, bar in
                            BarMark(x: .value("month", bar.label), y: .value("spent", bar.value), width: .ratio(0.6))
                                .foregroundStyle(index == figures.picked ? Theme.Palette.brand500 : Theme.Colors.trendRest)
                                .cornerRadius(5)
                                .accessibilityLabel(Text(bar.ariaLabel))
                        }
                    }
                    .chartYAxis(.hidden)
                    .chartOverlay { proxy in
                        GeometryReader { geometry in
                            Rectangle().fill(Color.clear).contentShape(Rectangle())
                                .gesture(SpatialTapGesture().onEnded { tap in
                                    guard let plot = proxy.plotFrame else { return }
                                    let x = tap.location.x - geometry[plot].origin.x
                                    if let label: String = proxy.value(atX: x),
                                       let index = figures.bars.bars.firstIndex(where: { $0.label == label }) {
                                        withAnimation(NativeMotion.pick) { model.pick(index) }
                                    }
                                })
                        }
                    }
                    .frame(height: 120)
                    .animation(NativeMotion.pick, value: figures.picked)
                    .accessibilityIdentifier("insights.months")
                }
                .padding(.vertical, 6)
            }
        } header: {
            NativeSectionHeader(title: language.t("insights:spending.title"))
        } footer: {
            Text(figures.monthLabel)
        }
        .listRowBackground(NativeStyle.card)
        .sensoryFeedback(.selection, trigger: figures.picked)
    }

    // MARK: Spending abroad

    private func abroadSection(_ card: InsightsFigures.Abroad) -> some View {
        Section {
            ForEach(card.rows) { row in
                VStack(alignment: .leading, spacing: 2) {
                    HStack {
                        Text(row.label).fontWeight(.semibold)
                        Spacer()
                        Text(verbatim: "@ " + row.rate).font(.caption).foregroundStyle(.secondary)
                    }
                    HStack(spacing: 6) {
                        Text(row.from).foregroundStyle(.secondary)
                        Image(systemName: "arrow.right").font(.caption).foregroundStyle(.secondary)
                        Text(row.to).fontWeight(.semibold).foregroundStyle(NativeStyle.tint)
                    }
                    .font(.subheadline)
                }
                .accessibilityElement(children: .combine)
            }
            HStack {
                Text(language.t("insights:total")).foregroundStyle(.secondary)
                Spacer()
                Text(card.total).fontWeight(.semibold)
            }
        } header: {
            NativeSectionHeader(title: language.t("insights:abroad.title"))
        } footer: {
            Text([card.subtitle, card.more].compactMap { $0 }.joined(separator: " · "))
        }
        .listRowBackground(NativeStyle.card)
        .accessibilityIdentifier("insights.abroad")
    }

    // MARK: Income vs expenses

    private func income(_ figures: InsightsFigures) -> some View {
        Section {
            HStack(spacing: 10) {
                tile(language.t("insights:income.income"), figures.income.income, color: NativeStyle.positive)
                tile(language.t("insights:income.spent"), figures.income.spent, color: .primary)
            }
            .listRowInsets(EdgeInsets(top: 10, leading: 12, bottom: 10, trailing: 12))
            HStack {
                Text(language.t("insights:income.leftOver")).foregroundStyle(.secondary)
                Spacer()
                Text(figures.income.net.text).fontWeight(.semibold).foregroundStyle(NativeStyle.tone(figures.income.net.tone))
            }
            if let delta = figures.income.delta {
                // SpendDelta: up is the bad direction for spending.
                HStack {
                    Text(language.t("insights:income.vsLastMonth")).foregroundStyle(.secondary)
                    Spacer()
                    Label(String(abs(delta)) + "%", systemImage: delta > 0 ? "arrow.up.right" : "arrow.down.right")
                        .fontWeight(.semibold)
                        .foregroundStyle(delta > 0 ? NativeStyle.negative : NativeStyle.positive)
                }
            }
            if figures.hasTrend {
                let income = language.t("insights:income.income")
                let expenses = language.t("insights:income.expenses")
                Chart {
                    ForEach(Array(figures.chart.enumerated()), id: \.offset) { _, month in
                        BarMark(x: .value("month", month.label), y: .value("amount", month.income))
                            .foregroundStyle(by: .value("series", income))
                            .position(by: .value("series", income))
                            .cornerRadius(3)
                        BarMark(x: .value("month", month.label), y: .value("amount", month.expense))
                            .foregroundStyle(by: .value("series", expenses))
                            .position(by: .value("series", expenses))
                            .cornerRadius(3)
                    }
                }
                .chartForegroundStyleScale([income: Theme.Colors.positive, expenses: Theme.Palette.brand500])
                .chartYAxis {
                    // The web's tick labels ("1.6k", "1,6 χιλ."): chartAxis.axisTick.
                    AxisMarks(position: .leading) { value in
                        AxisGridLine()
                        AxisValueLabel {
                            if let amount = value.as(Double.self) { Text(InsightsView.axisTick(amount)) }
                        }
                    }
                }
                .chartLegend(position: .bottom)
                .frame(height: 220)
                .padding(.vertical, 8)
            } else {
                Text(language.t("insights:income.empty")).foregroundStyle(.secondary)
            }
        } header: {
            NativeSectionHeader(title: language.t("insights:income.title"))
        } footer: {
            Text(language.t("insights:thisMonth"))
        }
        .listRowBackground(NativeStyle.card)
    }

    private func tile(_ label: String, _ value: String, color: Color) -> some View {
        VStack(spacing: 2) {
            Text(label).font(.footnote).foregroundStyle(.secondary)
            Text(value).font(.headline).foregroundStyle(color).monospacedDigit().lineLimit(1).minimumScaleFactor(0.7)
                .nativeFigure(value)
        }
        .frame(maxWidth: .infinity, minHeight: 58)
        .background(Theme.Colors.subtle, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
    }

    /// A y-axis tick in major units, worded by the core as the web's money charts word it.
    static func axisTick(_ amount: Double) -> String {
        (try? BudgeerCore.shared.call("chartAxis", "axisTick", [amount]) as String) ?? ""
    }
}

/// The system's share sheet for a file (Files, Mail, AirDrop, Print…).
struct ShareSheet: UIViewControllerRepresentable {
    let items: [Any]

    func makeUIViewController(context: Context) -> UIActivityViewController {
        UIActivityViewController(activityItems: items, applicationActivities: nil)
    }

    func updateUIViewController(_ controller: UIActivityViewController, context: Context) {}
}
