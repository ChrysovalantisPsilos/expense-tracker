// The Meal vouchers page's state, after the web's useMealVouchers and
// useVoucherCard: the setup (none: the page offers to set it up), the
// expenses paid with vouchers (pending rates filled) and the profile, then
// the figures from the core (VoucherFigures). "Fix days" edits the days of
// the month the next top-up pays for in place (daysFixParts as the stepper
// moves) and saves voucherMath.withDays; "Show older" refigures nothing.
// Settings › Meal vouchers is VoucherSetupModel.
import Foundation
import Observation
import BudgeerCore

@MainActor
@Observable
final class VouchersModel {
    enum State: Equatable {
        case loading
        /// No setup: the user doesn't get meal vouchers (yet).
        case none
        case loaded(VoucherFigures)
        case failed(String)
    }

    private(set) var state: State = .loading
    /// Fix days, open in place: the days as stepped, and their words.
    private(set) var fixing: DaysFix?
    private(set) var fixDays = 0
    private(set) var busy = false
    private(set) var message: String?
    /// The months "Show older" asked for, nil for the first ones.
    private(set) var months: Int?

    private var settings: JSONValue = .null
    private let data: DataLayer
    private let core: BudgeerCore
    private let now: @Sendable () -> Date

    init(data: DataLayer, core: BudgeerCore = .shared, now: @escaping @Sendable () -> Date = { Date() }) {
        self.data = data
        self.core = core
        self.now = now
    }

    var figures: VoucherFigures? {
        if case .loaded(let figures) = state { return figures }
        return nil
    }

    func load() async {
        do {
            let instant = now()
            settings = try await data.profile.mealVouchers()
            guard !settings.isNull else {
                state = .none
                return
            }
            let profile = try await data.profile.profile()
            let base = profile["base_currency"]?.stringValue ?? "EUR"
            let read = try await data.transactions.transactions(TxnQuery(kind: "expense", paidWithVouchers: true))
            let spends = try await FxRates.fillPending(read, base: base, today: try core.isoDate(instant), fx: data.fx, core: core)
            state = .loaded(try VoucherFigures.compute(settings: settings, spends: spends, profile: profile, now: instant,
                                                       core: core))
        } catch {
            if case .loaded = state { return } // a failed refresh keeps the page
            state = .failed(String(describing: error))
        }
    }

    // MARK: Fix days

    func startFix() {
        guard let figures else { return }
        fixDays = figures.fix.days
        fixing = try? VoucherFigures.fix(settings: settings, month: figures.next.month, days: fixDays, core: core)
    }

    /// One day fewer (-1) or more (+1), within what the stepper allows.
    func step(_ by: Int) {
        guard let figures, let fix = fixing, by < 0 ? fix.fewer : fix.more else { return }
        fixDays += by
        fixing = try? VoucherFigures.fix(settings: settings, month: figures.next.month, days: fixDays, core: core)
    }

    /// "× €8.00 = <b>€160.00</b>" as rich text (translate.parseRich).
    var fixTotal: JSONValue {
        guard let fix = fixing else { return [] }
        let text = core.text("vouchers:fix.total", ["perDay": .string(fix.total.perDay), "amount": .string(fix.total.amount)])
        return (try? core.json("translate", "parseRich", [text])) ?? [.string(text)]
    }

    func cancelFix() {
        fixing = nil
    }

    /// Save the month's days (withDays: the calendar's own count removes the fix).
    func saveFix() async {
        guard let figures else { return }
        busy = true
        defer { busy = false }
        do {
            let next = try core.json("voucherMath", "withDays", [settings, JSONValue.string(figures.next.month),
                                                                 JSONValue.int(fixDays)])
            try await data.profile.saveMealVouchers(next)
            fixing = nil
            message = nil
            await load()
        } catch {
            message = core.text("common:errors.generic")
        }
    }

    // MARK: The history

    /// historyWindow: how many months show, and whether "Show older" is offered.
    var window: (shown: Int, more: Bool) {
        let answer = historyWindow()
        return (answer["shown"]?.intValue ?? 0, answer["more"]?.boolValue ?? false)
    }

    func showOlder() {
        months = historyWindow()["next"]?.intValue
    }

    private func historyWindow() -> JSONValue {
        let count = JSONValue.int(figures?.history.count ?? 0)
        let asked: JSONValue = months.map { JSONValue.int($0) } ?? JSONValue.null
        return (try? core.json("savingsMath", "historyWindow", [count, asked])) ?? [:]
    }
}
