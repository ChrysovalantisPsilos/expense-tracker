// Plan mode's, the salary page's and the statement's reads and writes over
// the one client, after the web's features/plan/plan.js (one encrypted plan
// per account: my_recurring_plan, save_recurring_plan / clear_recurring_plan,
// apply_recurring_plan, undo_recurring_plan), ai.js planWhatIf (the
// ai-helper edge function), features/salary/salary.js (my_salary_history,
// save_salary_history), shared/lib/accounts.js (save_account, deleting an
// account) and features/insights/reports.js (the generate-report edge
// function, which builds the statement with the same builder the website
// runs on the device): the same RPCs, tables and functions, argument for
// argument. Each write is announced so the screens showing its table refresh.
import Foundation
import Supabase

extension SupabaseStore: PlanRepository, InsightsRepository {
    // MARK: Plan mode

    func recurringPlan() async throws -> JSONValue {
        try await cached("recurring-plan") {
            let answer: JSONValue = try await refusal { try await client.rpc("my_recurring_plan").execute().value }
            return answer.isNull ? ["plan": .null, "undo": .null] : answer
        }
    }

    func saveRecurringPlan(_ plan: JSONValue, empty: Bool) async throws {
        try await refusal { () async throws -> Void in
            if empty {
                try await client.rpc("clear_recurring_plan").execute()
            } else {
                try await client.rpc("save_recurring_plan", params: ["p_plan": plan]).execute()
            }
        }
    }

    func applyRecurringPlan(apply: JSONValue, remaining: JSONValue?) async throws {
        let params: [String: JSONValue] = ["p_apply": apply, "p_remaining": remaining ?? .null]
        try await refusal { () async throws -> Void in
            try await client.rpc("apply_recurring_plan", params: params).execute()
        }
        announce("recurring_rules")
    }

    func undoRecurringPlan() async throws -> Int {
        let count: JSONValue = try await refusal { try await client.rpc("undo_recurring_plan").execute().value }
        announce("recurring_rules")
        return count.intValue ?? 0
    }

    func planWhatIf(text: String, labels: JSONValue) async throws -> JSONValue {
        let body: JSONValue = ["action": "plan_whatif", "text": .string(text), "labels": labels]
        let answer: JSONValue = try await refusal {
            try await client.functions.invoke("ai-helper", options: FunctionInvokeOptions(body: body))
        }
        return answer["whatif"] ?? .null
    }

    // MARK: Your salary

    func salaryHistory() async throws -> JSONValue {
        try await cached("salary-history") {
            try await refusal { try await client.rpc("my_salary_history").execute().value }
        }
    }

    func saveSalaryHistory(_ notes: JSONValue) async throws {
        try await refusal { () async throws -> Void in
            try await client.rpc("save_salary_history", params: ["p": notes]).execute()
        }
    }

    // MARK: Net worth

    func saveNetWorthAccount(_ account: JSONValue) async throws {
        // accounts.js saveAccount: every field, the encrypting RPC rewrites them all.
        let params: [String: JSONValue] = [
            "p_id": account["id"] ?? .null, "p_name": account["name"] ?? .null, "p_type": account["type"] ?? .null,
            "p_balance": account["balance_minor"] ?? .null, "p_currency": account["currency"] ?? .null,
        ]
        try await refusal { () async throws -> Void in
            try await client.rpc("save_account", params: params).execute()
        }
        announce("accounts")
    }

    func deleteNetWorthAccount(id: String) async throws {
        try await refusal { () async throws -> Void in
            try await client.from("accounts").delete().eq("id", value: id).execute()
        }
        announce("accounts")
    }

    // MARK: The statement

    func statement(from: String, to: String, format: String) async throws -> Data {
        let body: JSONValue = ["from": .string(from), "to": .string(to), "format": .string(format)]
        return try await refusal {
            try await client.functions.invoke("generate-report", options: FunctionInvokeOptions(body: body)) { data, _ in data }
        }
    }
}
