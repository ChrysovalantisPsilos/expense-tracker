// Settings › Your data's reads and writes, after the web's backup.js step
// for step: gathering everything into the backup document, and merging a
// backup back into the account. The reads and writes are the other
// repositories' (as backup.js goes through the other features' modules);
// every decision is the core's (backupMath: the document, the checks, the
// plans for categories, accounts, rules, entries, recurring entries, the
// plan, budgets, goals, the settings and the main currency).
import Foundation
import BudgeerCore

/// Sealing and opening a backup's text: BackupSeal on the phone (CryptoKit).
protocol BackupSealing: Sendable {
    /// `text` sealed under `password`: base64 salt, IV and ciphertext (with the tag).
    func seal(_ text: String, password: String, iterations: Int, saltBytes: Int, ivBytes: Int,
              aad: String) throws -> (salt: String, iv: String, ciphertext: String)
    /// The text of an envelope the core checked (envelopeParams' fields); throws on a wrong password or a damaged file.
    func open(salt: String, iv: String, ciphertext: String, iterations: Int, aad: String, password: String) throws -> String
}

struct BackupSealFailed: Error {}

/// A failure in the web's own words (the incomplete read, a damaged file).
struct BackupMessage: Error, Equatable {
    let text: String
}

/// Where a restore is: the step's words and, while saving entries, how far.
struct RestoreProgress: Equatable {
    let label: String
    var done = 0
    var total = 0
}

@MainActor
struct BackupData {
    let data: DataLayer
    let core: BudgeerCore
    let now: @Sendable () -> Date

    /// `new Date().toISOString()`: the instant a backup was made.
    static let instant: ISO8601DateFormatter = {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return formatter
    }()

    /// What to show for a failure: the core's or the web's own words, else the generic line.
    static func message(_ error: Error, fallback: String? = nil, core: BudgeerCore) -> String {
        if let mine = error as? BackupMessage { return mine.text }
        if case BudgeerCoreError.coreError(let text) = error { return text }
        return UserMessage.of(error, fallback: fallback, core: core)
    }

    // MARK: Reading everything

    /// Every transaction, newest first: one read for most accounts, date
    /// windows for longer histories (each split while it comes back full),
    /// then checked against the head count, so a backup is never silently
    /// short. With `base`, rates the server hasn't filled yet are estimated.
    func allTransactions(base: String?) async throws -> JSONValue {
        let cap: Int = try core.call("backupMath", "FETCH_ROW_CAP", [])
        let first = try await read(TxnQuery(), base: base)
        var rows = first
        if first.count >= cap {
            let from = try await data.transactions.oldestDate()
            let to = first.first?["spent_at"]?.stringValue
            rows = []
            var pending: [(String?, String?)] = [(from, to)]
            while !pending.isEmpty {
                let (start, end) = pending.removeFirst()
                let part = try await read(TxnQuery(from: start, to: end), base: base)
                let halves: JSONValue = part.count >= cap
                    ? try core.json("backupMath", "splitDateRange", [start.json, end.json]) : .null
                if let split = halves.arrayValue {
                    pending.insert(contentsOf: split.map { ($0.arrayValue?.first?.stringValue, $0.arrayValue?.last?.stringValue) }, at: 0)
                } else {
                    rows += part
                }
            }
        }
        let total = try await data.backup.countTransactions()
        guard rows.count == total else { throw BackupMessage(text: core.text("backup:errors.incomplete")) }
        return .array(rows)
    }

    private func read(_ query: TxnQuery, base: String?) async throws -> [JSONValue] {
        let rows = try await data.transactions.transactions(query)
        guard let base else { return rows.arrayValue ?? [] }
        let filled = try await FxRates.fillPending(rows, base: base, today: try core.isoDate(now()), fx: data.fx, core: core)
        return filled.arrayValue ?? []
    }

