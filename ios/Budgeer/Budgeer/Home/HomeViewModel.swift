// Home's state: the reads in the web's order (Dashboard.jsx): the profile
// first because it says where the period's rows start (the salary shift),
// the pickers' periods (from the first transaction; next month once its
// salary is in), the recurring rules and today's rates for their foreign
// currencies, then the period's rows (pending rates filled), the savings
// categories and the group money moves (the Net counts them), then the
// figures from the core (HomeFigures). Then the cards
// with reads of their own, as the web's cards load on their own: Meal
// vouchers (the setup and the expenses paid with them), Budgets (the
// period's caps and expenses) and, with its switch on, the month in plain
// words (my_month_summary, written once without asking as on the web). A
// refresh that fails keeps the figures on screen and shows the error beside
// them. The Expenses and Income cards page ten rows at a time. This month's
// reads also go to the widgets (onThisMonth → WidgetSync).
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

/// The month in plain words (MonthSummary): its state
/// (aiMath.summaryState), the header, and the lines.
struct OverviewWords: Equatable, Sendable {
    /// The words are offered this month (overviewWords).
    let offered: Bool
    /// 'writing', 'failed', 'ready' or 'stale'.
    let state: String
    let title: String
    let lines: [String]
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
    /// The pay calendar the periods were cut by (null: the salary setting is off).
    private(set) var cal: JSONValue = .null
    /// The Meal vouchers card, nil without a setup.
    private(set) var vouchers: VoucherCardFigures?
    private(set) var budgets: CardState<BudgetCardFigures> = .loading
    /// The overview's words, nil while the helper is off.
    private(set) var words: OverviewWords?
    private var summaryAttempted: String?
    private var summaryWriting = false
    private var summaryFailed = false

