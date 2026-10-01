// The Insights page's state: the last six months' rows (as the web reads
// them: p_spread, pending rates filled), the savings categories and the
// profile, then the figures from the core (InsightsFigures). Tapping a
// month's bar splits that month's spending instead of this one's. Then the
// cards with reads of their own, as on the web, each optional (a card that
// can't be read stays out of the way, or says so): Your salary (every
// category, every income entry, the corrections, the vouchers' country:
// SalaryFigures' card), Net worth (every income entry and expense paid from
// savings for the pot, the accounts: NetWorthFigures) and the statement
// (from the first to the last of this month, off before anything was ever
// logged), made by the generate-report function and shared as its file.
// Every read runs one after another.
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
    /// Your salary's card (nil before any salary entry, or when it can't be read: hidden).
    private(set) var salary: SalaryCardParts?
    private(set) var salaryRead = false
    /// Net worth (nil while loading or when it couldn't be read: `netWorthFailed`).
    private(set) var netWorth: NetWorthFigures?
    private(set) var netWorthFailed = false
    /// Why removing an account failed.
    private(set) var netWorthError: String?
    /// The statement's dates, whether there's anything to put in it, the
    /// format being made ('pdf' or 'xlsx'), the file once made, and why not.
    private(set) var statementFrom = ""
    private(set) var statementTo = ""
    private(set) var noEntries = false
    private(set) var exporting: String?
    private(set) var statementFile: URL?
    private(set) var statementError: String?

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
            let base = profile["base_currency"]?.stringValue ?? "EUR"
            let today = try core.isoDate(instant)
            let months = (try InsightsFigures.months(now: instant, core: core)).arrayValue ?? []
            let query = TxnQuery(from: months.first?["from"]?.stringValue, to: months.last?["to"]?.stringValue, spread: true)
            // One read after another: the data layer's reads are not run side by side.
            let read = try await data.transactions.transactions(query)
            rows = try await FxRates.fillPending(read, base: base, today: today, fx: data.fx, core: core)
            savings = try await data.categories.savingsCategories()
            try refigure()
            await loadCards(base: base, today: today, now: instant)
        } catch {
            if case .loaded = state { return }
            state = .failed(String(describing: error))
        }
    }

    /// The cards with reads of their own: Your salary, Net worth, the statement.
    private func loadCards(base: String, today: String, now instant: Date) async {
        let income = await optional { [self] in
            try await FxRates.fillPending(try await data.transactions.transactions(TxnQuery(kind: "income")), base: base,
                                          today: today, fx: data.fx, core: core)
        }
        let fromSavings = await optional { [self] in
            try await FxRates.fillPending(try await data.transactions.transactions(TxnQuery(kind: "expense",
                                                                                          paidFromSavings: true)),
                                          base: base, today: today, fx: data.fx, core: core)
        }
        let accounts = await optional { [self] in try await data.savings.accounts() }
        if let income, let fromSavings, let accounts {
            netWorth = try? NetWorthFigures.compute(profile: profile, categories: savings, income: income,
                                                    fromSavings: fromSavings, accounts: accounts, core: core)
        }
        netWorthFailed = netWorth == nil
        let categories = await optional { [self] in try await data.categories.allCategories() }
        let notes = await optional { [self] in try await data.insights.salaryHistory() }
        let vouchers = await optional { [self] in try await data.profile.mealVouchers() }
        if let income, let categories, let notes {
            let report = try? SalaryFigures.report(profile: profile, categories: categories, income: income, notes: notes,
                                                   vouchers: vouchers ?? .null, language: core.language, now: instant,
                                                   core: core)
            salary = report.flatMap { try? core.call("salaryText", "salaryCardParts", [$0.report, JSONValue.string(base)]) }
            salaryRead = report != nil
        }
        if statementFrom.isEmpty, let month = try? core.json("dates", "monthRange", [JSDate(instant)]) {
            statementFrom = month["from"]?.stringValue ?? ""
            statementTo = month["to"]?.stringValue ?? ""
        }
        // Nothing ever logged: the statement has nothing to put in it.
        if let oldest = await optional({ [self] in try await data.transactions.oldestDate().json }) {
            noEntries = oldest.isNull
        }
    }

    /// A card's read: its answer, or nil when it couldn't be read.
    private func optional(_ read: () async throws -> JSONValue) async -> JSONValue? {
        try? await read()
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

    // MARK: Net worth

    /// An account's row by id (its page edits it).
    func account(_ id: String) -> JSONValue? {
        guard let card = netWorth?.card else { return nil }
        return (card.savings + card.accounts).first { $0.id == id }?.account
    }

    /// The question before an account leaves the net worth.
    func removeQuestion(_ id: String) -> String {
        core.text("ios:native.netWorth.remove", ["name": account(id)?["name"] ?? ""])
    }

    /// Remove an account (after the question); a failure says so.
    func removeAccount(_ id: String) async {
        do {
            try await data.savings.deleteNetWorthAccount(id: id)
            netWorthError = nil
            await load()
        } catch {
            netWorthError = core.text("insights:netWorth.removeFailed")
        }
    }

    // MARK: The statement

    func setStatementFrom(_ day: String) { statementFrom = day }
    func setStatementTo(_ day: String) { statementTo = day }

    /// Make the statement ('pdf' or 'xlsx') for the dates: the file to share, or why not.
    func export(_ format: String) async {
        guard exporting == nil else { return }
        exporting = format
        statementFile = nil
        statementError = nil
        defer { exporting = nil }
        do {
            let bytes = try await data.insights.statement(from: statementFrom, to: statementTo, format: format)
            let name: String = try core.call("reportFiles", "statementFilename", [statementFrom, statementTo, format])
            let file = FileManager.default.temporaryDirectory.appendingPathComponent(name)
            try bytes.write(to: file, options: .atomic)
            statementFile = file
        } catch {
            statementError = [core.text("insights:reports.failed"), UserMessage.of(error, core: core)].joined(separator: ". ")
        }
    }
}
