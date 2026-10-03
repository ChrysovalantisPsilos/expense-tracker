// Home's figures, every one from the core: the web's Dashboard.jsx steps
// (the period, salaryShiftOf, savingsIdsOf, spendRows, periodTotals,
// periodProjection over the recurring rules at today's rates, groupFlow,
// projectedTotals, categoryBars (all of them, and the donut's top four), bucketLabels, formatMoney, formatSigned,
// signTone, savingsLine, barLines, visibleBars, homeLists, listHeading,
// rowParts.listParts, isFirstRun, homeCards) and its Recurring card's (SubscriptionsCard:
// showsUpcoming, subscriptionGroups or chargedGroups, and each group's and
// row's words), called one by one through BudgeerCore, each answer carried
// to the next as the JSON it came as. Nothing is added, summed, rounded or
// worded here. The same sequence, run in Node, writes the parity fixture
// (mobile-core/homeFigures.mjs); HomeParityTests must get its figures here.
import Foundation
import BudgeerCore

/// What the reads give: the rows as my_transactions returns them, the
/// profile columns, the savings categories, the recurring rules and today's
/// rates for their foreign currencies, the group money moves (my_group_flow,
/// for the Net), the instant "now" and the period picked ('m:2026-9', …; nil
/// for this month).
struct HomeInput: Equatable, Sendable {
    let rows: JSONValue
    let profile: JSONValue
    let categories: JSONValue
    var rules: JSONValue = []
    var rates: JSONValue = [:]
    var groupMoves: JSONValue = []
    let now: Date
    var periodValue: String?
    /// The first transaction's date (nil: none at all), and whether it could be read.
    var oldest: String? = nil
    var oldestKnown = true
}

struct HomePeriod: Codable, Equatable, Sendable {
    let value: String
    let from: String?
    let to: String?
    let label: String
}

struct HomeBar: Codable, Equatable, Sendable {
    let name: String
    /// The name on screen (a default category in the app's language, a group's name).
    let label: String
    let value: Double
    /// Integer share of the spending, the shares summing to 100.
    let share: Int
    /// The bar's length relative to the largest, 0…1.
    let ratio: Double
    let amount: String
    /// The line under the name (categoryLine: the amount, and what its groups add).
    let meta: String
    /// A group's share of an expense (the people badge) rather than a category.
    let group: Bool
    /// The category's badge (categoryStyle.categoryLook).
    let look: CategoryLook
    /// Where the bar drills down to (categoryLinks.linkBuckets: its category's
    /// page for the period, or its group's), and that link's spoken name.
    let to: String?
    let linkLabel: String?
}

/// The overview's ⓘ, part one (netSum): How Net adds up.
struct NetSum: Codable, Equatable, Sendable {
    struct Step: Codable, Equatable, Sendable {
        let key: String
        let label: String
        let value: String
    }
    struct Total: Codable, Equatable, Sendable {
        let label: String
        let value: String
        let tone: String
    }
    let title: String
    let steps: [Step]
    let total: Total
}

/// The categories card's "Show all" (visibleBars): how many rows show
/// folded, how many more "Show all" adds, and the button's two words.
struct BarFold: Codable, Equatable, Sendable {
    let top: Int
    let hidden: Int
    let showAll: String
    let showTop: String
}

/// Home's Expenses or Income card: its heading, its empty line, and every
/// row's words (rowParts.listParts), shown ten at a time.
struct HomeList: Codable, Equatable, Sendable {
    let title: String
    let subtitle: String
    let empty: String
    let rows: [EntryRow]
}

/// A charge on the Recurring card (nextChargeParts, chargeParts).
struct ChargeRow: Codable, Equatable, Identifiable, Sendable {
    let id: String
    let title: String
    let look: CategoryLook
    /// "20 Sep · every month".
    let meta: String
    let amount: String
    let hint: String?
}

struct CardToggle: Codable, Equatable, Sendable {
    let showAll: String
    let showNext: String
}

/// One frequency on the Recurring card.
struct CardGroup: Codable, Equatable, Identifiable, Sendable {
    let key: String
    let label: String
    let headline: RuleTotal
    let note: String?
    /// "Next charges", or "3 charges" for a past period.
    let section: String
    /// The next few charges (or a past period's charges)…
    let rows: [ChargeRow]
    /// …and all of them ("Show all").
    let all: [ChargeRow]
    let toggle: CardToggle?
    var id: String { key }
}

/// Home's Recurring card: today's rules (this month, next month) or what a
/// past period was charged.
struct RecurringCard: Codable, Equatable, Sendable {
    let upcoming: Bool
    let subtitle: String?
    let empty: String
    let groups: [CardGroup]
}