    /// Every month's budgets (each month with any).
    func allBudgets() async throws -> JSONValue {
        var out: [JSONValue] = []
        for period in try await data.budgets.budgetPeriods().arrayValue ?? [] {
            guard let month = period.stringValue else { continue }
            out += try await data.budgets.budgets(period: month).arrayValue ?? []
        }
        return .array(out)
    }

    /// The saved plan as the page edits it (plan.js readPlan).
    private func readPlan() async throws -> JSONValue {
        try core.json("planMath", "normalisePlan", [try await data.plan.recurringPlan()["plan"] ?? .null])
    }

    /// Each group's whole ledger as backup.js reads it (getGroup's detail),
    /// with the comment threads of the items that have any.
    private func groupLedgers(_ groups: [JSONValue]) async throws -> JSONValue {
        var out: [JSONValue] = []
        for group in groups {
            guard let id = group["id"]?.stringValue else { continue }
            let detail = try await data.groups.groupDetail(id: id)
            let counts = try core.json("groupFormat", "commentCountsFrom", [try await data.groups.groupCommentCounts(id: id)])
            var threads: [JSONValue] = []
            for pair in JSONValue.mapPairs(counts) {
                guard let target = pair.key.stringValue, (pair.value.intValue ?? 0) > 0 else { continue }
                threads.append([pair.key, try await data.groups.groupComments(groupId: id, targetId: target)])
            }
            out.append([
                "group": detail["group"] ?? [:],
                "members": try core.json("groupFormat", "membersWithAvatars", [detail["members"] ?? [], detail["avatars"] ?? []]),
                "expenses": detail["ledger"]?["expenses"] ?? [],
                "settlements": detail["ledger"]?["settlements"] ?? [],
                "balances": try core.json("groupFormat", "balancesFrom", [detail["balances"] ?? []]),
                "comments": ["$": "map", "v": .array(threads)],
            ])
        }
        return .array(out)
    }

    /// Everything into a backup document (backupMath.buildBackup), one read
    /// after another; `step` says what's being read, in the app's language.
    func gather(userId: String, step: (String) -> Void) async throws -> JSONValue {
        step(core.text("backup:export.steps.settings"))
        // A backup without its settings (and its main currency) stops here.
        let profile = try await data.backup.backupProfile()
        let payment = try await data.profile.myPaymentInfo()
        step(core.text("backup:export.steps.lists"))
        let categories = try await data.categories.allCategories()
        let categoryRules = try await data.imports.importRules()
        let accounts = try await data.savings.accounts()
        let goals = try await data.savings.goals()
        step(core.text("backup:export.steps.plans"))
        let budgets = try await allBudgets()
        let recurring = try await data.recurring.rules()
        let plan = try await readPlan()
        let vouchers = try await data.profile.mealVouchers()
        let salary = try await data.insights.salaryHistory()
        step(core.text("backup:export.steps.entries"))
        let transactions = try await allTransactions(base: profile["base_currency"]?.stringValue ?? "EUR")
        step(core.text("backup:export.steps.groups"))
        let groupList = try await data.groups.groups().arrayValue ?? []
        let groups = try await groupLedgers(groupList)
        let names: [JSONValue] = groupList.compactMap { group in
            guard let id = group["id"], let name = group["name"] else { return nil }
            return [id, name]
        }
        let input: JSONValue = [
            "exportedAt": .string(BackupData.instant.string(from: now())), "userId": .string(userId),
            "profile": profile, "payment": payment, "categories": categories, "categoryRules": categoryRules,
            "accounts": accounts, "goals": goals, "budgets": budgets, "recurring": recurring, "transactions": transactions,
            "plan": plan, "vouchers": vouchers, "salary": salary,
            "groupNames": ["$": "map", "v": .array(names)], "groups": groups,
        ]
        let engine = core
        return try await Task.detached { try engine.json("backupMath", "buildBackup", [input]) }.value
    }

    // MARK: The main currency