    /// This month's reads, each time they give the figures on screen (the widgets' snapshot).
    var onThisMonth: (@MainActor (HomeInput) -> Void)?

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
        await loadCards()
    }

    /// Pull to refresh, a live change.
    func refresh() async { await load() }

    /// A period from the picker.
    func setPeriod(_ value: String) async {
        guard value != (periodValue ?? currentValue) else { return }
        periodValue = value
        await load()
    }

    /// This month's value ('m:2026-9'): the pay month holding today with the
    /// salary setting on.
    var thisMonthValue: String {
        (try? core.json("periods", "thisMonthPeriod", [JSDate(now()), cal]))?["value"]?.stringValue ?? ""
    }

    /// The months the hero pages through, oldest first (buildPeriods'
    /// month periods; the years and all time stay with the lists).
    var monthPeriods: [HomePeriod] {
        periods.filter { period in
            (try? core.call("periods", "isMonthPeriod", [["value": .string(period.value)] as JSONValue])) ?? false
        }.reversed()
    }

    /// The value the picker shows (this month until another is picked).
    var currentValue: String {
        if let periodValue { return periodValue }
        if case .loaded(let figures) = state { return figures.period.value }
        return ""
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
        cal = options.cal
        // A picked period that went away (next month's salary deleted) falls back to this month.
        if let picked = periodValue, !periods.contains(where: { $0.value == picked }) { periodValue = nil }
        var input = try await HomeViewModel.input(data: data, profile: profile, periodValue: periodValue, now: instant, core: core)
        input.oldest = options.oldest
        input.oldestKnown = options.oldestKnown
        let figures = try HomeFigures.compute(input, core: core)
        // This month on screen: the widgets get the same reads (WidgetSync).
        if figures.period.value == thisMonthValue { onThisMonth?(input) }
        return figures
    }

    /// The reads behind a period's figures (nil: this month), given the
    /// profile: the pay calendar (with the salary setting on), the rules and
    /// today's rates, the period's rows (its window, pending rates filled),
    /// the savings categories and the group money moves (my_group_flow,
    /// pending rates filled).
    static func input(data: DataLayer, profile: JSONValue, periodValue: String?, now instant: Date,
                      core: BudgeerCore) async throws -> HomeInput {
        let cal = await PeriodSource.calendar(profile: profile, data: data, core: core, now: instant)
        let lastPayDay = cal.isNull ? JSONValue.null : await PeriodSource.lastPayDay(data: data)
        let window = try HomeFigures.window(periodValue: periodValue, now: instant, cal: cal, core: core)
        let base = profile["base_currency"]?.stringValue ?? "EUR"
        // The rules feed the projection and the Recurring card; the card's own
        // error is the web's, Home's figures don't wait on it.
        let rules = (try? await data.recurring.rules()) ?? []
        let rates = (try? await FxRates.latest(for: rules, base: base, fx: data.fx, core: core)) ?? [:]
        // One read after another, as every model here does.
        let read = try await data.transactions.transactions(TxnQuery(from: window.from, to: window.to, spread: true))
        let categories = try await data.categories.savingsCategories()
        let today = try core.isoDate(instant)
        let rows = try await FxRates.fillPending(read, base: base, today: today, fx: data.fx, core: core)
        // The money groups really moved in the period (the Net counts it), pending rates filled the same way.
        let flow = try await data.groups.groupFlow(from: window.from, to: window.to)
        let moves = try await FxRates.fillPending(flow, base: base, today: today, fx: data.fx, core: core)
        return HomeInput(rows: rows, profile: profile, categories: categories, rules: rules, rates: rates,
                         groupMoves: moves, now: instant, periodValue: periodValue, cal: cal, lastPayDay: lastPayDay)
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
            budgets = .loaded(try await HomeViewModel.budgetCard(data: data, profile: profile, periodValue: periodValue,
                                                                 now: now(), core: core))
        } catch {
            budgets = .failed(String(describing: error))
        }
    }

    /// The Budgets card's reads and figures for a period (nil: this month):
    /// the period's caps (one month's, or each month's of a longer period)
    /// and its expenses. Home's card, and the widgets' (WidgetSync).
    static func budgetCard(data: DataLayer, profile: JSONValue, periodValue: String?, now instant: Date,
                           core: BudgeerCore) async throws -> BudgetCardFigures {
        let cal = await PeriodSource.calendar(profile: profile, data: data, core: core, now: instant)
        let span = try BudgetFigures.cardWindow(periodValue: periodValue, now: instant, cal: cal, core: core)
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
        return try BudgetFigures.card(profile: profile, sets: sets, rows: spend, periodValue: periodValue, now: instant,
                                      cal: cal, core: core)
    }

    /// useMonthSummary: this month's summary while the helper is on; the
    /// first one written without asking (shouldAutoWrite).
    private func loadWords(profile: JSONValue) async {
        do {
            let on = try core.json("aiMath", "helpersOn", [profile])["monthSummary"]?.boolValue ?? false
            guard on else { words = nil; return }
            let month: String = try core.call("aiMath", "monthStartOf", [try core.isoDate(now()), cal])
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
            let month: String = try core.call("aiMath", "monthStartOf", [try core.isoDate(now()), cal])
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
        let state: String = try core.call("aiMath", "summaryState", [[
            "data": summary, "error": .null, "writing": .bool(summaryWriting), "writeFailed": .bool(summaryFailed),
            "lang": .string(core.language),
        ] as JSONValue])
        let period = try HomeFigures.period(periodValue, now: now(), cal: cal, core: core)
        let thisMonth: Bool = try core.call("periods", "isThisMonth", [period, JSDate(now()), cal])
        let shown = try core.json("aiMath", "overviewWords", [[
            "state": .string(state), "thisMonth": .bool(thisMonth), "tab": .null,
        ] as JSONValue])
        let lines = (summary["summary"]?["lines"]?.arrayValue ?? []).compactMap(\.stringValue)
        words = OverviewWords(offered: shown["offered"]?.boolValue ?? false, state: state,
                              title: try core.call("aiMath", "summaryTitle", [month]), lines: lines)
    }
}