struct HomeFigures: Codable, Equatable, Sendable {
    let period: HomePeriod
    /// Where the rows were fetched from (before the period with a salary shift; nil for all time).
    let fetchFrom: String?
    let spentTotal: Double
    let earnedTotal: Double
    let netTotal: Double
    let spent: String
    let income: String
    let net: String
    /// 'positive', 'negative' or 'muted' (kitMath.signTone).
    let netTone: String
    /// The savings line under the overview, when there is one.
    let saved: String?
    /// The overview's ⓘ: How Net adds up, and the still-to-come notes (overviewNotes).
    let sum: NetSum
    let notes: [String]
    let bars: [HomeBar]
    /// The donut's legend: the four biggest, then the rest as "Other" (categoryBars at legendTop).
    let legend: [HomeBar]
    let fold: BarFold
    /// The cards in reading order (dashboardMath.homeCards: the first run's or the usual).
    let cards: [String]
    let expenseList: HomeList
    let incomeList: HomeList
    let recurring: RecurringCard

    // categoryBars' `top`: the web passes Infinity (Home folds nothing);
    // JSON can't carry it, so a number no list reaches (homeFigures.mjs NO_FOLD).
    static let noFold = 1_000_000
    /// The donut's legend keeps the four biggest (homeFigures.mjs LEGEND_TOP).
    static let legendTop = 4

    /// The period a picker value names (this month for nil or an unknown one).
    static func period(_ value: String?, now: Date, core: BudgeerCore) throws -> JSONValue {
        if let value, let named = try? core.json("periods", "periodFromValue", [value, JSDate(now)]), !named.isNull {
            return named
        }
        return try core.json("periods", "thisMonthPeriod", [JSDate(now)])
    }

    /// The period and where to fetch its rows from, given the profile (a
    /// shifted salary is read from late in the month before).
    static func window(profile: JSONValue, periodValue: String? = nil, now: Date,
                       core: BudgeerCore) throws -> (period: HomePeriod, fetchFrom: String?) {
        let period = try period(periodValue, now: now, core: core)
        let salaryShift: JSONValue = try core.call("salaryShift", "salaryShiftOf", [profile])
        let from = period["from"] ?? .null
        let fetchFrom: JSONValue = try core.call("salaryShift", "shiftFetchFrom", [from, salaryShift])
        return (try period.decode(), fetchFrom.stringValue ?? from.stringValue)
    }

