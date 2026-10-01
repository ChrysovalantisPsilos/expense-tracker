// Home's state: the reads in the web's order (Dashboard.jsx): the profile
// first because it says where the period's rows start (the salary shift),
// the pickers' periods (from the first transaction; next month once its
// salary is in), the recurring rules and today's rates for their foreign
// currencies, then the period's rows (pending rates filled) and the savings
// categories, then the figures from the core (HomeFigures). Then the cards
// with reads of their own, as the web's cards load on their own: Meal
// vouchers (the setup and the expenses paid with them), Budgets (the
// period's caps and expenses) and, with its switch on, the month in plain
// words (my_month_summary, written once without asking as on the web). A
// refresh that fails keeps the figures on screen and shows the error beside
// them. The Expenses and Income cards page ten rows at a time.
import Foundation
import Observation
import BudgeerCore

/// The Meal vouchers card (VoucherCard): the balance and the next top-up.
struct VoucherCardFigures: Equatable, Sendable {
    let balance: String
    let tone: String
    let nextAmount: String
    let nextWhy: String
}

/// The overview's "In words" side (MonthSummary): its state
/// (aiMath.summaryState), the header, and the lines.
struct OverviewWords: Equatable, Sendable {
    /// Numbers | In words is offered, and the words are what shows (overviewWords).
    let offered: Bool
    let shown: Bool
    /// 'writing', 'failed', 'ready' or 'stale'.
    let state: String
    let title: String
    let lines: [String]
}

/// A list card's page: its rows, how many pages, "Page 1 of 3".
struct HomeListPage: Equatable, Sendable {
    let rows: [EntryRow]
    let pages: Int
    let position: String
}

@MainActor
@Observable
final class HomeViewModel {
    enum State: Equatable {
        case loading
        case loaded(HomeFigures)
        case failed(String)
    }

    enum CardState<Value: Equatable>: Equatable {
        case loading
        case loaded(Value)
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
    /// The Meal vouchers card, nil without a setup.
    private(set) var vouchers: VoucherCardFigures?
    private(set) var budgets: CardState<BudgetCardFigures> = .loading
    /// The overview's words, nil while the helper is off.
    private(set) var words: OverviewWords?
    /// The month's name over the numbers when words are offered (monthName()).
    private(set) var monthTitle = ""
    /// The pages of the Expenses and Income cards.
    var expensePage = 1
    var incomePage = 1
    /// The categories card: all rows ("Show all"), and chart or table.
    var showAllBars = false
    var view: String = "chart" {
        didSet { saveView() }
    }
    /// Numbers or In words (the viewer's saved choice).
    private(set) var tab: String?

    /// The rows as read (a row opens Edit with its saved row).
    private var rows: JSONValue = []
    private var summary: (data: JSONValue, month: String)?
    private var summaryAttempted: String?
    private var summaryWriting = false
    private var summaryFailed = false

    private static let viewKey = "budgeer.overviewView"
    private static let tabKey = "budgeer.overviewTab"
    private let data: DataLayer
    private let core: BudgeerCore
    private let now: @Sendable () -> Date
    private let defaults: UserDefaults

    init(data: DataLayer, core: BudgeerCore = .shared, now: @escaping @Sendable () -> Date = { Date() },
         defaults: UserDefaults = .standard) {
        self.data = data
        self.core = core
        self.now = now
        self.defaults = defaults
        view = defaults.string(forKey: HomeViewModel.viewKey) ?? "chart"
        tab = defaults.string(forKey: HomeViewModel.tabKey)
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
        await loadCards()
    }

    /// Pull to refresh, a live change.
    func refresh() async { await load() }

    /// A period from the picker.
    func setPeriod(_ value: String) async {
        guard value != (periodValue ?? currentValue) else { return }
        periodValue = value
        expensePage = 1
        incomePage = 1
        showAllBars = false
        await load()
    }

    /// The value the picker shows (this month until another is picked).
    var currentValue: String {
        if let periodValue { return periodValue }
        if case .loaded(let figures) = state { return figures.period.value }
        return ""
    }

    /// Delete a row (after the list's confirm), then read the period again.
    func delete(_ row: JSONValue) async {
        guard let id = row["id"]?.stringValue else { return }
        do {
            try await data.transactions.delete(id: id)
        } catch {
            refreshError = core.text("transactions:list.notDeleted")
            return
        }
        await load()
    }

    /// The saved row behind a list row (for Edit).
    func row(id: String) -> JSONValue? {
        rows.arrayValue?.first { $0["id"]?.stringValue == id }
    }

    /// One page of a list card (paginate, ten rows a page).
    func page(_ list: HomeList, _ page: Int) -> HomeListPage {
        let pages: Int = (try? core.call("paginate", "pageCount", [list.rows.count, 10])) ?? 1
        let rows: [EntryRow] = (try? core.call("paginate", "pageSlice", [list.rows, page, 10])) ?? list.rows
        let position = core.text("common:paginator.position", ["page": .int(page), "pages": .int(pages)])
        return HomeListPage(rows: rows, pages: pages, position: position)
    }

    /// Write (or rewrite) the month's summary: Update, Try again.
    func writeSummary() async {
        guard let profile = try? await data.profile.profile() else { return }
        await write(profile: profile)
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
        self.rows = rows
        let input = HomeInput(rows: rows, profile: profile, categories: try await categories, rules: rules, rates: rates,
                              now: instant, periodValue: periodValue, oldest: options.oldest, oldestKnown: options.oldestKnown)
        return try HomeFigures.compute(input, core: core)
    }

    // MARK: The cards with reads of their own

