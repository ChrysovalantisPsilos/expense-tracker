// Settings' reads and writes over the one client, after the web's
// shared/lib/profile.js (the profile's columns, the payment details, the
// photo), shared/lib/categories.js (adding, editing and deleting a category)
// and features/privacy/privacyData.js (the consent history, the data export,
// a privacy request, deleting the account): the same tables, RPCs, bucket
// and edge functions, argument for argument. Each write is announced so the
// screens showing its table refresh at once; a refusal comes back in the
// web's shape (refusal), so the core's errors.userMessage says what to show.
import Foundation
import Supabase

extension SupabaseStore: PrivacyRepository {
    // MARK: Push (this install's APNs token)

    func saveDeviceToken(_ token: String, environment: String) async throws {
        _ = try await refusal {
            try await client.rpc("save_apns_token", params: ["p_token": token, "p_env": environment]).execute()
        }
    }

    func deleteDeviceToken(_ token: String) async throws {
        _ = try await refusal { try await client.rpc("delete_apns_token", params: ["p_token": token]).execute() }
    }

    // MARK: The profile

    func updateProfile(_ fields: JSONValue) async throws {
        let uid = try userId()
        try await refusal { try await client.from("profiles").update(fields).eq("id", value: uid).execute() }
        announce("profiles")
    }

    func baseCurrencyLocked() async throws -> Bool {
        let locked: JSONValue = try await refusal { try await client.rpc("base_currency_locked").execute().value }
        return locked.boolValue == true
    }

    func myPaymentInfo() async throws -> JSONValue {
        try await cached("payment-info") {
            try await refusal { try await client.rpc("my_payment_info").execute().value }
        }
    }

    func savePaymentInfo(_ details: JSONValue) async throws {
        // profile.js savePaymentInfo: an empty PayPal name clears it ('').
        let params: [String: JSONValue] = [
            "p_iban": details["iban"] ?? .null, "p_revolut": details["revolut"] ?? .null,
            "p_paypal": .string(details["paypal"]?.stringValue ?? ""),
        ]
        try await refusal { try await client.rpc("set_payment_info", params: params).execute() }
        announce("profiles")
    }

    func uploadAvatar(data: Data, contentType: String, ext: String) async throws -> String {
        // profile.js uploadAvatar: the user's own folder, replaced in place,
        // then the public URL with a cache-buster on the profile.
        let uid = try userId()
        let path = "\(uid)/avatar.\(ext)"
        let bucket = client.storage.from("avatars")
        let url: String = try await refusal {
            try await bucket.upload(path, data: data, options: FileOptions(contentType: contentType, upsert: true))
            let base = try bucket.getPublicURL(path: path)
            let stamped = "\(base.absoluteString)?t=\(data.count)"
            try await client.from("profiles").update(["avatar_url": JSONValue.string(stamped)]).eq("id", value: uid).execute()
            return stamped
        }
        announce("profiles")
        return url
    }

    // MARK: Categories

    func allCategories() async throws -> JSONValue {
        try await cached("all-categories") {
            try await client.from("categories").select("\(SupabaseStore.categoryColumns), created_at")
                .order("name").execute().value
        }
    }

    func createCategory(_ row: JSONValue) async throws {
        try await categoryRefusal { try await client.from("categories").insert(row).execute() }
        announce("categories")
    }

    func updateCategory(id: String, fields: JSONValue) async throws {
        try await categoryRefusal { try await client.from("categories").update(fields).eq("id", value: id).execute() }
        announce("categories")
    }

    func countCategoryUse(id: String) async throws -> Int {
        let response: PostgrestResponse<Void> = try await refusal {
            try await client.from("transactions").select("id", head: true, count: .exact)
                .eq("category_id", value: id).execute()
        }
        return response.count ?? 0
    }

    func deleteCategory(id: String, moveTo: String?) async throws -> Int {
        let params: [String: JSONValue] = ["p_category": .string(id), "p_move_to": moveTo.json]
        let moved: JSONValue = try await refusal {
            try await client.rpc("delete_category", params: params).execute().value
        }
        announce("categories")
        announce("transactions")
        return moved.intValue ?? 0
    }

    /// categories.js friendly: a duplicate name (23505) is the one refusal
    /// worth its own words; any other keeps the web's shape.
    private func categoryRefusal<T>(_ work: () async throws -> T) async throws -> T {
        do {
            return try await refusal(work)
        } catch let error as ServerError where error.code == "23505" {
            throw ServerError(code: error.code, message: core.text("categories:nameErrors.taken"), edge: true)
        }
    }

    // MARK: PrivacyRepository

    func consents() async throws -> JSONValue {
        try await cached("consents") {
            try await refusal {
                try await client.from("consents").select("id, purpose, version, granted, source, created_at")
                    .order("created_at", ascending: false).limit(200).execute().value
            }
        }
    }

    func exportMyData() async throws -> JSONValue {
        try await refusal { try await client.rpc("export_my_data").execute().value }
    }

    func sendPrivacyRequest(_ request: JSONValue) async throws {
        try await refusal { () async throws -> Void in
            try await client.functions.invoke("privacy-request", options: FunctionInvokeOptions(body: request))
            return
        }
    }

    func deleteAccount(password: String?) async throws {
        var body: JSONValue = [:]
        if let password { body = ["password": .string(password)] }
        try await refusal { () async throws -> Void in
            try await client.functions.invoke("delete-account", options: FunctionInvokeOptions(body: body))
            return
        }
    }
}