    /// `legendTop`: how many the legend keeps before "Other" (the widgets keep three).
    static func compute(_ input: HomeInput, legendTop: Int = HomeFigures.legendTop, core: BudgeerCore) throws -> HomeFigures {
        let period = try period(input.periodValue, now: input.now, core: core)
        let from = period["from"] ?? .null
        let to = period["to"] ?? .null
        let baseCurrency = input.profile["base_currency"]?.stringValue ?? "EUR"
        let separateYearly = input.profile["yearly_separate"]?.boolValue ?? false
        let salaryShift: JSONValue = try core.call("salaryShift", "salaryShiftOf", [input.profile])
        let savingsIds: JSONValue = try core.call("savings", "savingsIdsOf", [input.categories])
        let options: JSONValue = .object(["separateYearly": .bool(separateYearly), "salaryShift": salaryShift])
        let spend: JSONValue = try core.call("spread", "spendRows", [input.rows, baseCurrency, from, to, options])
        let totals: JSONValue = try core.call("dashboardMath", "periodTotals", [spend, baseCurrency, savingsIds])
        let todayISO = try core.isoDate(input.now)
        let range: JSONValue = .object(["from": from, "to": to])
        // Foreign rules count at today's rate (rulesInBase), one without a rate left out.
        let inBase = try core.json("ruleFx", "rulesInBase", [input.rules, baseCurrency, input.rates])
        let proj: JSONValue = try core.call("dashboardMath", "periodProjection",
                                            [inBase["rules"] ?? [], range, todayISO, separateYearly, salaryShift, savingsIds])
        // The money groups really moved in the period (groupFlow), which the Net counts.
        let flow: JSONValue = try core.call("dashboardMath", "groupFlow", [input.groupMoves, baseCurrency, range])
        let figures: JSONValue = try core.call("dashboardMath", "projectedTotals", [totals, proj, flow])
        // bucketRow is a Map (tagged {"$":"map","v":[[key, row], …]}); its rows
        // label the bars and give each its badge.
        let bucketPairs = JSONValue.mapPairs(totals["bucketRow"])
        let bucketRows = bucketPairs.map(\.value)
        let labels: JSONValue = try core.call("txnRollup", "bucketLabels", [JSONValue.array(bucketRows)])
        let byCategory = totals["byCategory"] ?? JSONValue.array([])
        let shape = { (ranked: [JSONValue]) throws -> [HomeBar] in
            let lines: [String] = try core.call("dashboardMath", "barLines", [JSONValue.array(ranked), spend, baseCurrency])
            let linked = try core.json("categoryLinks", "linkBuckets", [JSONValue.array(ranked), spend, period]).arrayValue ?? []
            return try ranked.enumerated().map { index, c -> HomeBar in
                let name = c["name"]?.stringValue ?? ""
                let row = bucketPairs.first { $0.key.stringValue == name }?.value
                let value = c["value"]?.doubleValue ?? 0
                let label: String = try core.call("txnRollup", "bucketLabel", [c, labels])
                let amount: String = try core.call("currency", "formatMoney", [value, baseCurrency])
                return HomeBar(name: name, label: label, value: value,
                               share: c["share"]?.intValue ?? 0, ratio: c["ratio"]?.doubleValue ?? 0, amount: amount,
                               meta: index < lines.count ? lines[index] : amount,
                               group: row?["group_expense_id"]?.stringValue != nil,
                               look: try CategoryLook.of(row?["categories"], core: core),
                               to: index < linked.count ? linked[index]["to"]?.stringValue : nil,
                               linkLabel: index < linked.count ? linked[index]["linkLabel"]?.stringValue : nil)
            }
        }
        let ranked: [JSONValue] = try core.call("breakdown", "categoryBars", [byCategory, noFold])
        let bars = try shape(ranked)
        let legend = try shape(try core.call("breakdown", "categoryBars", [byCategory, legendTop]))
        let spentTotal = figures["spentTotal"]?.doubleValue ?? 0
        let earnedTotal = figures["earnedTotal"]?.doubleValue ?? 0
        let netTotal = figures["netTotal"]?.doubleValue ?? 0
        let fetchFrom: JSONValue = try core.call("salaryShift", "shiftFetchFrom", [from, salaryShift])
        let saved: JSONValue = try core.call("dashboardMath", "savingsLine",
                                             [totals["saved"] ?? JSONValue.int(0), figures["fromSavingsTotal"] ?? JSONValue.int(0), period, baseCurrency])
        // "Show all": the rows shown folded and the button's words.
        let folded = try core.json("dashboardMath", "visibleBars", [JSONValue.array(ranked), false])
        let top = folded["rows"]?.arrayValue?.count ?? 0
        let fold = BarFold(top: top, hidden: folded["hidden"]?.intValue ?? 0,
                           showAll: core.text("dashboard:categories.showAll", ["n": .int(ranked.count)]),
                           showTop: core.text("dashboard:categories.showTop", ["n": .int(top)]))
        // The Expenses and Income cards (homeLists), and which cards show.
        let lists = try core.json("dashboardMath", "homeLists", [input.rows, [
            "from": from, "to": to, "savingsIds": savingsIds, "salaryShift": salaryShift,
        ] as JSONValue])
        let periodLabel = period["label"]?.stringValue ?? ""
        let list = { (kind: String) throws -> HomeList in
            try homeList(kind, lists[kind == "income" ? "income" : "expenses"] ?? [], periodLabel: periodLabel,
                         baseCurrency: baseCurrency, salaryShift: salaryShift, savingsIds: savingsIds, core: core)
        }
        var run: JSONValue = ["loading": false, "failed": false, "count": .int(input.rows.arrayValue?.count ?? 0)]
        if input.oldestKnown { run = run.with("oldest", input.oldest.json) }
        let firstRun: Bool = try core.call("listHeading", "isFirstRun", [run])
        let cards: [String] = try core.call("dashboardMath", "homeCards", [["firstRun": .bool(firstRun)] as JSONValue])
        let card = try recurringCard(rules: input.rules, rows: input.rows, period: period, todayISO: todayISO,
                                     baseCurrency: baseCurrency, rates: input.rates, separateYearly: separateYearly, core: core)
        return HomeFigures(
            period: try period.decode(),
            fetchFrom: fetchFrom.stringValue ?? from.stringValue,
            spentTotal: spentTotal,
            earnedTotal: earnedTotal,
            netTotal: netTotal,
            spent: try core.call("currency", "formatMoney", [spentTotal, baseCurrency]),
            income: try core.call("currency", "formatMoney", [earnedTotal, baseCurrency]),
            net: try core.call("currency", "formatSigned", [netTotal, baseCurrency, JSONValue.object(["plus": .bool(true)])]),
            netTone: try core.call("kitMath", "signTone", [netTotal]),
            saved: saved.stringValue,
            sum: try core.call("dashboardMath", "netSum", [figures, baseCurrency]),
            notes: try core.call("dashboardMath", "overviewNotes", [["proj": proj] as JSONValue, baseCurrency]),
            bars: bars,
            legend: legend,
            fold: fold,
            cards: cards,
            expenseList: try list("expense"),
            incomeList: try list("income"),
            recurring: card)
    }

