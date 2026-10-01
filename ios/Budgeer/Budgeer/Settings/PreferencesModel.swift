// The switches Settings keeps on the profile, after the web's
// SpendingSettings (yearly subscriptions in monthly spending, the salary
// shift with its day and category), NotificationSettings (the email and
// weekly-summary messages; off on the shared demo account) and AiSettings
// (the four helpers). A switch moves at once and the profile is written;
// a refused write puts it back and says so. Every rule is the core's
// (spendingPrefs, aiMath, demoAccount).
import Foundation
import Observation
import BudgeerCore

/// spendingPrefs.salaryShiftView: what the salary-shift preference shows.
struct SalaryShiftView: Decodable, Equatable {
    let on: Bool
    let disabled: Bool
    /// The hint's key (settings:spending.salary.hint or .needsIncome).
    let hint: String
    /// Whether the rest of the explanation follows the hint.
    let more: Bool
    let shortMonths: Bool
    /// The "from day" picker's days.
    let days: [Int]
}

@MainActor
@Observable
final class PreferencesModel {
    enum State: Equatable {
        case loading
        case loaded
        case failed(String)
    }

    private(set) var state: State = .loading
    private(set) var profile: JSONValue = [:]
    /// The active income categories (the salary category's choices): (id, name shown).
    private(set) var incomeOptions: [(id: String, name: String)] = []
    /// Why the last switch didn't stick, when it didn't.
    private(set) var message: String?

    private var incomeRows: JSONValue = []
    private let data: DataLayer
    private let core: BudgeerCore

    init(data: DataLayer, core: BudgeerCore = .shared) {
        self.data = data
        self.core = core
    }

    func load() async {
        do {
            profile = try await data.profile.profile()
            incomeRows = try await data.categories.categories(kind: "income")
            incomeOptions = (incomeRows.arrayValue ?? []).compactMap { category in
                guard let id = category["id"]?.stringValue else { return nil }
                return (id, (try? core.call("categoryName", "categoryDisplayName", [category])) ?? "")
            }
            state = .loaded
        } catch {
            if case .loaded = state { return }
            state = .failed(UserMessage.of(error, core: core))
        }
    }

    /// The shared demo login: its messages stay off (the server refuses them).
    var isDemo: Bool { (try? core.call("demoAccount", "isDemoAccount", [profile])) ?? false }

    // MARK: Monthly spending

    /// "Count yearly subscriptions in monthly spending" (profiles.yearly_separate, inverted).
    var countYearly: Bool { profile["yearly_separate"]?.boolValue != true }

    func setCountYearly(_ on: Bool) async {
        await save(["yearly_separate": .bool(!on)])
    }

    var salaryDay: Int? { profile["salary_shift_from_day"]?.intValue }
    var salaryCategory: String { profile["salary_category_id"]?.stringValue ?? "" }

    var salary: SalaryShiftView? {
        let args: JSONValue = ["fromDay": profile["salary_shift_from_day"] ?? .null,
                               "incomeCount": .int(incomeOptions.count)]
        guard let view: SalaryShiftView = try? core.call("spendingPrefs", "salaryShiftView", [args]) else { return nil }
        return view
    }

    /// The switch: on picks the day and the salary category as the web does (salaryShiftPatch).
    func setSalaryShift(_ on: Bool) async {
        let current: JSONValue = ["fromDay": profile["salary_shift_from_day"] ?? .null,
                                  "categoryId": profile["salary_category_id"] ?? .null, "categories": incomeRows]
        guard let patch = try? core.json("spendingPrefs", "salaryShiftPatch", [JSONValue.bool(on), current]) else { return }
        await save(patch)
    }

    func setSalaryDay(_ day: Int) async {
        await save(["salary_shift_from_day": .int(day)])
    }

    func setSalaryCategory(_ id: String) async {
        guard !id.isEmpty else { return }
        await save(["salary_category_id": .string(id)])
    }

    // MARK: Notifications

    var emailOn: Bool { profile["notify_email"]?.boolValue == true }
    var digestOn: Bool { profile["notify_digest"]?.boolValue == true }

    func setEmail(_ on: Bool) async { await save(["notify_email": .bool(on)]) }
    func setDigest(_ on: Bool) async { await save(["notify_digest": .bool(on)]) }

    // MARK: AI helpers

    /// The four switches in the web's order (aiMath.aiSwitchIds).
    var aiSwitches: [String] { (try? core.call("aiMath", "aiSwitchIds", [])) ?? [] }

    func aiOn(_ id: String) -> Bool {
        (try? core.json("aiMath", "helpersOn", [profile]))?[id]?.boolValue == true
    }

    func setAi(_ id: String, _ on: Bool) async {
        guard let patch = try? core.json("aiMath", "aiSwitchPatch", [JSONValue.string(id), JSONValue.bool(on)]) else { return }
        await save(patch)
    }

    // MARK: Saving

    /// The change shows at once; a refused write puts the profile back.
    private func save(_ patch: JSONValue) async {
        let before = profile
        for (key, value) in patch.objectValue ?? [:] { profile = profile.with(key, value) }
        do {
            try await data.profile.updateProfile(patch)
            message = nil
        } catch {
            profile = before
            message = [core.text("common:errors.notSaved"), UserMessage.of(error, core: core)].joined(separator: " ")
        }
    }
}
