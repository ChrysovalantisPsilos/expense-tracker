// Home's state: the reads in the web's order (Dashboard.jsx): the profile
// first because it says where the period's rows start (the salary shift),
// the pickers' periods (from the first transaction; next month once its
// salary is in), the recurring rules and today's rates for their foreign
// currencies, then the period's rows (pending rates filled) and the savings
// categories, then the figures from the core (HomeFigures). A refresh that
// fails keeps the figures on screen and shows the error beside them.
import Foundation
import Observation
import BudgeerCore

@MainActor
@Observable
final class HomeViewModel {
    enum State: Equatable {
        case loading
        case loaded(HomeFigures)
        case failed(String)
    }

    private(set) var state: State = .loading
    /// A load after the first, with figures still on screen.
    private(set) var refreshing = false
    /// The last refresh's error, cleared by the next one that works.
    private(set) var refreshError: String?
    /// The period picker's options and the one picked (this month by default).
    private(set) var periods: [HomePeriod] = []
    private(set) var periodValue: String?

    private let data: DataLayer
    private let core: BudgeerCore
    private let now: @Sendable () -> Date

    init(data: DataLayer, core: BudgeerCore = .shared, now: @escaping @Sendable () -> Date = { Date() }) {
        self.data = data
        self.core = core
        self.now = now
    }

    /// The first load; the same again when the language changes.
    func load() async {
        if case .loaded = state { refreshing = true } else { state = .loading }
        defer { refreshing = false }
        do {
            let loaded = try await figures()
            state = .loaded(loaded)
            refreshError = nil
        } catch {
            if case .loaded = state { refreshError = String(describing: error) } else { state = .failed(String(describing: error)) }
        }
    }

    /// Pull to refresh, a live change.
    func refresh() async { await load() }

    /// A period from the picker.
    func setPeriod(_ value: String) async {
        guard value != (periodValue ?? currentValue) else { return }
        periodValue = value
        await load()
    }

    /// The value the picker shows (this month until another is picked).
    var currentValue: String {
        if let periodValue { return periodValue }
        if case .loaded(let figures) = state { return figures.period.value }
        return ""
    }

    private func figures() async throws -> HomeFigures {
        let instant = now()
        let profile = try await data.profile.profile()
        let options = await PeriodSource.load(profile: profile, data: data, core: core, now: instant)
        periods = options.periods
        // A picked period that went away (next month's salary deleted) falls back to this month.
        if let picked = periodValue, !periods.contains(where: { $0.value == picked }) { periodValue = nil }
        let window = try HomeFigures.window(profile: profile, periodValue: periodValue, now: instant, core: core)
        let base = profile["base_currency"]?.stringValue ?? "EUR"
        // The rules feed the projection and the Recurring card; the card's own
        // error is the web's, Home's figures don't wait on it.
        let rules = (try? await data.recurring.rules()) ?? []
        let rates = (try? await FxRates.latest(for: rules, base: base, fx: data.fx, core: core)) ?? [:]
        async let read = data.transactions.transactions(TxnQuery(from: window.fetchFrom, to: window.period.to, spread: true))
        async let categories = data.categories.savingsCategories()
        let rows = try await FxRates.fillPending(try await read, base: base, today: try core.isoDate(instant), fx: data.fx, core: core)
        let input = HomeInput(rows: rows, profile: profile, categories: try await categories, rules: rules, rates: rates,
                              now: instant, periodValue: periodValue)
        return try HomeFigures.compute(input, core: core)
    }
}