    /// What a restore will do about the main currency, for the confirm step:
    /// { change, from, to } (backupMath.currencyChange). A failed check
    /// counts as locked: never plan to switch a currency we can't confirm is free.
    func currencyPlan(_ backup: JSONValue) async throws -> JSONValue {
        let profile = try await data.backup.backupProfile()
        let locked = (try? await data.profile.baseCurrencyLocked()) ?? true
        let from = backup["data"]?["profile"]?["base_currency"] ?? .null
        let to = JSONValue.string(profile["base_currency"]?.stringValue ?? "EUR")
        let change = try core.json("backupMath", "currencyChange", [from, to, JSONValue.bool(locked)])
        return ["change": change, "from": from, "to": to]
    }

    /// The backup's data restated in `toBase` (backupMath.rebaseBackupData),
    /// with the ECB rates fetched as an import fetches them.
    private func inMainCurrency(_ backupData: JSONValue, toBase: String) async throws -> JSONValue {
        let options: JSONValue = [
            "fromBase": backupData["profile"]?["base_currency"] ?? .null, "toBase": .string(toBase),
            "todayIso": .string(try core.isoDate(now())),
        ]
        let spans = try core.json("backupMath", "rebaseRateSpans", [backupData, options])
        let series = await FxRates.seriesMap(spans, to: toBase, fx: data.fx)
        return try core.json("backupMath", "rebaseBackupData", [backupData, options.with("seriesByCurrency", series)])
    }

    // MARK: Restoring

