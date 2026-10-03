// The widgets' snapshot, written by the app (the extension runs no core and
// reads nothing from the server): this month's Spent, Income and Net, By
// category's top three and "Other" (the large widgets' top five and
// "Other"), and Home's Budgets card (the extra-large one's), from the same
// core calls as Home (HomeFigures: dashboardMath.periodTotals →
// periodProjection → projectedTotals, categoryBars, currency.formatMoney /
// formatSigned, kitMath.signTone and shareSwatch; BudgetFigures.card),
// always for this month (periods.thisMonthPeriod), never Home's picked
// period. Written whenever Home's this-month reads come in, and whenever
// entries, categories, budgets, rules or the profile change (the app's own
// saves and deletes included, through the live hub); cleared on sign-out.
// Each write that changes something reloads the widgets' timelines.
import Foundation
import BudgeerCore
import WidgetKit

@MainActor
final class WidgetSync {
    /// What the figures depend on (LiveHub's tables).
    static let tables: Set<String> = ["transactions", "categories", "recurring_rules", "profiles", "budgets",
                                      "group_expenses", "settlements"]
    /// By category keeps three before "Other" (Home's donut keeps four); the large widgets five.
    static let top = 3
    static let wideTop = 5
    /// The extra-large widget's budgets: Home's card's first four.
    static let budgetRows = 4

    private let data: DataLayer
    private let core: BudgeerCore
    private let shelf: WidgetShelf
    private let reload: () -> Void
    private let now: @Sendable () -> Date
    /// This month's Budgets card from the last read (Home's own reads carry none).
    private var budgets: BudgetCardFigures?

    init(data: DataLayer, core: BudgeerCore = .shared, shelf: WidgetShelf = .shared,
         reload: @escaping () -> Void = WidgetSync.reloadWidgets, now: @escaping @Sendable () -> Date = { Date() }) {
        self.data = data
        self.core = core
        self.shelf = shelf
        self.reload = reload
        self.now = now
    }

    /// Read this month and write it (a change, the app coming back, the language).
    func refresh() async {
        let instant = now()
        guard let profile = try? await data.profile.profile(),
              let input = try? await HomeViewModel.input(data: data, profile: profile, periodValue: nil, now: instant, core: core)
        else { return }
        if let card = try? await HomeViewModel.budgetCard(data: data, profile: profile, periodValue: nil, now: instant,
                                                          core: core) {
            budgets = card
        }
        write(input)
    }

    /// Home's reads (or this sync's own): the snapshot, kept when it says
    /// something new.
    func write(_ input: HomeInput) {
        guard let snapshot = try? WidgetSync.snapshot(input, budgets: budgets, written: now(), core: core) else { return }
        if let kept = shelf.read(), kept.sameAs(snapshot) { return }
        shelf.write(snapshot)
        reload()
    }

    /// This month's snapshot from Home's reads (and this month's Budgets
    /// card when it has been read), in the core's language.
    static func snapshot(_ input: HomeInput, budgets card: BudgetCardFigures? = nil, written: Date,
                         core: BudgeerCore) throws -> WidgetSnapshot {
        var month = input
        month.periodValue = nil
        let figures = try HomeFigures.compute(month, legendTop: top, core: core)
        let wide = try HomeFigures.compute(month, legendTop: wideTop, core: core)
        return WidgetSnapshot(written: written, from: figures.period.from ?? "", to: figures.period.to ?? "",
                              language: core.language, spent: figures.spent, income: figures.income, net: figures.net,
                              netTone: figures.netTone, bars: try bars(figures.legend, core: core),
                              wideBars: try bars(wide.legend, core: core),
                              budgets: card.map { Array($0.items.prefix(budgetRows)).map(budget) },
                              budgetsEmpty: card.flatMap { $0.items.isEmpty ? $0.empty : nil })
    }

    /// A legend's shares, each in its place's swatch (kitMath.shareSwatch, as Home's donut).
    private static func bars(_ legend: [HomeBar], core: BudgeerCore) throws -> [WidgetSnapshot.Bar] {
        try legend.enumerated().map { index, bar in
            let swatch: String = try core.call("kitMath", "shareSwatch", [index, bar.name])
            return WidgetSnapshot.Bar(label: bar.label, amount: bar.amount, share: bar.share, swatch: swatch)
        }
    }

    private static func budget(_ item: BudgetItem) -> WidgetSnapshot.Budget {
        WidgetSnapshot.Budget(name: item.name, meta: item.meta, valueLabel: item.valueLabel, percent: item.percent,
                              tone: item.tone)
    }

    /// Signed out or the account deleted: the figures leave the phone.
    static func signedOut(shelf: WidgetShelf = .shared, reload: () -> Void = WidgetSync.reloadWidgets) {
        shelf.clear()
        reload()
    }

    nonisolated static func reloadWidgets() {
        WidgetCenter.shared.reloadAllTimelines()
    }
}
