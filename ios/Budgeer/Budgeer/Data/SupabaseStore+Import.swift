// The statement import's and Settings › Import rules' reads and writes over
// the one client, after the web's importExpenses.js (the rules it reads and
// learns, the chunked save), importRules.js (the rules' list, edit and
// delete) and ai.js suggestCategories: the same table, RPC and edge function,
// argument for argument. The rules are plain columns under per-verb RLS
// (0058); the server's category_rules_guard (0093) stamps the owner, keeps a
// rule on the owner's own categories and trims the pattern.
import Foundation
import Supabase

extension SupabaseStore: ImportRepository {
    func importRules() async throws -> JSONValue {
        try await cached("import-rules") {
            try await refusal {
                try await client.from("category_rules").select("id, pattern, category_id, created_at").execute().value
            }
        }
    }

    func saveImportRule(pattern: String, categoryId: String) async throws {
        let row: JSONValue = ["user_id": .string(try userId()), "pattern": .string(pattern), "category_id": .string(categoryId)]
        try await refusal {
            try await client.from("category_rules").upsert(row, onConflict: "user_id,pattern").execute()
        }
        announce("category_rules")
    }

    func updateImportRule(id: String, pattern: String, categoryId: String) async throws {
        let fields: JSONValue = ["pattern": .string(pattern), "category_id": .string(categoryId)]
        try await refusal { try await client.from("category_rules").update(fields).eq("id", value: id).execute() }
        announce("category_rules")
    }

    func deleteImportRule(id: String) async throws {
        try await refusal { try await client.from("category_rules").delete().eq("id", value: id).execute() }
        announce("category_rules")
    }

    func saveTransactions(_ rows: JSONValue) async throws -> Int {
        let params: [String: JSONValue] = ["p_rows": rows, "p_ignore_duplicates": true]
        let inserted: JSONValue = try await refusal {
            try await client.rpc("save_transactions", params: params).execute().value
        }
        announce("transactions")
        return inserted.intValue ?? 0
    }

    func suggestCategories(merchants: JSONValue, labels: JSONValue) async throws -> JSONValue {
        let body: JSONValue = ["action": "suggest_categories", "merchants": merchants, "labels": labels]
        let answer: JSONValue = try await refusal {
            try await client.functions.invoke("ai-helper", options: FunctionInvokeOptions(body: body))
        }
        return answer["suggestions"] ?? []
    }
}
