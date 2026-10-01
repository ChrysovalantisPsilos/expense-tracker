// The app's data access, one protocol per area, each after the web's data
// module of the same area and calling the same tables and RPCs:
//   ProfileRepository       shared/lib/profile.js (Settings' profile, the
//                           payment details, the photo), vouchers.js (the
//                           setup, saving it), notifications.js (the bell)
//   SavingsRepository       shared/lib/accounts.js (net-worth accounts),
//                           features/savings/savings.js (the goals)
//   PlanRepository          features/plan/plan.js (the plan, apply and undo),
//                           ai.js planWhatIf
//   InsightsRepository      features/salary/salary.js (the corrections),
//                           features/insights/reports.js (the statement)
//   CategoriesRepository    shared/lib/categories.js
//   PrivacyRepository       features/privacy/privacyData.js, profile.js deleteMyAccount
//   TransactionsRepository  shared/lib/transactions.js
//   RecurringRepository     features/recurring/recurring.js
//   BudgetsRepository       features/budgets/budgets.js
//   FxRepository            shared/lib/fx.js (Frankfurter, the ECB's rates)
//   AiRepository            features/ai/ai.js (the ai-helper edge function)
//   GroupsRepository        features/groups/groups.js, comments.js (the split groups)
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
    /// Only the expenses paid with meal vouchers (0097; the vouchers card).
    var paidWithVouchers = false
    /// Only the expenses paid from savings (0085; the Savings page).
    var paidFromSavings = false

    init(kind: String? = nil, from: String? = nil, to: String? = nil, categoryId: String? = nil,
         limit: Int? = nil, spread: Bool = false, paidWithVouchers: Bool = false, paidFromSavings: Bool = false) {
        self.kind = kind
        self.from = from
        self.to = to
        self.categoryId = categoryId
        self.limit = limit
        self.spread = spread
        self.paidWithVouchers = paidWithVouchers
        self.paidFromSavings = paidFromSavings
    }
}

protocol ProfileRepository: Sendable {
    /// The profile columns the screens read (currency, the yearly and salary
    /// settings, the helpers' switches, the language, the demo flag).
    func profile() async throws -> JSONValue
    /// updateProfile with { language }: 'en', 'el', or nil to follow the device.
    func saveLanguage(_ language: String?) async throws
    /// my_meal_vouchers: the setup, or null without one.
    func mealVouchers() async throws -> JSONValue
    /// save_meal_vouchers: the setup (voucherMath.newSettings / withDays), or null to turn vouchers off.
    func saveMealVouchers(_ settings: JSONValue) async throws
    /// The bell's feed (listNotifications): the newest 30 notifications.
    func notifications() async throws -> JSONValue
    /// markAllRead: every unread notification read now.
    func markNotificationsRead() async throws
    /// updateProfile: only the columns in `fields` change (the name, the
    /// currency, Monthly spending, the message and helper switches).
    func updateProfile(_ fields: JSONValue) async throws
    /// baseCurrencyLocked: true once entries depend on the currency (0078).
    func baseCurrencyLocked() async throws -> Bool
    /// getMyPaymentInfo: { payment_iban, payment_revolut, payment_paypal }.
    func myPaymentInfo() async throws -> JSONValue
    /// savePaymentInfo with payLinks.paymentDetailsToSave's { iban, revolut, paypal }.
    func savePaymentInfo(_ details: JSONValue) async throws
    /// uploadAvatar: the picture into avatars/<uid>/avatar.<ext>, then the
    /// profile's avatar_url (the public URL, cache-busted): that URL.
    func uploadAvatar(data: Data, contentType: String, ext: String) async throws -> String
}

