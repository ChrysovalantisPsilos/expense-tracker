// Activity's state, after the web's LedgerPage: Expenses | Income | All,
// the picked month's entries (this month by default: the pay month with
// the salary setting on, as on Home; the floating pill steps through the
// months), and the search, which spans all history as on
// the web (up to 1,000 rows, the read from txnFilter.ledgerRead, refined by
// its filterTransactions). Reads through the data layer, pending rates
// filled as fx.js does, the figures from the core (LedgerFigures).
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

    /// The web's ?type=: 'all' (Activity's default), 'expense' or 'income'.
    private(set) var type = "all"
    private(set) var periods: [HomePeriod] = []
    private(set) var periodValue = ""
    private(set) var text = ""
    /// The Filters panel (txnFilter.EMPTY_FILTERS: categoryId, from, to, min, max).
    private(set) var filters: JSONValue = LedgerFigures.noFilters
    /// The panel's category choices for the type: (id, name shown).
    private(set) var categoryOptions: [(id: String, name: String)] = []
    private(set) var state: State = .loading

    private var profile: JSONValue = [:]
    private var savings: JSONValue = []
    private var rows: JSONValue = []
    private var oldest: String?
    private var oldestKnown = false
    /// The pay calendar the months are cut by (null: the salary setting is off).
    private var cal: JSONValue = .null
    private var searchTask: Task<Void, Never>?

    private let data: DataLayer
    private let core: BudgeerCore
    private let now: @Sendable () -> Date

    init(data: DataLayer, core: BudgeerCore = .shared, now: @escaping @Sendable () -> Date = { Date() }) {
        self.data = data
        self.core = core
        self.now = now
    }

    var baseCurrency: String { profile["base_currency"]?.stringValue ?? "EUR" }

    /// The kind the reads and the rows take (nil for All).
    var kind: String? { type == "all" ? nil : type }
    var searching: Bool { (try? core.call("txnFilter", "isFiltering", [text, filters])) ?? false }
    /// Any filter of the panel set (the button's dot).
    var hasFilters: Bool { (try? core.call("txnFilter", "isFiltering", ["", filters])) ?? false }
    func filter(_ key: String) -> String { filters[key]?.stringValue ?? "" }
    var period: HomePeriod? { periods.first { $0.value == periodValue } ?? periods.first }

    /// The months the pill steps through, oldest first (buildPeriods' month periods).
    var monthPeriods: [HomePeriod] {
        periods.filter { period in
            (try? core.call("periods", "isMonthPeriod", [["value": .string(period.value)] as JSONValue])) ?? false
        }.reversed()
    }

    /// The month before or after the picked one (nil at either end).
    func neighbour(_ step: Int) -> HomePeriod? {
        let months = monthPeriods
        guard let index = months.firstIndex(where: { $0.value == periodValue }), months.indices.contains(index + step)
        else { return nil }
        return months[index + step]
    }

    /// Another month from the pill.
    func setPeriod(_ value: String) async {
        guard value != periodValue else { return }
        periodValue = value
        await reloadRows()
    }

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
            cal = options.cal
            // This month is every picker's default (and stays picked while it exists).
            let thisMonth: HomePeriod = try core.call("periods", "thisMonthPeriod", [JSDate(instant), cal])
            if periodValue.isEmpty || !periods.contains(where: { $0.value == periodValue }) {
                periodValue = thisMonth.value
            }
            await loadCategories()
            await reloadRows()
        } catch {
            if case .loaded = state { return }
            state = .failed(String(describing: error))
        }
    }

    /// The rows for the current view, then the figures.
    func reloadRows() async {
        do {
            // ledgerRead: the picked month's window (one for every kind), or
            // all history narrowed by the server's filters.
            let month: HomePeriod = try period ?? core.call("periods", "thisMonthPeriod", [JSDate(now()), cal])
            let read = try core.json("txnFilter", "ledgerRead", [[
                "kind": kind.json, "filters": filters, "searching": .bool(searching),
                "month": ["from": month.from.json, "to": month.to.json],
            ] as JSONValue])
            let query = TxnQuery(kind: read["kind"]?.stringValue, from: read["from"]?.stringValue, to: read["to"]?.stringValue,
                                 categoryId: read["categoryId"]?.stringValue, limit: read["limit"]?.intValue)
            let base = profile["base_currency"]?.stringValue ?? "EUR"
            let answer = try await data.transactions.transactions(query)
            rows = try await FxRates.fillPending(answer, base: base, today: try core.isoDate(now()), fx: data.fx, core: core)
            try refigure()
        } catch {
            if case .loaded = state { return } // a failed refresh keeps the list
            state = .failed(String(describing: error))
        }
    }

    private func refigure() throws {
        let figures = try LedgerFigures.compute(rows: rows, profile: profile, categories: savings, kind: kind,
                                                period: period, text: text, filters: filters,
                                                oldest: oldest, oldestKnown: oldestKnown, today: try core.isoDate(now()),
                                                core: core)
        state = .loaded(figures)
    }

    func setType(_ next: String) async {
        guard next != type else { return }
        type = next
        // Categories are per kind, so switching type drops the category filter.
        filters = filters.with("categoryId", "")
        await loadCategories()
        await reloadRows()
    }

    /// One of the Filters panel's fields.
    func setFilter(_ key: String, _ value: String) async {
        guard filter(key) != value else { return }
        filters = filters.with(key, .string(value))
        await reloadRows()
    }

    /// Only your shares of group expenses (the Groups chip; txnFilter's).
    var sharedOnly: Bool { (try? core.call("txnFilter", "isSharedOnly", [filters])) ?? false }

    func setSharedOnly(_ on: Bool) async {
        guard on != sharedOnly, let next: JSONValue = try? core.call("txnFilter", "withSharedOnly", [filters, JSONValue.bool(on)])
        else { return }
        filters = next
        await reloadRows()
    }

    /// Clear: the text and every filter.
    func clearAll() async {
        text = ""
        filters = LedgerFigures.noFilters
        await reloadRows()
    }

    /// The type's categories for the panel, by the name shown.
    func loadCategories() async {
        let list = (try? await data.categories.categories(kind: kind)) ?? []
        categoryOptions = (list.arrayValue ?? []).compactMap { c in
            guard let id = c["id"]?.stringValue else { return nil }
            let name: String = (try? core.call("categoryName", "categoryDisplayName", [c])) ?? ""
            return (id, name)
        }
    }

    /// A row swiped away (after the confirm): remove it, then read again.
    /// False when the server refused.
    func delete(id: String) async -> Bool {
        do {
            try await data.transactions.delete(id: id)
        } catch {
            return false
        }
        await reloadRows()
        return true
    }

    /// DeleteTransactionDialog's words for a row: its title and body.
    func deleteWords(id: String) -> (title: String, body: String) {
        let row = self.row(id: id) ?? [:]
        return (TransactionWords.deleteTitle(row, core: core), TransactionWords.deleteBody(row, core: core))
    }

    /// The search text: the list follows after a short pause (typing fires per key).
    func setText(_ value: String) {
        let wasSearching = searching
        text = value
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

    /// The saved row behind a list row (the form edits it).
    func row(id: String) -> JSONValue? {
        rows.arrayValue?.first { $0["id"]?.stringValue == id }
    }

    /// The box under an entry (categoryMath.entryCategoryBox, as on the
    /// website's entry page): its category in the month it was paid, that
    /// month's budget and the category's other entries. The category page's
    /// reads (every category, the month's entries of the category, the
    /// month's budgets); nil when it doesn't apply or a read fails.
    func categoryBox(entryId: String) async -> EntryCategoryBox? {
        guard let entry = row(id: entryId), let categoryId = entry["category_id"]?.stringValue else { return nil }
        do {
            let instant = now()
            let month = try core.json("categoryMath", "entryMonth", [entry, JSDate(instant), cal])
            let categories = try await data.categories.allCategories()
            let read = try await data.transactions.transactions(TxnQuery(from: month["from"]?.stringValue,
                                                                         to: month["to"]?.stringValue,
                                                                         categoryId: categoryId, spread: true))
            let monthRows = try await FxRates.fillPending(read, base: baseCurrency, today: try core.isoDate(instant),
                                                          fx: data.fx, core: core)
            // Budgets are keyed by the month's label (periodMonth), never its window's first day.
            let budgetMonth: String = try core.call("periods", "periodMonth", [month])
            let budgets = try await data.budgets.budgets(period: budgetMonth)
            let input: JSONValue = [
                "entry": entry,
                "category": categories.arrayValue?.first { $0["id"]?.stringValue == categoryId } ?? .null,
                "rows": monthRows,
                "budget": budgets.arrayValue?.first { $0["category_id"]?.stringValue == categoryId } ?? .null,
                "baseCurrency": .string(baseCurrency),
                "separateYearly": .bool(profile["yearly_separate"]?.boolValue ?? false),
                "cal": cal,
            ]
            let box: EntryCategoryBox? = try core.call("categoryMath", "entryCategoryBox", [input, JSDate(instant)])
            return box
        } catch {
            return nil
        }
    }

    /// A shown entry and its day (beside the sidebar, the entry picked in the
    /// list), nil when the list doesn't show it (another month, a search).
    func entry(id: String) -> (row: EntryRow, day: EntryDay)? {
        guard case .loaded(let figures) = state else { return nil }
        for day in figures.days {
            if let row = day.rows.first(where: { $0.id == id }) { return (row, day) }
        }
        return nil
    }
}
