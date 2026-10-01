// The redesign mockups' sample data: one made-up person (Sam), three months,
// four budgets, the coming payments, a week of entries and a trip group.
// The amounts and names are invented; every figure and label shown is worded
// by the core as the live screens do (currency.formatMoney / formatSigned,
// dates.monthTitle / shortDate, budgetMath, categoryName, categoryStyle,
// avatarLook, groupFormat), in the core's active language. Not wired to any
// data yet: the owner signs the look off first.
import Foundation
import SwiftUI
import BudgeerCore

struct NativeSample {
    struct Month: Identifiable, Equatable {
        let id: String
        let title: String
        let current: Bool
        let spent: Int
        let income: Int
        let net: Int
        let spentText: String
        let incomeText: String
        let netText: String
        /// Whether every budget held that month.
        let allHeld: Bool
    }

    struct Budget: Identifiable {
        let id: String
        let name: String
        let look: CategoryLook
        /// "€312.40 of €400.00".
        let meta: String
        let percent: Int
        /// budgetTone: nil, 'warning' or 'negative'.
        let tone: String?
        /// "€87.60 left" or "€12.30 over".
        let note: String
    }

    struct Upcoming: Identifiable {
        let id: String
        let name: String
        let look: CategoryLook
        let when: String
        let amount: String
    }

    struct Share: Identifiable {
        let id: String
        let name: String
        let look: CategoryLook
        let color: Color
        let amount: String
        let percent: Int
    }

    struct Entry: Identifiable {
        let id: String
        let name: String
        let detail: String
        let look: CategoryLook
        let amount: String
        let income: Bool
        let repeats: Bool
        let group: String?
    }

    struct Day: Identifiable {
        let id: String
        let title: String
        let total: String
        let entries: [Entry]
    }

    struct Chip: Identifiable {
        let id: String
        let name: String
        let look: CategoryLook
    }

    enum Moment: Identifiable {
        case day(id: String, title: String)
        case expense(id: String, title: String, mine: Bool, author: Avatar, paidBy: String, amount: String,
                     share: String?, look: CategoryLook)
        case settlement(id: String, label: String, amount: String)
        case comment(id: String, author: Avatar, text: String, mine: Bool)

        var id: String {
            switch self {
            case .day(let id, _), .settlement(let id, _, _): return id
            case .expense(let id, _, _, _, _, _, _, _), .comment(let id, _, _, _): return id
            }
        }
    }

    struct Trip {
        let name: String
        let members: [Avatar]
        let membersLabel: String
        let balanceLabel: String
        let balance: String
        let balanceMinor: Int
        let settledLabel: String
        let timeline: [Moment]
        let owers: [(name: String, amount: String)]
    }

    let lang: String
    let me: Avatar
    let name: String
    let email: String
    let months: [Month]
    let budgets: [Budget]
    let upcoming: [Upcoming]
    let shares: [Share]
    let voucherBalance: String
    let voucherNext: String
    let voucherTopUp: String
    let days: [Day]
    let chips: [Chip]
    let trip: Trip
    let addAmount: String
    let addAmountMinor: Int
    let leftOver: String
    let leftOverFraction: Double
    let languageName: String

    var current: Month { months.last! }

    // MARK: Building it

