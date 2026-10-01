// The Insights page's state: the last six months' rows (as the web reads
// them: p_spread, pending rates filled), the savings categories and the
// profile, then the figures from the core (InsightsFigures). Tapping a
// month's bar splits that month's spending instead of this one's.
import Foundation
import Observation
import BudgeerCore

@MainActor
@Observable
final class InsightsModel {
    enum State: Equatable {
        case loading
        case loaded(InsightsFigures)
        case failed(String)
    }

    private(set) var state: State = .loading
    /// The month tapped (index into the six), nil for this month.
    private(set) var picked: Int?

    private var profile: JSONValue = [:]
    private var savings: JSONValue = []
    private var rows: JSONValue = []
    private let data: DataLayer
    private let core: BudgeerCore
    private let now: @Sendable () -> Date

    init(data: DataLayer, core: BudgeerCore = .shared, now: @escaping @Sendable () -> Date = { Date() }) {
        self.data = data
        self.core = core
        self.now = now
    }

    func load() async {
        do {
            let instant = now()
            profile = try await data.profile.profile()
            let months = (try InsightsFigures.months(now: instant, core: core)).arrayValue ?? []
            let query = TxnQuery(from: months.first?["from"]?.stringValue, to: months.last?["to"]?.stringValue, spread: true)
            async let read = data.transactions.transactions(query)
            async let categories = data.categories.savingsCategories()
            let base = profile["base_currency"]?.stringValue ?? "EUR"
            rows = try await FxRates.fillPending(try await read, base: base, today: try core.isoDate(instant), fx: data.fx, core: core)
            savings = try await categories
            try refigure()
        } catch {
            if case .loaded = state { return }
            state = .failed(String(describing: error))
        }
    }

    /// A month's bar was tapped.
    func pick(_ index: Int) {
        picked = index
        try? refigure()
    }

    private func refigure() throws {
        state = .loaded(try InsightsFigures.compute(profile: profile, categories: savings, rows: rows, now: now(),
                                                    picked: picked, core: core))
    }
}
