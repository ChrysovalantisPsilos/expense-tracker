// The Transactions tab's state, after the web's LedgerPage: Expenses |
// Income | All, a period from the picker (this month by default), and the
// search, which spans all history as on the web (up to 1,000 rows, refined
// by the core's filterTransactions). Reads through the data layer, pending
// rates filled as fx.js does, the figures from the core (LedgerFigures).
import Foundation
import Observation
import BudgeerCore

@MainActor
@Observable
final class LedgerModel {
    enum State: Equatable {
        case loading
        case loaded(LedgerFigures)
        case failed(String)
    }

    /// The web's ?type=: 'expense' (the default), 'income' or 'all'.
    private(set) var type = "expense"
    private(set) var periods: [HomePeriod] = []
    private(set) var periodValue = ""
    private(set) var text = ""
    private(set) var page = 1
    private(set) var state: State = .loading

    private var profile: JSONValue = [:]
    private var savings: JSONValue = []
    private var rows: JSONValue = []
    private var oldest: String?
    private var oldestKnown = false
    private var searchTask: Task<Void, Never>?

    private let data: DataLayer
    private let core: BudgeerCore
    private let now: @Sendable () -> Date

    init(data: DataLayer, core: BudgeerCore = .shared, now: @escaping @Sendable () -> Date = { Date() }) {
        self.data = data
        self.core = core
        self.now = now
    }

    /// The kind the reads and the rows take (nil for All).
    var kind: String? { type == "all" ? nil : type }
    var searching: Bool { (try? core.call("txnFilter", "isFiltering", [text, LedgerFigures.noFilters])) ?? false }
    var period: HomePeriod? { periods.first { $0.value == periodValue } ?? periods.first }

    /// The profile, the savings categories and the pickers' periods, then the rows.
    func load() async {
        do {
            let instant = now()
            profile = try await data.profile.profile()
            savings = try await data.categories.savingsCategories()
            let options = await PeriodSource.load(profile: profile, data: data, core: core, now: instant)
            periods = options.periods
            oldest = options.oldest
            oldestKnown = options.oldestKnown
            // This month is every picker's default (and stays picked while it exists).
            let thisMonth: HomePeriod = try core.call("periods", "thisMonthPeriod", [JSDate(instant)])
            if periodValue.isEmpty || !periods.contains(where: { $0.value == periodValue }) {
                periodValue = thisMonth.value
            }
            await reloadRows()
        } catch {
            if case .loaded = state { return }
            state = .failed(String(describing: error))
        }
    }

    /// The rows for the current view, then the figures.
    func reloadRows() async {
        do {
            let query: TxnQuery
            if searching {
                query = TxnQuery(kind: kind, limit: 1000)
            } else {
                query = TxnQuery(kind: kind, from: period?.from, to: period?.to)
            }
            let base = profile["base_currency"]?.stringValue ?? "EUR"
            let read = try await data.transactions.transactions(query)
            rows = try await FxRates.fillPending(read, base: base, today: try core.isoDate(now()), fx: data.fx, core: core)
            try refigure()
        } catch {
            if case .loaded = state { return } // a failed refresh keeps the list
            state = .failed(String(describing: error))
        }
    }

    private func refigure() throws {
        let figures = try LedgerFigures.compute(rows: rows, profile: profile, categories: savings, kind: kind,
                                                periodLabel: period?.label ?? "", text: text, oldest: oldest,
                                                oldestKnown: oldestKnown, page: page, core: core)
        state = .loaded(figures)
    }

    func setType(_ next: String) async {
        guard next != type else { return }
        type = next
        page = 1
        await reloadRows()
    }

    func setPeriod(_ value: String) async {
        guard value != periodValue else { return }
        periodValue = value
        page = 1
        await reloadRows()
    }

    /// The search text: the list follows after a short pause (typing fires per key).
    func setText(_ value: String) {
        let wasSearching = searching
        text = value
        page = 1
        searchTask?.cancel()
        searchTask = Task { [weak self] in
            try? await Task.sleep(nanoseconds: 300_000_000)
            guard let self, !Task.isCancelled else { return }
            // Starting or ending a search changes the read; typing only refines it.
            if self.searching != wasSearching {
                await self.reloadRows()
            } else {
                try? self.refigure()
            }
        }
    }

    /// Wait for a search in flight (tests).
    func settleSearch() async {
        await searchTask?.value
    }

    func showPage(_ next: Int) {
        page = next
        try? refigure()
    }

    /// The saved row behind a list row (the form edits it).
    func row(id: String) -> JSONValue? {
        rows.arrayValue?.first { $0["id"]?.stringValue == id }
    }
}