    /// The sample in the core's active language, as of 29 September 2026.
    static func make(core: BudgeerCore = .shared, lang: String) -> NativeSample {
        let f = Figures(core: core, now: day(2026, 9, 29))
        let pick = { (en: String, el: String) in lang == "el" ? el : en }

        // Categories (the default ones carry their key, so they show in the app's language).
        let cat: [String: JSONValue] = [
            "groceries": ["name": "Groceries", "default_key": "groceries", "icon": "groceries", "color": "green"],
            "food": ["name": "Food & Dining", "default_key": "food", "icon": "utensils", "color": "coral"],
            "transport": ["name": "Transport", "default_key": "transport", "icon": "transport", "color": "blue"],
            "fun": ["name": "Entertainment", "default_key": "entertainment", "icon": "entertainment", "color": "purple"],
            "housing": ["name": "Housing", "default_key": "housing", "icon": "housing", "color": "amber"],
            "utilities": ["name": "Utilities", "default_key": "utilities", "icon": "utilities", "color": "teal"],
            "shopping": ["name": "Shopping", "default_key": "shopping", "icon": "shopping", "color": "pink"],
            "salary": ["name": "Salary", "default_key": "salary", "icon": "salary", "color": "green"],
            "coffee": ["name": .string(pick("Coffee", "Καφές")), "icon": "coffee", "color": "amber"],
            "phone": ["name": .string(pick("Phone", "Κινητό")), "icon": "phone", "color": "slate"],
            "fitness": ["name": .string(pick("Gym", "Γυμναστήριο")), "icon": "fitness", "color": "teal"],
        ]
        let look = { (key: String) in f.look(cat[key]!, kind: key == "salary" ? "income" : "expense") }
        let nameOf = { (key: String) in f.categoryName(cat[key]!) }

        // Three months; September is this one.
        let monthData: [(Int, Int, Int, Bool)] = [(7, 214_530, 352_000, false), (8, 198_775, 352_000, true),
                                                 (9, 162_840, 352_000, false)]
        let months = monthData.map { month, spent, income, held in
            Month(id: "2026-\(month)", title: f.monthTitle(day(2026, month, 1)), current: month == 9,
                  spent: spent, income: income, net: income - spent,
                  spentText: f.money(spent), incomeText: f.money(income),
                  netText: f.signed(income - spent, plus: true), allHeld: held)
        }

        // Budgets: one comfortable, one close, one over, one barely touched.
        let budgetData: [(String, Int, Int)] = [("groceries", 31_240, 40_000), ("food", 18_760, 20_000),
                                                ("fun", 6_230, 5_000), ("transport", 4_210, 12_000)]
        let budgets = budgetData.map { key, spent, limit in
            let tone = f.budgetTone(spent, limit)
            let note = spent > limit
                ? f.text("ios:native.home.over", ["amount": .string(f.money(spent - limit))])
                : f.text("ios:native.home.left", ["amount": .string(f.money(limit - spent))])
            return Budget(id: key, name: nameOf(key), look: look(key),
                          meta: f.text("budgets:progress", ["spent": .string(f.money(spent)), "limit": .string(f.money(limit))]),
                          percent: f.budgetPercent(spent, limit), tone: tone, note: note)
        }

        // Coming up: tomorrow, in two days, then dates.
        let upcoming = [
            Upcoming(id: "u1", name: "Spotify", look: look("fun"), when: f.text("ios:native.home.tomorrow"),
                     amount: f.money(1_199)),
            Upcoming(id: "u2", name: pick("Rent", "Ενοίκιο"), look: look("housing"),
                     when: f.text("ios:native.home.inDays", ["count": 2]), amount: f.money(95_000)),
            Upcoming(id: "u3", name: pick("Phone", "Κινητό"), look: look("phone"),
                     when: f.shortDate("2026-10-03"), amount: f.money(2_500)),
            Upcoming(id: "u4", name: pick("Gym", "Γυμναστήριο"), look: look("fitness"),
                     when: f.shortDate("2026-10-05"), amount: f.money(3_900)),
        ]

        // This month by category (the shares of what was spent).
        let shareData: [(String, Int)] = [("housing", 95_000), ("groceries", 31_240), ("food", 18_760),
                                          ("shopping", 7_400), ("fun", 6_230), ("transport", 4_210)]
        let spentTotal = shareData.reduce(0) { $0 + $1.1 }
        let shares = shareData.map { key, amount in
            let categoryLook = look(key)
            return Share(id: key, name: nameOf(key), look: categoryLook,
                         color: categoryLook.tint.flatMap { Color(hexString: $0.fg) } ?? NativeStyle.tint,
                         amount: f.money(amount), percent: f.budgetPercent(amount, spentTotal))
        }

        // A week of entries, newest first.
        func entry(_ id: String, _ name: String, _ key: String, _ minor: Int, repeats: Bool = false,
                   group: String? = nil) -> Entry {
            let income = key == "salary"
            return Entry(id: id, name: name, detail: nameOf(key), look: look(key),
                         amount: f.signed(income ? minor : -minor, plus: income), income: income,
                         repeats: repeats, group: group)
        }
        let trip = pick("Lisbon trip", "Ταξίδι στη Λισαβόνα")
        let dayData: [(String, String, [Entry])] = [
            ("2026-09-29", f.text("ios:native.add.today"), [
                entry("e1", "Café Kaldi", "coffee", 340),
                entry("e2", "Lidl", "groceries", 4_215),
            ]),
            ("2026-09-28", f.text("ios:native.add.yesterday"), [
                entry("e3", pick("Dinner at Sora", "Δείπνο στο Sora"), "food", 6_400, group: trip),
                entry("e4", "Uber", "transport", 1_480),
            ]),
            ("2026-09-26", f.shortDate("2026-09-26"), [
                entry("e5", pick("September salary", "Μισθός Σεπτεμβρίου"), "salary", 352_000, repeats: true),
                entry("e6", "Netflix", "fun", 1_399, repeats: true),
            ]),
            ("2026-09-25", f.shortDate("2026-09-25"), [
                entry("e7", "Zara", "shopping", 7_400),
                entry("e8", pick("Electricity", "Ρεύμα"), "utilities", 8_620, repeats: true),
            ]),
        ]
        let spentPerDay: [String: Int] = ["2026-09-29": 4_555, "2026-09-28": 7_880, "2026-09-26": 1_399, "2026-09-25": 16_020]
        let days = dayData.map { id, title, entries in
            Day(id: id, title: title,
                total: f.text("ios:native.activity.dayTotal", ["amount": .string(f.money(spentPerDay[id] ?? 0))]),
                entries: entries)
        }

        let chips = ["groceries", "food", "coffee", "transport", "fun", "shopping", "housing"].map {
            Chip(id: $0, name: nameOf($0), look: look($0))
        }

        // The trip: four people, you're owed.
        let sam = "Sam Morgan"
        let members: JSONValue = [
            ["id": "m1", "display_name": .string(sam)], ["id": "m2", "display_name": "Alex Rivera"],
            ["id": "m3", "display_name": "Maria Kosta"], ["id": "m4", "display_name": "Nikos Papas"],
        ]
        let me = f.avatar(sam, highlight: true)
        let alex = f.avatar("Alex Rivera")
        let maria = f.avatar("Maria Kosta")
        let nikos = f.avatar("Nikos Papas")
        let paidBy = { (payer: String) in f.paidBy(members, payer) }
        let share = { (minor: Int) in f.text("ios:native.group.yourShare", ["amount": .string(f.money(minor))]) }
        let timeline: [Moment] = [
            .day(id: "d1", title: f.shortDate("2026-09-12")),
            .expense(id: "x1", title: "Airbnb Alfama", mine: true, author: me, paidBy: paidBy("m1"),
                     amount: f.money(48_000), share: share(12_000), look: look("housing")),
            .comment(id: "c1", author: alex, text: pick("Booked! The terrace looks amazing 🌅",
                                                       "Κλείστηκε! Η ταράτσα είναι τέλεια 🌅"), mine: false),
            .day(id: "d2", title: f.shortDate("2026-09-13")),
            .expense(id: "x2", title: pick("Taxi from the airport", "Ταξί από το αεροδρόμιο"), mine: false, author: alex,
                     paidBy: paidBy("m2"), amount: f.money(3_800), share: share(950), look: look("transport")),
            .expense(id: "x3", title: pick("Dinner at Sora", "Δείπνο στο Sora"), mine: false, author: maria,
                     paidBy: paidBy("m3"), amount: f.money(12_800), share: share(3_200), look: look("food")),
            .day(id: "d3", title: f.shortDate("2026-09-15")),
            .settlement(id: "s1", label: f.settlementLabel(members, from: "m4", to: "m1"), amount: f.money(8_000)),
            .comment(id: "c2", author: maria, text: pick("Sending my part tonight 🙏", "Στέλνω το μερίδιό μου απόψε 🙏"),
                     mine: false),
            .expense(id: "x4", title: pick("Museum tickets", "Εισιτήρια μουσείου"), mine: true, author: me,
                     paidBy: paidBy("m1"), amount: f.money(6_400), share: share(1_600), look: look("fun")),
            .comment(id: "c3", author: me, text: pick("Thanks all, great trip!", "Ευχαριστώ όλους, τέλειο ταξίδι!"),
                     mine: true),
        ]
        let tripSample = Trip(
            name: trip, members: [me, alex, maria, nikos],
            membersLabel: f.text("ios:native.group.members", ["count": 4]),
            balanceLabel: f.text("groups:format.balance.owed"), balance: f.money(16_275), balanceMinor: 16_275,
            settledLabel: f.text("groups:format.balance.settled"), timeline: timeline,
            owers: [(f.text("groups:format.owesYou", ["name": "Maria Kosta"]), f.money(9_680)),
                    (f.text("groups:format.owesYou", ["name": "Alex Rivera"]), f.money(6_595))])

        let current = months.last!
        return NativeSample(
            lang: lang, me: me, name: sam, email: "sam@example.com",
            months: months, budgets: budgets, upcoming: upcoming, shares: shares,
            voucherBalance: f.money(8_640), voucherNext: f.text("ios:native.home.nextTopUp", ["date": .string(f.shortDate("2026-10-01"))]),
            voucherTopUp: f.signed(17_600, plus: true),
            days: days, chips: chips, trip: tripSample,
            addAmount: f.money(1_250), addAmountMinor: 1_250,
            leftOver: f.money(current.net), leftOverFraction: Double(current.net) / Double(current.income),
            languageName: AppLanguage.nativeNames[lang] ?? "English")
    }