    /// Merge a validated backup into the account: add what's missing, skip
    /// duplicates, never delete or overwrite (budgets for the same month
    /// excepted: those upsert). Safe to run twice. Categories and accounts
    /// first (everything else points at them), entries before budgets,
    /// profile settings first and last. The tally restoreSummary words.
    func restore(_ backup: JSONValue, userId: String, email: String?,
                 progress: @escaping @MainActor (RestoreProgress) -> Void) async throws -> JSONValue {
        let step = { (id: String, done: Int, total: Int) in
            progress(RestoreProgress(label: core.text("backup:restore.progressSteps.\(id)"), done: done, total: total))
        }
        var tally = RestoreTally()

        step("checking", 0, 0)
        // The profile must be read: its main currency decides what the amounts mean.
        let categoriesNow = try await data.categories.allCategories()
        let accountsNow = try await data.savings.accounts()
        let entriesNow = try await allTransactions(base: nil)
        let current = try await data.backup.backupProfile()
        let locked = (try? await data.profile.baseCurrencyLocked()) ?? true

        // Profile settings go first: the main currency can only change while
        // the account has no entries (0078), i.e. before this restore adds any.
        let emailName: String = try core.call("backupMath", "emailName", [email.json])
        let profilePlan = try core.json("backupMath", "planProfile", [backup["data"] ?? [:], current, [
            "emailName": .string(emailName), "emptyAccount": .bool(!locked),
        ] as JSONValue])
        let base: String = try core.call("backupMath", "targetCurrency", [profilePlan, current])
        let content = try await inMainCurrency(backup["data"] ?? [:], toBase: base)
        try await updateProfile(profilePlan["patch"])

        step("categories", 0, 0)
        let categoryPlan = try core.json("backupMath", "mapCategories", [content["categories"] ?? [], categoriesNow])
        let missing = count(categoryPlan["missing"])
        try await data.backup.createCategories(try core.json("backupMath", "categoryRows", [categoryPlan["missing"] ?? []]))
        tally.add("categories", missing)
        tally.add("duplicates", count(content["categories"]) - missing)
        var categoryIdByKey = categoryPlan["idByKey"] ?? .null
        if missing > 0 {
            let categoriesAfter = try await data.categories.allCategories()
            categoryIdByKey = try core.json("backupMath", "mapCategories", [content["categories"] ?? [], categoriesAfter])["idByKey"] ?? .null
        }

        // The salary shift points at a category, so it's set once they exist.
        let salaryPlan = try core.json("backupMath", "planSalaryShift", [content["profile"] ?? [:], current, categoryIdByKey])
        try await updateProfile(salaryPlan["patch"])

        step("accounts", 0, 0)
        let accountPlan = try core.json("backupMath", "matchByName", [content["accounts"] ?? [], accountsNow])
        for account in accountPlan["fresh"]?.arrayValue ?? [] {
            try await data.savings.saveNetWorthAccount([
                "id": .null, "name": account["name"] ?? .null, "type": account["type"] ?? .null,
                "balance_minor": account["balance_minor"] ?? .null, "currency": account["currency"] ?? .null,
            ])
        }
        tally.add("accounts", count(accountPlan["fresh"]))
        tally.add("duplicates", count(accountPlan["skipped"]))
        var accountIdByKey = accountPlan["idByKey"] ?? .null
        if count(accountPlan["fresh"]) > 0 {
            let accountsAfter = try await data.savings.accounts()
            accountIdByKey = try core.json("backupMath", "matchByName", [content["accounts"] ?? [], accountsAfter])["idByKey"] ?? .null
        }

        step("rules", 0, 0)
        let rulesNow = try await data.imports.importRules()
        let rulePlan = try core.json("backupMath", "planRules", [content["categoryRules"] ?? [], rulesNow, categoryIdByKey])
        for rule in rulePlan["create"]?.arrayValue ?? [] {
            guard let pattern = rule["pattern"]?.stringValue, let categoryId = rule["category_id"]?.stringValue else { continue }
            try await data.imports.saveImportRule(pattern: pattern, categoryId: categoryId)
        }
        tally.add("rules", count(rulePlan["create"]))
        tally.add("duplicates", count(rulePlan["skipped"]))

        let maps: JSONValue = ["userId": .string(userId), "categoryIdByKey": categoryIdByKey, "accountIdByKey": accountIdByKey]
        let engine = core
        let entries = content["transactions"] ?? []
        let entryPlan: JSONValue = try await Task.detached {
            try engine.json("backupMath", "planTransactions", [entries, entriesNow, maps])
        }.value
        tally.add("duplicates", count(entryPlan["duplicates"]))
        // Saved per kind so the summary can say how many of each were new;
        // rows the server itself recognises (an interrupted earlier restore)
        // come back as duplicates.
        let all = entryPlan["rows"]?.arrayValue ?? []
        let chunk: Int = try core.call("statementRows", "SAVE_CHUNK", [])
        var done = 0
        step("entries", 0, all.count)
        for kind in ["expense", "income"] {
            let rows = all.filter { $0["kind"]?.stringValue == kind }
            var inserted = 0
            var start = 0
            while start < rows.count {
                let part = Array(rows[start..<min(start + chunk, rows.count)])
                inserted += try await data.imports.saveTransactions(.array(part))
                start += chunk
                step("entries", done + min(start, rows.count), all.count)
            }
            done += rows.count
            tally.add(kind == "expense" ? "expenses" : "income", inserted)
            tally.add("duplicates", rows.count - inserted)
        }

        step("recurring", 0, 0)
        let recurringNow = try await data.recurring.rules()
        let recurringPlan = try core.json("backupMath", "planRecurring", [
            content["recurring"] ?? [], recurringNow, ["categoryIdByKey": categoryIdByKey, "accountIdByKey": accountIdByKey] as JSONValue,
        ])
        for rule in recurringPlan["create"]?.arrayValue ?? [] { try await data.recurring.save(id: nil, fields: rule) }
        tally.add("recurring", count(recurringPlan["create"]))
        tally.add("duplicates", count(recurringPlan["skipped"]))

        // Plan mode's plan: only into an account that has none, with the
        // changes whose recurring entry is here.
        if let saved = content["plan"], !saved.isNull {
            let planNow = try await readPlan()
            let empty: Bool = try core.call("planMath", "isEmptyPlan", [planNow])
            if empty {
                let rulesAfter = try await data.recurring.rules()
                let plan = try core.json("backupMath", "restorePlan", [saved, content["recurring"] ?? [], rulesAfter, categoryIdByKey])
                let nothing: Bool = try core.call("planMath", "isEmptyPlan", [plan])
                if !nothing {
                    try await data.plan.saveRecurringPlan(plan, empty: false)
                    tally.add("plan", 1)
                }
            }
        }

        // The meal voucher setup: only into an account that doesn't get vouchers yet.
        if let vouchers = content["vouchers"], !vouchers.isNull {
            let setup = try await data.profile.mealVouchers()
            if setup.isNull { try await data.profile.saveMealVouchers(vouchers) }
        }

        // The salary corrections: only into an account that has none, each
        // onto the account's matching entry (restored or already there).
        let wantsSalary: Bool = try core.call("backupMath", "wantsSalary", [content])
        if wantsSalary {
            let notesNow = try await data.insights.salaryHistory()
            if notesNow.isNull {
                let entriesAfter = try await allTransactions(base: nil)
                let notes = try core.json("backupMath", "restoreSalary", [content, entriesAfter, categoryIdByKey])
                if !notes.isNull { try await data.insights.saveSalaryHistory(notes) }
            }
        }

        step("budgets", 0, 0)
        let budgetsNow = try await allBudgets()
        let budgetPlan = try core.json("backupMath", "planBudgets", [content["budgets"] ?? [], budgetsNow, categoryIdByKey])
        for budget in (budgetPlan["create"]?.arrayValue ?? []) + (budgetPlan["update"]?.arrayValue ?? []) {
            guard let categoryId = budget["categoryId"]?.stringValue, let amount = budget["amountMinor"]?.intValue,
                  let currency = budget["currency"]?.stringValue, let period = budget["periodStart"]?.stringValue else { continue }
            try await data.backup.saveBudget(categoryId: categoryId, amountMinor: amount, currency: currency, period: period)
        }
        tally.add("budgets", count(budgetPlan["create"]))
        tally.add("budgetsUpdated", count(budgetPlan["update"]))
        tally.add("duplicates", count(budgetPlan["unchanged"]))

        step("goals", 0, 0)
        let goalsNow = try await data.savings.goals()
        let goalPlan = try core.json("backupMath", "matchByName", [content["goals"] ?? [], goalsNow])
        for goal in goalPlan["fresh"]?.arrayValue ?? [] { try await data.savings.saveGoal(goal) }
        tally.add("goals", count(goalPlan["fresh"]))
        tally.add("duplicates", count(goalPlan["skipped"]))

        step("payment", 0, 0)
        let paymentNow = try await data.profile.myPaymentInfo()
        let paymentPlan = try core.json("backupMath", "planPayment", [content, paymentNow])
        if let patch = paymentPlan["patch"], !patch.isNull { try await data.profile.savePaymentInfo(patch) }
        let settings = try core.json("backupMath", "settingsTally", [profilePlan, salaryPlan, paymentPlan])
        return tally.json.with("settings", settings["settings"] ?? 0).with("kept", settings["kept"] ?? [])
    }

    /// A plan's profile patch, written when it has anything in it.
    private func updateProfile(_ patch: JSONValue?) async throws {
        guard let patch, !(patch.objectValue ?? [:]).isEmpty else { return }
        try await data.profile.updateProfile(patch)
    }

    /// How many items a plan's list holds, or its number.
    private func count(_ value: JSONValue?) -> Int { value?.arrayValue?.count ?? value?.intValue ?? 0 }
}

/// The restore's counts as it goes (backup.js's tally): what was added of
/// each kind, budgets updated, duplicates skipped.
struct RestoreTally {
    private var counts: [String: Int] = [
        "expenses": 0, "income": 0, "categories": 0, "rules": 0, "budgets": 0, "budgetsUpdated": 0,
        "recurring": 0, "plan": 0, "accounts": 0, "goals": 0, "duplicates": 0,
    ]

    mutating func add(_ key: String, _ amount: Int) { counts[key, default: 0] += amount }

    var json: JSONValue { .object(counts.mapValues { JSONValue.int($0) }) }
}
