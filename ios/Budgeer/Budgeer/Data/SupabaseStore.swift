// Every repository over the one Supabase client: the same tables, RPCs and
// edge function as the web's data modules (the names are theirs, argument for
// argument), reads kept for offline use (QueryCache), and each write
// announced so the screens showing that table refresh at once (the web's
// announceChange: realtime never delivers a filtered DELETE). Exchange rates
// come from Frankfurter as on the web, the URL and the parsing from the core.
import Foundation
#if canImport(FoundationNetworking)
import FoundationNetworking
#endif
import Supabase
import BudgeerCore

final class SupabaseStore: ProfileRepository, CategoriesRepository, TransactionsRepository, RecurringRepository,
    BudgetsRepository, FxRepository, AiRepository, GroupsRepository, @unchecked Sendable {
    let client: SupabaseClient
    private let cache: QueryCache
    let core: BudgeerCore
    private let http: URLSession
    private let defaults: UserDefaults
    let announce: @Sendable (String) -> Void

    /// The profile columns the screens read (ProfileProvider's figures, the helpers' switches).
    static let profileColumns = "id, base_currency, yearly_separate, salary_shift_from_day, salary_category_id, "
        + "ai_quick_entry, ai_import_categories, ai_month_summary, ai_plan_whatif"
    /// shared/lib/categories.js CATEGORY_COLUMNS.
    static let categoryColumns = "id, name, kind, icon, color, is_archived, is_savings, default_key"

    init(client: SupabaseClient, cache: QueryCache, core: BudgeerCore = .shared, http: URLSession = .shared,
         defaults: UserDefaults = .standard, announce: @escaping @Sendable (String) -> Void = { _ in }) {
        self.client = client
        self.cache = cache
        self.core = core
        self.http = http
        self.defaults = defaults
        self.announce = announce
    }

    // MARK: The signed-in user and the offline copy

    func userId() throws -> String {
        guard let user = client.auth.currentUser else {
            throw ServerError(code: "signed_out", message: "Not signed in")
        }
        return user.id.uuidString.lowercased()
    }

    /// A read, network first, its last good answer when offline (per user).
    func cached(_ name: String, _ params: String = "",
                        _ fetch: () async throws -> JSONValue) async throws -> JSONValue {
        let key = "\(try userId())|\(name)|\(params)"
        return try await cache.read(key, fetch: fetch)
    }

    private static func keyOf<T: Encodable>(_ value: T) -> String {
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.sortedKeys]
        return (try? encoder.encode(value)).map { String(decoding: $0, as: UTF8.self) } ?? ""
    }

    // MARK: ProfileRepository

    func profile() async throws -> JSONValue {
        let uid = try userId()
        return try await cached("profile") {
            try await client.from("profiles").select(SupabaseStore.profileColumns)
                .eq("id", value: uid).single().execute().value
        }
    }

    func mealVouchers() async throws -> JSONValue {
        try await cached("vouchers") {
            try await client.rpc("my_meal_vouchers").execute().value
        }
    }

    // MARK: CategoriesRepository

    func categories(kind: String?) async throws -> JSONValue {
        let rows = try await cached("categories", kind ?? "") {
            var query = client.from("categories").select(SupabaseStore.categoryColumns).eq("is_archived", value: false)
            if let kind { query = query.eq("kind", value: kind) }
            let rows: JSONValue = try await query.order("name").execute().value
            return rows
        }
        // A–Z by the name shown, in the app's language (useCategories).
        return try core.call("categoryName", "sortByDisplayName", [rows])
    }

    func savingsCategories() async throws -> JSONValue {
        try await cached("savings-categories") {
            try await client.from("categories").select("id, kind, is_savings").eq("is_savings", value: true).execute().value
        }
    }

    // MARK: TransactionsRepository

    func transactions(_ query: TxnQuery) async throws -> JSONValue {
        let params: [String: JSONValue] = [
            "p_kind": query.kind.json, "p_from": query.from.json, "p_to": query.to.json,
            "p_category": query.categoryId.json, "p_limit": query.limit.map { JSONValue.int($0) } ?? .null,
            "p_spread": .bool(query.spread),
        ]
        return try await cached("transactions", SupabaseStore.keyOf(query)) {
            try await client.rpc("my_transactions", params: params).execute().value
        }
    }

    func oldestDate() async throws -> String? {
        let rows = try await cached("oldest") {
            try await client.from("transactions").select("spent_at")
                .order("spent_at", ascending: true).limit(1).execute().value
        }
        return rows.arrayValue?.first?["spent_at"]?.stringValue
    }

    func newestIncome(categoryId: String, since: String) async throws -> JSONValue {
        try await cached("newest-income", "\(categoryId)|\(since)") {
            try await client.from("transactions").select("kind, category_id, spent_at")
                .eq("kind", value: "income").eq("category_id", value: categoryId).gte("spent_at", value: since)
                .order("spent_at", ascending: false).limit(1).execute().value
        }
    }

    func insert(_ row: JSONValue) async throws {
        try await client.rpc("save_transactions", params: ["p_rows": JSONValue.array([row])]).execute()
        announce("transactions")
    }

    func update(id: String, fields: JSONValue) async throws {
        try await client.rpc("update_transaction", params: ["p_id": JSONValue.string(id), "p_patch": fields]).execute()
        announce("transactions")
    }

    func delete(id: String) async throws {
        try await client.from("transactions").delete().eq("id", value: id).execute()
        announce("transactions")
    }

    // MARK: RecurringRepository

    func rules() async throws -> JSONValue {
        try await cached("recurring") {
            try await client.rpc("my_recurring_rules").execute().value
        }
    }

    func save(id: String?, fields: JSONValue) async throws {
        try await client.rpc("save_recurring_rule", params: ["p_id": id.json, "p_fields": fields]).execute()
        announce("recurring_rules")
    }

    func deleteRule(id: String) async throws {
        try await client.from("recurring_rules").delete().eq("id", value: id).execute()
        announce("recurring_rules")
    }

    // MARK: BudgetsRepository

    func budgets(period: String) async throws -> JSONValue {
        try await cached("budgets", period) {
            try await client.rpc("my_budgets", params: ["p_period": JSONValue.string(period)]).execute().value
        }
    }

    func edit(categoryId: String, amountMinor: Int, currency: String, period: String) async throws {
        let params: [String: JSONValue] = [
            "p_category": .string(categoryId), "p_amount": .int(amountMinor),
            "p_currency": .string(currency), "p_period": .string(period),
        ]
        try await client.rpc("edit_budget", params: params).execute()
        announce("budgets")
    }

    func delete(categoryId: String, period: String) async throws {
        let params: [String: JSONValue] = ["p_category": .string(categoryId), "p_period": .string(period)]
        try await client.rpc("delete_budget", params: params).execute()
        announce("budgets")
    }

    func copyPrevious(period: String) async throws -> Int {
        let copied: JSONValue = try await client.rpc("copy_previous_budgets", params: ["p_period": JSONValue.string(period)])
            .execute().value
        announce("budgets")
        return copied.intValue ?? 0
    }

    // MARK: FxRepository (fx.js: getRate, getRateSeries)

    private func todayISO() throws -> String {
        try core.call("dates", "isoDate", [JSDate(Date())])
    }

    /// The body of a GET, or null for a failed answer (fx.js getJson).
    private func getJSON(_ url: String) async throws -> JSONValue {
        guard let address = URL(string: url) else { return .null }
        let (data, response) = try await http.data(from: address)
        guard let status = (response as? HTTPURLResponse)?.statusCode, (200..<300).contains(status) else { return .null }
        return try JSONValue.parse(data)
    }

    func rate(from: String, to: String, date: String?) async -> JSONValue? {
        do {
            let now = try todayISO()
            let asked: String = try core.call("currency", "fxQueryDate", [date.json, now])
            if from == to { return ["rate": 1, "date": .string(asked)] }
            let key: String = try core.call("currency", "fxCacheKey", [from, to, asked])
            if let stored = defaults.data(forKey: key), let hit = try? JSONValue.parse(stored),
               (hit["rate"]?.doubleValue ?? 0) > 0, hit["date"]?.stringValue != nil {
                return hit
            }
            let url: String = try core.call("currency", "fxUrl", [from, to, asked])
            let answer: JSONValue = try core.call("currency", "parseFxResponse", [try await getJSON(url), from, to])
            if answer.isNull { return nil }
            let final: Bool = try core.call("currency", "isFinalFx", [asked, answer, now])
            if final { defaults.set(try JSONEncoder().encode(answer), forKey: key) }
            return answer
        } catch {
            return nil
        }
    }

    func series(from: String, to: String, first: String, last: String) async -> JSONValue {
        do {
            let lastAsked: String = try core.call("currency", "fxQueryDate", [last, try todayISO()])
            let url: String = try core.call("currency", "fxRangeUrl", [from, to, first, lastAsked])
            return try core.call("currency", "parseFxSeries", [try await getJSON(url), from, to])
        } catch {
            return []
        }
    }

    // MARK: AiRepository (ai.js fillFromText)

    func parseEntry(text: String, today: String, labels: JSONValue) async throws -> JSONValue {
        let body: JSONValue = ["action": "parse_entry", "text": .string(text), "today": .string(today), "labels": labels]
        do {
            let answer: JSONValue = try await client.functions.invoke("ai-helper", options: FunctionInvokeOptions(body: body))
            return answer["entry"] ?? .null
        } catch FunctionsError.httpError(_, let data) {
            // The server's { error, code } (errors.js edgeFunctionError).
            let payload = try? JSONValue.parse(data)
            throw ServerError(code: payload?["code"]?.stringValue, message: payload?["error"]?.stringValue ?? "")
        }
    }
}
