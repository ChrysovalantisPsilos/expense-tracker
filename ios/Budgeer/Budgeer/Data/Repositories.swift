// The app's data access, one protocol per area, each after the web's data
// module of the same area and calling the same tables and RPCs:
//   ProfileRepository       shared/lib/profile.js, vouchers.js (the setup)
//   CategoriesRepository    shared/lib/categories.js
//   TransactionsRepository  shared/lib/transactions.js
//   RecurringRepository     features/recurring/recurring.js
//   BudgetsRepository       features/budgets/budgets.js
//   FxRepository            shared/lib/fx.js (Frankfurter, the ECB's rates)
//   AiRepository            features/ai/ai.js (the ai-helper edge function)
// Rows travel as plain JSON (JSONValue), exactly as the server returns them:
// the core's functions read their columns; the app never types a table.
// SupabaseStore implements them all over the one client (with the offline
// cache); the tests use fakes.
import Foundation

/// One read of my_transactions (the web's listTransactions filters).
struct TxnQuery: Hashable, Sendable, Codable {
    var kind: String?
    var from: String?
    var to: String?
    var categoryId: String?
    var limit: Int?
    /// Also the yearly payments before `from` that still count in the range (0067).
    var spread = false

    init(kind: String? = nil, from: String? = nil, to: String? = nil, categoryId: String? = nil,
         limit: Int? = nil, spread: Bool = false) {
        self.kind = kind
        self.from = from
        self.to = to
        self.categoryId = categoryId
        self.limit = limit
        self.spread = spread
    }
}

protocol ProfileRepository: Sendable {
    /// The profile columns the screens read (currency, the yearly and salary
    /// settings, the helpers' switches).
    func profile() async throws -> JSONValue
    /// my_meal_vouchers: the setup, or null without one.
    func mealVouchers() async throws -> JSONValue
}

protocol CategoriesRepository: Sendable {
    /// Active categories (of `kind`, or both), A–Z by the name shown (the core's sortByDisplayName).
    func categories(kind: String?) async throws -> JSONValue
    /// The savings categories, archived ones included (id, kind, is_savings).
    func savingsCategories() async throws -> JSONValue
}

protocol TransactionsRepository: Sendable {
    /// my_transactions, newest first.
    func transactions(_ query: TxnQuery) async throws -> JSONValue
    /// The date of the first transaction; nil when there are none.
    func oldestDate() async throws -> String?
    /// The newest income row in `categoryId` paid on or after `since` ([] or one row).
    func newestIncome(categoryId: String, since: String) async throws -> JSONValue
    /// save_transactions with one row (carrying its client_uuid).
    func insert(_ row: JSONValue) async throws
    /// update_transaction: only the keys in `fields` change.
    func update(id: String, fields: JSONValue) async throws
    func delete(id: String) async throws
}

protocol RecurringRepository: Sendable {
    /// my_recurring_rules (active first, then by next charge).
    func rules() async throws -> JSONValue
    /// save_recurring_rule: a new rule (`id` nil) or only the keys sent.
    func save(id: String?, fields: JSONValue) async throws
    func deleteRule(id: String) async throws
}

protocol BudgetsRepository: Sendable {
    /// my_budgets for a month ('YYYY-MM-01'), rolled forward from an earlier one.
    func budgets(period: String) async throws -> JSONValue
    /// edit_budget: the month keeps its carried caps and this one changes.
    func edit(categoryId: String, amountMinor: Int, currency: String, period: String) async throws
    /// delete_budget.
    func delete(categoryId: String, period: String) async throws
    /// copy_previous_budgets: how many were copied.
    func copyPrevious(period: String) async throws -> Int
}

protocol FxRepository: Sendable {
    /// The ECB's from→to rate for `date` ({ rate, date }), or nil: never 1 on a failure.
    func rate(from: String, to: String, date: String?) async -> JSONValue?
    /// Daily rates over first…last as [[date, rate]] ([] on a failure).
    func series(from: String, to: String, first: String, last: String) async -> JSONValue
}

protocol AiRepository: Sendable {
    /// ai-helper parse_entry: the typed line → the entry for the form.
    func parseEntry(text: String, today: String, labels: JSONValue) async throws -> JSONValue
}

/// Everything a screen may read or write, handed to the view models.
struct DataLayer: Sendable {
    let profile: ProfileRepository
    let categories: CategoriesRepository
    let transactions: TransactionsRepository
    let recurring: RecurringRepository
    let budgets: BudgetsRepository
    let fx: FxRepository
    let ai: AiRepository

    /// One object that is every repository (the Supabase store, a test's fake).
    init<Store: ProfileRepository & CategoriesRepository & TransactionsRepository & RecurringRepository
            & BudgetsRepository & FxRepository & AiRepository>(_ store: Store) {
        profile = store
        categories = store
        transactions = store
        recurring = store
        budgets = store
        fx = store
        ai = store
    }
}

/// A server refusal with the words to show (a UserError on the web): the
/// ai-helper's code, or a message.
struct ServerError: Error, Equatable, CustomStringConvertible {
    let code: String?
    let message: String
    var description: String { message }
}
