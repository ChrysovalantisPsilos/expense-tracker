// Home's state: the reads (HomeRepository) in the web's order, the profile
// first because it says where the month's rows start (the salary shift),
// then the rows and the savings categories together, then the figures
// from the core (HomeFigures). A refresh that fails keeps the figures on
// screen and shows the error beside them.
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

    private let repository: HomeRepository
    private let core: BudgeerCore
    private let now: @Sendable () -> Date

    init(repository: HomeRepository, core: BudgeerCore = .shared, now: @escaping @Sendable () -> Date = { Date() }) {
        self.repository = repository
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

    /// Pull to refresh.
    func refresh() async { await load() }

    private func figures() async throws -> HomeFigures {
        let instant = now()
        let profile = try await repository.profile()
        let window = try HomeFigures.window(profile: profile, now: instant, core: core)
        async let rows = repository.transactions(from: window.fetchFrom, to: window.period.to)
        async let categories = repository.savingsCategories()
        let input = HomeInput(rows: try await rows, profile: profile, categories: try await categories, now: instant)
        return try HomeFigures.compute(input, core: core)
    }
}