    /// A local calendar day at noon.
    static func day(_ year: Int, _ month: Int, _ day: Int) -> Date {
        Calendar(identifier: .gregorian).date(from: DateComponents(year: year, month: month, day: day, hour: 12)) ?? Date()
    }

    /// The core calls the sample is worded with.
    struct Figures {
        let core: BudgeerCore
        let now: Date

        func money(_ minor: Int) -> String {
            (try? core.call("currency", "formatMoney", [minor, "EUR"])) ?? ""
        }

        func signed(_ minor: Int, plus: Bool) -> String {
            let options: JSONValue = ["plus": .bool(plus)]
            return (try? core.call("currency", "formatSigned", [minor, "EUR", options])) ?? ""
        }

        func monthTitle(_ date: Date) -> String {
            (try? core.call("dates", "monthTitle", [JSDate(date)])) ?? ""
        }

        func shortDate(_ iso: String) -> String {
            (try? core.call("dates", "shortDate", [iso, JSDate(now)])) ?? iso
        }

        func budgetPercent(_ spent: Int, _ limit: Int) -> Int {
            (try? core.call("budgetMath", "budgetPercent", [spent, limit])) ?? 0
        }

        func budgetTone(_ spent: Int, _ limit: Int) -> String? {
            (try? core.json("budgetMath", "budgetTone", [spent, limit]))?.stringValue
        }