protocol CategoriesRepository: Sendable {
    /// Active categories (of `kind`, or both), A–Z by the name shown (the core's sortByDisplayName).
    func categories(kind: String?) async throws -> JSONValue
    /// The savings categories, archived ones included (id, kind, is_savings).
    func savingsCategories() async throws -> JSONValue
    /// useAllCategories: every category, archived ones included, with created_at.
    func allCategories() async throws -> JSONValue
    /// createCategory with categoryName.newCategoryRow's row.
    func createCategory(_ row: JSONValue) async throws
    /// updateCategory with categoryName.categoryUpdateRow's fields.
    func updateCategory(id: String, fields: JSONValue) async throws
    /// countCategoryUse: how many of the user's transactions use it.
    func countCategoryUse(id: String) async throws -> Int
    /// deleteCategory (delete_category): its entries moved to `moveTo` first
    /// (nil: left uncategorised); how many moved.
    func deleteCategory(id: String, moveTo: String?) async throws -> Int
}

protocol SavingsRepository: Sendable {
    /// my_accounts: the net-worth accounts, balances decrypted (savings ones make the Savings total).
    func accounts() async throws -> JSONValue
    /// my_goals: the savings goals, amounts decrypted.
    func goals() async throws -> JSONValue
    /// save_goal: a new goal (`id` null) or every field of one (savingsMath.goalToSave's goal).
    func saveGoal(_ goal: JSONValue) async throws
    func deleteGoal(id: String) async throws
    /// save_account: a new account (`id` null) or every field of one (insightsMath.accountToSave's account).
    func saveNetWorthAccount(_ account: JSONValue) async throws
    /// deleteAccount (accounts.js): a net-worth account.
    func deleteNetWorthAccount(id: String) async throws
}

protocol PlanRepository: Sendable {
    /// my_recurring_plan: { plan, undo } (the saved plan or null; the last apply or null).
    func recurringPlan() async throws -> JSONValue
    /// save_recurring_plan, or clear_recurring_plan when the plan is empty (planMath.isEmptyPlan).
    func saveRecurringPlan(_ plan: JSONValue, empty: Bool) async throws
    /// apply_recurring_plan: applySelection's `apply`, and the plan left (nil when it's empty).
    func applyRecurringPlan(apply: JSONValue, remaining: JSONValue?) async throws
    /// undo_recurring_plan: how many changes went back.
    func undoRecurringPlan() async throws -> Int
    /// ai-helper plan_whatif: the typed line → { changes, adds, notFound }.
    func planWhatIf(text: String, labels: JSONValue) async throws -> JSONValue
}

protocol InsightsRepository: Sendable {
    /// my_salary_history: the salary page's corrections, or null.
    func salaryHistory() async throws -> JSONValue
    /// save_salary_history.
    func saveSalaryHistory(_ notes: JSONValue) async throws
    /// generate-report: the statement for from…to as a file ('pdf' or 'xlsx'), its bytes.
    func statement(from: String, to: String, format: String) async throws -> Data
}

protocol PrivacyRepository: Sendable {
    /// listMyConsents: the consent and preference history, newest first.
    func consents() async throws -> JSONValue
    /// export_my_data: everything Budgeer holds about the user, decrypted.
    func exportMyData() async throws -> JSONValue
    /// sendPrivacyRequest: legal.privacyRequestToSend's { kind, message } to the privacy inbox.
    func sendPrivacyRequest(_ request: JSONValue) async throws
    /// deleteMyAccount: the delete-account edge function (the password for a
    /// password account, which the server checks again).
    func deleteAccount(password: String?) async throws
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
    /// budgetPeriods: every month with any budget ('YYYY-MM-01'), sorted.
    func budgetPeriods() async throws -> JSONValue
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
    /// my_month_summary for a month ('YYYY-MM-01'): { summary, stale, empty } or null.
    func monthSummary(month: String) async throws -> JSONValue
    /// ai-helper month_summary: write (or rewrite) the month's summary.
    func writeMonthSummary(month: String, lang: String, labels: JSONValue) async throws
}

