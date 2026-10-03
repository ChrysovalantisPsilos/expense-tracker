// Plan mode as the web's Plan.jsx and plan.js work it out, every step a core
// call (in Node the same sequence writes the parity fixture:
// mobile-core/screenFigures.mjs planFigures): what to read (planReads), the
// savings categories (savingsIdsOf), the salary category, the derived Salary
// and Savings rows (derivedSalary, derivedSavings), the plan as the app keeps
// it (normalisePlan), the budget months' sets (setPeriods), the page's state
// (planState) and its parts (planPageParts). The editors' parts, the picker,
// the Apply sheet and the what-if preview are core calls too (PlanModel).
// Swift lays them out.
import Foundation
import BudgeerCore

/// A worded figure with its tone ('positive', 'negative', 'muted', 'default').
struct PlanFigure: Codable, Equatable, Sendable {
    let text: String
    let tone: String
}

/// A signal's tag: its kind ('priceUp', 'overlap', 'overBudget', 'biggest') and words.
struct PlanTag: Codable, Equatable, Sendable {
    let kind: String
    let text: String
}

/// "How it adds up" (SumSteps).
struct PlanSteps: Codable, Equatable, Sendable {
    struct Step: Codable, Equatable, Sendable {
        let key: String
        let label: String
        let value: String
        /// Today's figure, struck through, where the plan moves it.
        let was: String?
    }
    struct Total: Codable, Equatable, Sendable {
        let label: String
        let value: String
        let was: String?
        let tone: String
    }
    let title: String
    let steps: [Step]
    let total: Total
}

/// "How often" (frequencyOptions): the value picked ('custom' for the rule's own "every N").
struct PlanFrequency: Codable, Equatable, Sendable {
    let value: String
    let options: [CoreChoice]
}

/// What a change does a month and a year (deltaParts).
struct PlanDelta: Codable, Equatable, Sendable {
    let word: String
    let perMonth: String
    let perYear: String
    let tone: String
}

struct PlanHeader: Codable, Equatable, Sendable {
    struct Chip: Codable, Equatable, Sendable {
        let text: String
        /// Above zero green, below red, zero neutral.
        let good: Double
    }
    /// 'net' or 'payments' (no recurring income).
    let mode: String
    let label: String
    let figure: String
    let delta: Chip
    /// "was <s>€…</s>" (rich), nil when nothing moved.
    let was: String?
    let saved: String?
    let steps: PlanSteps?
    let converted: String?
    let missing: String?
    let hasInfo: Bool
    let incomeHint: Bool
}

/// The last apply: just applied (Undo until…), or the quiet note.
struct PlanApplied: Codable, Equatable, Sendable {
    let canUndo: Bool
    let count: Int
    let title: String?
    let body: String?
    let until: String?
    let note: String?
}

struct PlanLine: Codable, Equatable, Identifiable, Sendable {
    let id: String
    let text: String
}

struct PlanReality: Codable, Equatable, Sendable {
    let lines: [PlanLine]
}

struct PlanIdeaCard: Codable, Equatable, Identifiable, Sendable {
    let id: String
    let kind: String
    /// The idea itself (tryIdeaWith, the picker).
    let idea: JSONValue
    /// 'pick' (the overlap's picker), 'open' (the payment's editor) or 'try' (cancel it in the plan).
    let action: String
    let tag: PlanTag
    let title: String
    let body: String
    let figure: PlanFigure
    let tryLabel: String
    let dismissLabel: String
}

struct PlanIdeas: Codable, Equatable, Sendable {
    let count: String?
    let cards: [PlanIdeaCard]
}

struct PlanRowParts: Codable, Equatable, Identifiable, Sendable {
    struct Amount: Codable, Equatable, Sendable {
        let text: String
        let tone: String
        let struck: Bool
    }
    let id: String
    /// The row's item (the edits take it), and its signals (its editor's line).
    let item: JSONValue
    let signal: JSONValue?
    let name: String
    let look: CategoryLook
    /// New, Changed, Cancelled or Stopped, with its tone ('positive', 'negative', 'accent').
    let state: PlanFigure?
    let meta: String
    let tag: PlanTag?
    let amount: Amount
    let was: String?
    let cancelled: Bool
    let openLabel: String
    let toggleLabel: String
    /// "Updated since your plan" (rich: <strong>).
    let stale: String?
}