        func look(_ category: JSONValue, kind: String) -> CategoryLook {
            (try? CategoryLook.of(category, kind: kind, core: core)) ?? CategoryLook(key: "other", tone: "accent", tint: nil)
        }

        func categoryName(_ category: JSONValue) -> String {
            (try? core.call("categoryName", "categoryDisplayName", [category])) ?? ""
        }

        func avatar(_ name: String, highlight: Bool = false) -> Avatar {
            let options: JSONValue = ["highlight": .bool(highlight)]
            return (try? core.call("avatarLook", "avatarLook", [name, options]))
                ?? Avatar(id: nil, name: name, src: nil, highlight: highlight, initials: "", bg: nil, fg: "light")
        }

        func paidBy(_ members: JSONValue, _ payer: String) -> String {
            (try? core.call("groupFormat", "paidByLabel", [members, payer, "m1"])) ?? ""
        }

        func settlementLabel(_ members: JSONValue, from: String, to: String) -> String {
            let settlement: JSONValue = ["from_member": .string(from), "to_member": .string(to)]
            return (try? core.call("groupFormat", "settlementLabel", [settlement, members, "m1"])) ?? ""
        }

        func text(_ key: String, _ vars: JSONValue = [:]) -> String {
            core.text(key, vars)
        }
    }
}