    private func loadCards() async {
        guard let profile = try? await data.profile.profile() else { return }
        await loadVouchers()
        await loadBudgets(profile: profile)
        await loadWords(profile: profile)
    }

    /// VoucherCard: voucherSummary and nextTopUp over the expenses paid with
    /// vouchers, worded by voucherCardParts.
    private func loadVouchers() async {
        do {
            let settings = try await data.profile.mealVouchers()
            guard !settings.isNull else { vouchers = nil; return }
            let spends = try await data.transactions.transactions(TxnQuery(kind: "expense", paidWithVouchers: true))
            let day = try core.isoDate(now())
            let summary = try core.json("voucherMath", "voucherSummary", [settings, spends, day])
            let next = try core.json("voucherMath", "nextTopUp", [settings, day])
            let parts = try core.json("voucherText", "voucherCardParts", [settings, summary, next])
            vouchers = VoucherCardFigures(balance: parts["balance"]?.stringValue ?? "",
                                          tone: parts["tone"]?.stringValue ?? "default",
                                          nextAmount: parts["next"]?["amount"]?.stringValue ?? "",
                                          nextWhy: parts["next"]?["why"]?.stringValue ?? "")
        } catch {
            vouchers = nil
        }
    }

    /// BudgetsCard for the picked period (useBudgetProgress, useBudgetSets).
    private func loadBudgets(profile: JSONValue) async {
        do {
            let instant = now()
            let span = try BudgetFigures.cardWindow(periodValue: periodValue, now: instant, core: core)
            let first = span["first"] ?? .null
            let last = span["last"] ?? .null
            let sets: JSONValue
            if let month = first.stringValue, first == last {
                sets = try core.json("budgetMath", "monthSets", [try await data.budgets.budgets(period: month)])
            } else {
                let months: [String] = try core.call("budgetMath", "setPeriods", [try await data.budgets.budgetPeriods(), first, last])
                var list: [JSONValue] = []
                for month in months {
                    list.append(["period": .string(month), "rows": try await data.budgets.budgets(period: month)])
                }
                sets = .array(list)
            }
            let spend = try await data.transactions.transactions(TxnQuery(
                kind: "expense", from: span["from"]?.stringValue, to: span["to"]?.stringValue, spread: true))
            budgets = .loaded(try BudgetFigures.card(profile: profile, sets: sets, rows: spend, periodValue: periodValue,
                                                     now: instant, core: core))
        } catch {
            budgets = .failed(String(describing: error))
        }
    }

    /// useMonthSummary: this month's summary while the helper is on; the
    /// first one written without asking (shouldAutoWrite).
    private func loadWords(profile: JSONValue) async {
        do {
            monthTitle = try core.call("dates", "monthName", [JSDate(now())])
            let on = try core.json("aiMath", "helpersOn", [profile])["monthSummary"]?.boolValue ?? false
            guard on else { words = nil; return }
            let month: String = try core.call("aiMath", "monthStartOf", [try core.isoDate(now())])
            let summary = try await data.ai.monthSummary(month: month)
            let auto: Bool = try core.call("aiMath", "shouldAutoWrite", [[
                "data": summary, "attempted": .bool(summaryAttempted == month),
            ] as JSONValue])
            if auto {
                await write(profile: profile)
                return
            }
            try shape(summary, month: month)
        } catch {
            words = nil
        }
    }

    private func write(profile: JSONValue) async {
        do {
            let month: String = try core.call("aiMath", "monthStartOf", [try core.isoDate(now())])
            summaryAttempted = month
            summaryWriting = true
            summaryFailed = false
            try? shape(try await data.ai.monthSummary(month: month), month: month)
            let categories = try await data.categories.categories(kind: nil)
            let labels = try core.json("aiMath", "categoryLabels", [categories])
            do {
                try await data.ai.writeMonthSummary(month: month, lang: core.language, labels: labels)
            } catch {
                summaryFailed = true
            }
            summaryWriting = false
            try shape(try await data.ai.monthSummary(month: month), month: month)
        } catch {
            summaryWriting = false
            words = nil
        }
    }

    private func shape(_ summary: JSONValue, month: String) throws {
        self.summary = (summary, month)
        let state: String = try core.call("aiMath", "summaryState", [[
            "data": summary, "error": .null, "writing": .bool(summaryWriting), "writeFailed": .bool(summaryFailed),
            "lang": .string(core.language),
        ] as JSONValue])
        let period = try HomeFigures.period(periodValue, now: now(), core: core)
        let thisMonth: Bool = try core.call("periods", "isThisMonth", [period, JSDate(now())])
        let shown = try core.json("aiMath", "overviewWords", [[
            "state": .string(state), "thisMonth": .bool(thisMonth), "tab": tab.json,
        ] as JSONValue])
        let lines = (summary["summary"]?["lines"]?.arrayValue ?? []).compactMap(\.stringValue)
        words = OverviewWords(offered: shown["offered"]?.boolValue ?? false, shown: shown["words"]?.boolValue ?? false,
                              state: state,
                              title: try core.call("aiMath", "summaryTitle", [month]), lines: lines)
    }

    private func saveView() { defaults.set(view, forKey: HomeViewModel.viewKey) }

    /// Numbers | In words picked: shown at once, kept for next time.
    func pickTab(_ value: String) {
        tab = value
        defaults.set(value, forKey: HomeViewModel.tabKey)
        if let summary { try? shape(summary.data, month: summary.month) }
    }

    /// Whether the overview shows the words now (overviewWords.words).
    var showsWords: Bool { words?.shown ?? false }

    var summaryFailedToUpdate: Bool { summaryFailed }
}
