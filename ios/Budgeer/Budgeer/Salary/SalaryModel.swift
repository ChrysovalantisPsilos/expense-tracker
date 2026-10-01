// "Your salary"'s state, after the web's useSalary: the profile, every
// category, every income entry (pending rates filled), the corrections
// (my_salary_history) and the meal vouchers' setup (its country), one read
// after another; then the figures from the core (SalaryFigures). The
// projection's years and yearly raise, the prices' first year and the
// extras shown refigure without reading again. A correction (an extra's
// kind, the country, the Bonus category) is saved whole, as the web's
// save: shown at once, put back when the save fails.
import Foundation
import Observation
import BudgeerCore

@MainActor
@Observable
final class SalaryModel {
    enum State: Equatable {
        case loading
        case loaded(SalaryFigures)
        case failed(String)
    }

    private(set) var state: State = .loading
    /// The projection's horizon (years) and the slider's yearly raise (%).
    private(set) var years = 5
    private(set) var whatIf: Double = 2
    /// The prices' first year, nil for the first one offered.
    private(set) var since: Int?
    /// Show every raise, not only the latest five.
    var allRaises = false
    /// The years of extras "Show older" asked for, nil for the first ones.
    private(set) var extrasYears: Int?
    /// The extra being corrected in place, and the kind picked for it.
    private(set) var fixing: String?
    private(set) var fixKind = ""
    /// Why a save failed.
    private(set) var message: String?
    private(set) var busy = false

    private var profile: JSONValue = [:]
    private var categories: JSONValue = []
    private var income: JSONValue = []
    private var vouchers: JSONValue = .null
    private var report: SalaryFigures.Report?
    private let data: DataLayer
    private let core: BudgeerCore
    private let now: @Sendable () -> Date

    init(data: DataLayer, core: BudgeerCore = .shared, now: @escaping @Sendable () -> Date = { Date() }) {
        self.data = data
        self.core = core
        self.now = now
    }

    var figures: SalaryFigures? {
        if case .loaded(let figures) = state { return figures }
        return nil
    }

    func load() async {
        do {
            let instant = now()
            profile = try await data.profile.profile()
            let base = profile["base_currency"]?.stringValue ?? "EUR"
            categories = try await data.categories.allCategories()
            let rows = try await data.transactions.transactions(TxnQuery(kind: "income"))
            income = try await FxRates.fillPending(rows, base: base, today: try core.isoDate(instant), fx: data.fx, core: core)
            let notes = try await data.insights.salaryHistory()
            // The vouchers only pick the country; the page doesn't wait on them.
            vouchers = (try? await data.profile.mealVouchers()) ?? .null
            report = try SalaryFigures.report(profile: profile, categories: categories, income: income, notes: notes,
                                              vouchers: vouchers, language: core.language, now: instant, core: core)
            try refigure()
        } catch {
            if case .loaded = state { return }
            state = .failed(String(describing: error))
        }
    }

    private func refigure() throws {
        guard let report else { return }
        state = .loaded(try SalaryFigures.compute(report, profile: profile, categories: categories, years: years,
                                                  whatIf: whatIf, since: since, now: now(), core: core))
    }

    // MARK: The cards

    func setYears(_ value: Int) {
        years = value
        try? refigure()
    }

    func setWhatIf(_ value: Double) {
        whatIf = value
        try? refigure()
    }

    func setSince(_ year: Int) {
        since = year
        try? refigure()
    }

    /// The extras' paging (extrasWindow): how many years show, and whether "Show older" is offered.
    var extrasWindow: (shown: Int, more: Bool) {
        let answer = extrasAnswer()
        return (answer["shown"]?.intValue ?? 0, answer["more"]?.boolValue ?? false)
    }

    func showOlderExtras() {
        extrasYears = extrasAnswer()["next"]?.intValue
    }

    private func extrasAnswer() -> JSONValue {
        let count = JSONValue.int(figures?.page?.extras.count ?? 0)
        let asked: JSONValue = extrasYears.map { JSONValue.int($0) } ?? .null
        return (try? core.json("salaryText", "extrasWindow", [count, asked])) ?? [:]
    }

    /// What an extra can be corrected to (fixChoices).
    var fixChoices: [CoreChoice] {
        (try? core.call("salaryText", "fixChoices", [])) ?? []
    }

    /// Words with tags (<b>) as the core parses them, for NativeRich.
    func rich(_ text: String) -> JSONValue {
        (try? core.json("translate", "parseRich", [text])) ?? [.string(text)]
    }

    // MARK: Corrections

    /// "Fix" on an extra: its choices open in place, its own kind picked.
    func startFix(_ row: SalaryExtrasYear.Row) {
        fixing = row.id
        fixKind = row.kind
        message = nil
    }

    func pickFix(_ kind: String) { fixKind = kind }

    func cancelFix() { fixing = nil }

    /// Save the correction: the payment is now `fixKind`.
    func saveFix() async {
        guard let id = fixing else { return }
        if await save(withFix(id: .string(id), kind: .string(fixKind))) { fixing = nil }
    }

    /// The prices' country (saved with the corrections).
    func setCountry(_ country: String) async {
        _ = await save(withFix(id: .null, kind: .null).with("country", .string(country)))
    }

    /// Which income category holds the bonuses.
    func setBonusCategory(_ id: String) async {
        _ = await save(withFix(id: .null, kind: .null).with("bonus_category_id", .string(id)))
    }

    /// The corrections with entry `id` set to `kind` (none: only the stale ones dropped).
    private func withFix(id: JSONValue, kind: JSONValue) -> JSONValue {
        guard let report else { return [:] }
        let ids = (try? core.json("salaryMath", "salaryEntryIds", [income, report.salaryId, report.bonusId])) ?? []
        return (try? core.json("salaryMath", "withFix", [report.notes, id, kind, ids])) ?? report.notes
    }

    /// Show the corrections at once, save them, put the old ones back when the save fails.
    private func save(_ notes: JSONValue) async -> Bool {
        guard let before = report else { return false }
        busy = true
        defer { busy = false }
        apply(notes)
        do {
            try await data.insights.saveSalaryHistory(notes)
            message = nil
            return true
        } catch {
            apply(before.notes)
            message = UserMessage.of(error, fallback: core.text("common:errors.notSaved"), core: core)
            return false
        }
    }

    private func apply(_ notes: JSONValue) {
        report = try? SalaryFigures.report(profile: profile, categories: categories, income: income, notes: notes,
                                           vouchers: vouchers, language: core.language, now: now(), core: core)
        try? refigure()
    }
}
