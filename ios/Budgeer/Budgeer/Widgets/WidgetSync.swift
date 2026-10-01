// The widgets' snapshot, written by the app (the extension runs no core and
// reads nothing from the server): this month's Spent, Income and Net and By
// category's top three and "Other", from the same core calls as Home
// (HomeFigures: dashboardMath.periodTotals → periodProjection →
// projectedTotals, categoryBars, currency.formatMoney / formatSigned,
// kitMath.signTone and shareSwatch), always for this month
// (periods.thisMonthPeriod), never Home's picked period. Written whenever
// Home's this-month reads come in, and whenever entries, categories, rules or
// the profile change (the app's own saves and deletes included, through the
// live hub); cleared on sign-out. Each write that changes something reloads
// the widgets' timelines.
import Foundation
import BudgeerCore
import WidgetKit

@MainActor
final class WidgetSync {
    /// What the figures depend on (LiveHub's tables).
    static let tables: Set<String> = ["transactions", "categories", "recurring_rules", "profiles"]
    /// By category keeps three before "Other" (Home's donut keeps four).
    static let top = 3

    private let data: DataLayer
    private let core: BudgeerCore
    private let shelf: WidgetShelf
    private let reload: () -> Void
    private let now: @Sendable () -> Date

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
        guard let profile = try? await data.profile.profile(),
              let input = try? await HomeViewModel.input(data: data, profile: profile, periodValue: nil, now: now(), core: core)
        else { return }
        write(input)
    }

    /// Home's reads (or this sync's own): the snapshot, kept when it says
    /// something new.
    func write(_ input: HomeInput) {
        guard let snapshot = try? WidgetSync.snapshot(input, written: now(), core: core) else { return }
        if let kept = shelf.read(), kept.sameAs(snapshot) { return }
        shelf.write(snapshot)
        reload()
    }

    /// This month's snapshot from Home's reads, in the core's language.
    static func snapshot(_ input: HomeInput, written: Date, core: BudgeerCore) throws -> WidgetSnapshot {
        var month = input
        month.periodValue = nil
        let figures = try HomeFigures.compute(month, legendTop: top, core: core)
        let bars = try figures.legend.enumerated().map { index, bar -> WidgetSnapshot.Bar in
            let swatch: String = try core.call("kitMath", "shareSwatch", [index, bar.name])
            return WidgetSnapshot.Bar(label: bar.label, amount: bar.amount, share: bar.share, swatch: swatch)
        }
        return WidgetSnapshot(written: written, from: figures.period.from ?? "", to: figures.period.to ?? "",
                              language: core.language, spent: figures.spent, income: figures.income, net: figures.net,
                              netTone: figures.netTone, bars: bars)
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