protocol GroupsRepository: Sendable {
    /// listGroups: the groups the user can see, newest first, each with
    /// group_members(count).
    func groups() async throws -> JSONValue
    /// list_my_group_invites: invites waiting for the user's answer.
    func groupInvites() async throws -> JSONValue
    /// One group's summary for the lists (listGroupSummaries' parts, as read):
    /// { members, avatars, balances } (balances [] when not asked for).
    func groupSummary(id: String, balances: Bool) async throws -> JSONValue
    /// getGroup's reads, as read: { group, members, avatars, balances, ledger }
    /// (ledger: group_ledger's { expenses, settlements }).
    func groupDetail(id: String) async throws -> JSONValue
    /// group_audit_entries, newest first.
    func groupActivity(id: String) async throws -> JSONValue
    /// group_comment_counts rows ({ target_id, n }).
    func groupCommentCounts(id: String) async throws -> JSONValue
    /// group_comments_for: one item's thread, oldest first.
    func groupComments(groupId: String, targetId: String) async throws -> JSONValue
    /// member_payment_info: a co-member's IBAN / Revolut / PayPal ({} without).
    func memberPaymentInfo(memberId: String) async throws -> JSONValue

    /// create_group: the new group's id.
    func createGroup(name: String, currency: String) async throws -> String
    func renameGroup(id: String, name: String) async throws
    /// uploadGroupImage: the owner's cover into group-images/<id>/cover.<ext>,
    /// then the group's image_url (the public URL, cache-busted): that URL.
    func uploadGroupImage(groupId: String, data: Data, contentType: String, ext: String) async throws -> String
    /// create_group_expense_v2 (no `expenseId` in `args`) or
    /// update_group_expense_v2; `args` is groupExpenseForm.expenseSaveArgs'.
    func saveGroupExpense(_ args: JSONValue) async throws
    func deleteGroupExpense(id: String) async throws
    /// add_settlement; `args` is settleForm.settlementArgs'.
    func addSettlement(_ args: JSONValue) async throws
    /// nudge_member: a rate-limited "please settle up".
    func nudgeMember(groupId: String, memberId: String) async throws
    /// remove_group_member: leave (your own row) or, as owner, remove someone.
    func removeMember(memberId: String, silent: Bool) async throws
    func deleteGroup(id: String) async throws
    /// respond_to_invite: the group's id when accepted.
    func respondToInvite(id: String, accept: Bool) async throws -> String?
    /// invite_user_to_group: 'invited', 'no_account', 'already_member' or 'already_invited'.
    func inviteExistingUser(groupId: String, email: String) async throws -> String?
    /// A group_invites row (its creator and expiry are the server's): its token.
    func createInvite(groupId: String, email: String?) async throws -> String
    /// The send-invite edge function: the join link by email.
    func emailInvite(to: String, token: String) async throws
    func addComment(groupId: String, targetType: String, targetId: String, authorMemberId: String, body: String) async throws
    func deleteComment(id: String) async throws
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
    let groups: GroupsRepository
    let privacy: PrivacyRepository
    let savings: SavingsRepository
    let plan: PlanRepository
    let insights: InsightsRepository

    /// One object that is every repository (the Supabase store, a test's fake).
    init<Store: ProfileRepository & CategoriesRepository & TransactionsRepository & RecurringRepository
            & BudgetsRepository & FxRepository & AiRepository & GroupsRepository & PrivacyRepository
            & SavingsRepository & PlanRepository & InsightsRepository>(_ store: Store) {
        profile = store
        categories = store
        transactions = store
        recurring = store
        budgets = store
        fx = store
        ai = store
        groups = store
        privacy = store
        savings = store
        plan = store
        insights = store
    }
}

/// A server refusal (a UserError on the web): the ai-helper's code, or a
/// message. `edge`: an edge function's own { error } words; otherwise a
/// database error (its code, P0001 for a RAISE, and its message).
struct ServerError: Error, Equatable, CustomStringConvertible {
    let code: String?
    let message: String
    var edge = false
    var description: String { message }
}