    /// One list card (homeFigures.mjs homeList): listHeading over the period
    /// and the count, the empty line, and every row's words.
    static func homeList(_ kind: String, _ items: JSONValue, periodLabel: String, baseCurrency: String,
                         salaryShift: JSONValue, savingsIds: JSONValue, core: BudgeerCore) throws -> HomeList {
        let head = try core.json("listHeading", "listHeading", [[
            "kind": .string(kind), "periodLabel": .string(periodLabel), "count": .int(items.arrayValue?.count ?? 0),
        ] as JSONValue])
        let options: JSONValue = ["kind": .string(kind), "baseCurrency": .string(baseCurrency), "salaryShift": salaryShift,
                                  "savingsIds": savingsIds]
        let rows: [EntryRow] = try core.call("rowParts", "listParts", [items, options])
        return HomeList(title: head["title"]?.stringValue ?? "", subtitle: head["subtitle"]?.stringValue ?? "",
                        empty: core.text(kind == "income" ? "dashboard:noIncome" : "dashboard:noExpenses"), rows: rows)
    }

    /// SubscriptionsCard: today's rules by frequency, or a past period's charges.
    static func recurringCard(rules: JSONValue, rows: JSONValue, period: JSONValue, todayISO: String, baseCurrency: String,
                              rates: JSONValue, separateYearly: Bool, core: BudgeerCore) throws -> RecurringCard {
        let upcoming: Bool = try core.call("recurringMath", "showsUpcoming", [period, todayISO])
        if upcoming {
            let groups = try core.json("recurringMath", "subscriptionGroups",
                                       [rules, baseCurrency, ["upcomingOnly": true, "rates": rates] as JSONValue])
            let shaped = try (groups.arrayValue ?? []).map { g -> CardGroup in
                let next = { (list: JSONValue?) throws -> [ChargeRow] in
                    try (list?.arrayValue ?? []).map { try core.call("recurringMath", "nextChargeParts", [$0, baseCurrency, rates]) }
                }
                let toggle = try core.json("recurringMath", "upcomingToggle", [g])
                return CardGroup(key: g["key"]?.stringValue ?? "", label: g["label"]?.stringValue ?? "",
                                 headline: try core.call("recurringMath", "groupTotalParts", [g, baseCurrency]),
                                 note: try core.json("recurringMath", "groupNote", [g["key"] ?? .null, separateYearly]).stringValue,
                                 section: core.text("recurring:card.nextCharges"),
                                 rows: try next(g["next"]), all: try next(g["live"]),
                                 toggle: toggle.isNull ? nil : try toggle.decode())
            }
            return RecurringCard(upcoming: true, subtitle: nil, empty: core.text("recurring:card.empty"), groups: shaped)
        }
        let wording = try core.json("recurringMath", "chargedWording", [period])
        let paid = try core.json("spread", "paidInWindow", [rows, period["from"] ?? .null, period["to"] ?? .null])
        let groups = try core.json("recurringMath", "chargedGroups", [paid, baseCurrency])
        let shaped = try (groups.arrayValue ?? []).map { g -> CardGroup in
            let charges = g["charges"]?.arrayValue ?? []
            let rows: [ChargeRow] = try charges.map { try core.call("recurringMath", "chargeParts", [$0]) }
            return CardGroup(key: g["key"]?.stringValue ?? "", label: g["label"]?.stringValue ?? "",
                             headline: try core.call("recurringMath", "chargedHeadline", [g, baseCurrency]),
                             note: try core.json("recurringMath", "groupNote", [g["key"] ?? .null, separateYearly]).stringValue,
                             section: core.text("recurring:card.charges", ["count": .int(charges.count)]),
                             rows: rows, all: rows, toggle: nil)
        }
        return RecurringCard(upcoming: false, subtitle: wording["subtitle"]?.stringValue,
                             empty: wording["empty"]?.stringValue ?? "", groups: shaped)
    }
}