struct PlanGroup: Codable, Equatable, Identifiable, Sendable {
    let key: String
    let title: String
    let total: String
    let rows: [PlanRowParts]
    var id: String { key }
}

struct PlanChanges: Codable, Equatable, Sendable {
    struct Row: Codable, Equatable, Identifiable, Sendable {
        let id: String
        let item: JSONValue
        let name: String
        let look: CategoryLook
        let line: String
        let note: String?
        let perMonth: PlanFigure
        let perYear: String
        let editLabel: String
        /// An added one: "Remove" (else "Undo this change").
        let remove: Bool
        let drop: String
        let dropLabel: String
        /// The real rule it changes (to open in Recurring), nil for an added or derived one.
        let rule: String?
    }
    struct Total: Codable, Equatable, Sendable {
        let label: String
        let perMonth: String
        let perYear: String
        let tone: String
    }
    let title: String
    let rows: [Row]
    let total: Total
    let canApply: Bool
}

/// Everything the page shows (planPageParts).
struct PlanPage: Codable, Equatable, Sendable {
    let empty: Bool
    let saved: Bool
    let header: PlanHeader
    let applied: PlanApplied?
    let reality: PlanReality?
    let ideas: PlanIdeas
    let groups: [PlanGroup]
    let changes: PlanChanges?
    let savingsCategoryId: String?
}

/// A row's editor (editorParts).
struct PlanEditor: Codable, Equatable, Sendable {
    struct Signal: Codable, Equatable, Sendable {
        let tag: PlanTag
        let text: String
    }
    let signal: Signal?
    let note: String?
    let text: String
    let resetText: String
    let currency: String
    let help: String
    let delta: PlanDelta
    /// nil for a derived row (it stays monthly).
    let frequency: PlanFrequency?
    let keep: [CoreChoice]
    let cancelled: Bool
    let canReset: Bool
}

/// "What if I add…" (addFormParts).
struct PlanAddForm: Codable, Equatable, Sendable {
    struct Category: Codable, Equatable, Identifiable, Sendable {
        let id: String
        let label: String
    }
    let kinds: [CoreChoice]
    let placeholder: String
    let categoryLabel: String
    let noCategory: String?
    let categories: [Category]
    let frequency: PlanFrequency
    let ready: Bool
    let delta: PlanDelta
    let submit: String
}

/// An overlap's picker (pickParts).
struct PlanPick: Codable, Equatable, Sendable {
    struct Row: Codable, Equatable, Identifiable, Sendable {
        let id: String
        let name: String
        let look: CategoryLook
        let perYear: String
        let perMonth: String
        let picked: Bool
    }
    struct Summary: Codable, Equatable, Sendable {
        let label: String
        let amount: String
        let tone: String
        let sub: String
    }
    let title: String
    let rows: [Row]
    let summary: Summary
    let add: String
    let picked: [String]
}

/// The Apply sheet (applySheetParts).
struct PlanApply: Codable, Equatable, Sendable {
    struct Row: Codable, Equatable, Identifiable, Sendable {
        let id: String
        let name: String
        let look: CategoryLook
        let line: String
        let amount: PlanFigure
        let on: Bool
    }
    struct After: Codable, Equatable, Sendable {
        let label: String
        let value: String
    }
    let rows: [Row]
    let kept: [PlanLine]
    let after: After
    let submit: String
    let picked: [String]
}

/// "Type a what-if"'s preview (whatIfParts).
struct PlanWhatIf: Codable, Equatable, Sendable {
    struct Row: Codable, Equatable, Identifiable, Sendable {
        let id: String
        let name: String
        let suggested: Bool
        let line: String
        let look: CategoryLook
        let picked: Bool
        let pickLabel: String
        let editLabel: String
    }
    let rows: [Row]
    let ready: Int
    let add: String
    let notFound: String?
}

/// A proposal's editor (whatIfEditorParts).
struct PlanWhatIfEditor: Codable, Equatable, Sendable {
    let add: Bool
    let text: String
    let currency: String
    let cancelled: Bool
    let choice: String
    let choices: [CoreChoice]
    let frequency: PlanFrequency
}

/// What the page works out from its reads: the state (the rows, the
/// figures, the signals, the ideas: kept as the core's JSON for the edits),
/// the derived rows' answers (the reality banner's OK takes them) and the parts.
struct PlanFigures: Sendable {
    let state: JSONValue
    let salary: JSONValue
    let savings: JSONValue
    let savingsIds: JSONValue
    let page: PlanPage

    /// planReads: { income: { from, to }, charges: { from, to }, budgetMonths },
    /// by pay month with the salary setting on (`cal`).
    static func reads(now: Date, cal: JSONValue = .null, core: BudgeerCore) throws -> JSONValue {
        try core.json("planPage", "planReads", [JSONValue.string(try core.isoDate(now)), cal])
    }

    /// The budget months' sets as useBudgetSets reads them: each month with
    /// a budget from the first month's caps on (setPeriods), then its rows.
    static func budgetPeriods(_ periods: JSONValue, reads: JSONValue, core: BudgeerCore) throws -> [String] {
        let months = reads["budgetMonths"]?.arrayValue ?? []
        return try core.call("budgetMath", "setPeriods", [periods, months.first ?? .null, months.last ?? .null])
    }

    /// - rules: my_recurring_plan's rules (my_recurring_rules); plan: the plan as the page keeps it
    /// - categories: every category (archived too); savingsCategories: the savings ones
    /// - income: the income over planReads' span; charges: the expenses over its charges span (spread)
    /// - budgetSets: [{ period, rows }]; rates: today's rate of each foreign currency the plan needs
    /// - view: 'month' or 'year'; undo: my_recurring_plan's `undo`
    static func compute(profile: JSONValue, rules: JSONValue, plan: JSONValue, undo: JSONValue, categories: JSONValue,
                        savingsCategories: JSONValue, income: JSONValue, charges: JSONValue, budgetSets: JSONValue,
                        rates: JSONValue, view: String, now: Date, cal: JSONValue = .null,
                        core: BudgeerCore) throws -> PlanFigures {
        let base = JSONValue.string(profile["base_currency"]?.stringValue ?? "EUR")
        let today = JSONValue.string(try core.isoDate(now))
        let reads = try core.json("planPage", "planReads", [today, cal])
        let savingsIds = try core.json("savings", "savingsIdsOf", [savingsCategories])
        let salaryCategory = try core.json("planMath", "salaryCategoryId", [profile, categories])
        let salary = try core.json("planMath", "derivedSalary", [[
            "rules": rules, "savingsIds": savingsIds, "categoryId": salaryCategory, "entries": income, "todayISO": today,
            "baseCurrency": base, "cal": cal,
        ] as JSONValue])
        let savings = try core.json("planMath", "derivedSavings", [[
            "rules": rules, "savingsIds": savingsIds, "entries": income, "todayISO": today, "baseCurrency": base,
            "cal": cal,
        ] as JSONValue])
        let state = try core.json("planPage", "planState", [[
            "rules": rules, "plan": plan, "savingsIds": savingsIds, "baseCurrency": base, "rates": rates,
            "categories": categories, "salary": salary, "savings": savings, "charges": charges, "budgetSets": budgetSets,
            "budgetMonths": reads["budgetMonths"] ?? [], "separateYearly": .bool(profile["yearly_separate"]?.boolValue ?? false),
            "cal": cal,
        ] as JSONValue])
        let page: PlanPage = try core.call("planPage", "planPageParts", [state, [
            "view": .string(view), "currency": base, "undo": undo, "categories": categories, "now": try JSONValue.from(JSDate(now)),
        ] as JSONValue])
        return PlanFigures(state: state, salary: salary, savings: savings, savingsIds: savingsIds, page: page)
    }

    /// The Apply sheet with `off` unticked.
    func apply(off: [String], currency: String, now: Date, core: BudgeerCore) throws -> PlanApply {
        try core.call("planPage", "applySheetParts", [state["sum"] ?? .null, JSONValue.string(currency),
                                                      JSONValue.array(off.map { .string($0) }), JSDate(now)])
    }

    /// A row's item by id (the rows and the changes are the same items).
    func item(_ id: String) -> JSONValue? {
        state["items"]?.arrayValue?.first { $0["id"]?.stringValue == id }
    }

    /// The row's signals ({ priceUp?, overlap?, overBudget? }), nil without any.
    func signal(_ id: String) -> JSONValue? {
        page.groups.lazy.flatMap(\.rows).first { $0.id == id }?.signal
    }
}
