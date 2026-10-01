// The Groups screens as the web works them out, every step a core call (in
// Node the same sequence writes the parity fixture:
// mobile-core/groupFigures.mjs): the groups list's cards and invites
// (groupCardParts, inviteRowParts), a group's page (groupViewer, the total,
// balancesParts, the history's rows, memberRowParts, the share text, the
// delete check), the expense form (groupExpenseForm.js) and settle up
// (settleForm.js). Nothing is summed, split, sorted or worded here: Swift
// decodes what the core answers.
import Foundation
import BudgeerCore

// MARK: The pieces

/// An avatar circle (avatarLook): the photo, or the initials on the name's
/// colour ("#rrggbb"; nil for the viewer, who is drawn in the accent).
struct Avatar: Codable, Equatable, Sendable {
    /// The member's (or the comment's) id, when it has one.
    let id: String?
    let name: String
    let src: String?
    let highlight: Bool
    let initials: String
    let bg: String?
    /// 'light' or 'dark' text.
    let fg: String
}

/// avatarStackParts: four at most, then "+N".
struct AvatarStackParts: Codable, Equatable, Sendable {
    let shown: [Avatar]
    let overflow: Int
}

/// A worded amount and its tone (kitMath.signedAmount and friends).
struct SignedText: Codable, Equatable, Sendable {
    let text: String
    let tone: String
}

/// A toast's words ({ title, description? }).
struct ToastText: Codable, Equatable, Sendable {
    let title: String
    let description: String?
}

// MARK: The groups list

struct GroupCard: Codable, Equatable, Identifiable, Sendable {
    struct Balance: Codable, Equatable, Sendable {
        let label: String
        let amount: String?
        let tone: String
    }
    let id: String
    let name: String
    let imageUrl: String?
    /// "4 members".
    let members: String
    /// The cover's letters and colour when there's no photo ("F3").
    let initials: String
    let colour: CoverColour
    let currency: String
    let avatars: AvatarStackParts?
    let balance: Balance?
}

struct InviteRow: Codable, Equatable, Identifiable, Sendable {
    let id: String
    let groupId: String?
    let name: String
    /// "Marco invited you".
    let text: String
}

struct GroupsListFigures: Codable, Equatable, Sendable {
    let cards: [GroupCard]
    let invites: [InviteRow]

    /// - groups: listGroups' rows; summaries: each group's { members, avatars, balances } as read
    /// - invites: list_my_group_invites' rows
    static func compute(groups: JSONValue, summaries: [String: JSONValue], invites: JSONValue, userId: String,
                        core: BudgeerCore) throws -> GroupsListFigures {
        let cards = try (groups.arrayValue ?? []).map { group -> GroupCard in
            var summary: JSONValue = .null
            if let id = group["id"]?.stringValue, let raw = summaries[id] {
                summary = [
                    "members": try core.json("groupFormat", "membersWithAvatars", [raw["members"] ?? [], raw["avatars"] ?? []]),
                    "balances": try core.json("groupFormat", "balancesFrom", [raw["balances"] ?? []]),
                ]
            }
            return try core.call("groupFormat", "groupCardParts", [group, summary, JSONValue.string(userId)])
        }
        let rows = try (invites.arrayValue ?? []).map { invite -> InviteRow in
            try core.call("groupFormat", "inviteRowParts", [invite])
        }
        return GroupsListFigures(cards: cards, invites: rows)
    }
}

// MARK: A group's page

struct BalanceTileParts: Codable, Equatable, Identifiable, Sendable {
    let id: String
    let label: String
    let text: String
    let tone: String
    let avatar: Avatar
    /// The balance's size next to the biggest one in the group (0…1).
    let bar: Double
}

struct PlanRow: Codable, Equatable, Identifiable, Sendable {
    let key: String
    let amount: String
    let tone: String
    let from: Avatar
    let to: Avatar
    var id: String { key }
}

/// balancesParts: your balance, everyone's, the line that matters most, the plan.
struct BalancesParts: Codable, Equatable, Sendable {
    struct Highlight: Codable, Equatable, Sendable {
        let text: String
        let amount: String?
        let tone: String?
    }
    let mine: SignedText
    let tiles: [BalanceTileParts]
    let highlight: Highlight
    let plan: [PlanRow]
    let planSubtitle: String?
}

struct MetaPart: Codable, Equatable, Sendable {
    let text: String
    /// Shown on the narrowest screens (a phone) too.
    let phone: Bool
}

struct ExpenseRow: Codable, Equatable, Identifiable, Sendable {
    let id: String
    let title: String
    let meta: [MetaPart]
    let amount: String
    let amountMeta: String?
    let comments: Int
    let canEdit: Bool
}

struct SettlementRow: Codable, Equatable, Identifiable, Sendable {
    let id: String
    let title: String
    let meta: String
    let amount: String
    let comments: Int
}

struct ActivityRow: Codable, Equatable, Identifiable, Sendable {
    let id: String
    let text: String
    let when: String
    let amount: String?
}

/// memberRowParts: the avatar, "Sam (you)", the owner's badge, the remove button.
struct MemberRow: Decodable, Equatable, Identifiable, Sendable {
    let avatar: Avatar
    let label: String
    let isMe: Bool
    let owner: String?
    let canRemove: Bool
    let removeLabel: String
    var id: String { avatar.id ?? label }

    private enum Keys: String, CodingKey { case label, isMe, owner, canRemove, removeLabel }

    /// The row's fields beside its avatar's, as the core writes them.
    init(from decoder: Decoder) throws {
        avatar = try Avatar(from: decoder)
        let container = try decoder.container(keyedBy: Keys.self)
        label = try container.decode(String.self, forKey: .label)
        isMe = try container.decode(Bool.self, forKey: .isMe)
        owner = try container.decodeIfPresent(String.self, forKey: .owner)
        canRemove = try container.decode(Bool.self, forKey: .canRemove)
        removeLabel = try container.decode(String.self, forKey: .removeLabel)
    }
}

struct GroupPageFigures: Decodable, Equatable, Sendable {
    let name: String
    let imageUrl: String?
    /// The picture's colour when there's no photo (groupCover.groupColour).
    let colour: CoverColour
    let currency: String
    /// The header's "Total".
    let total: String
    /// "4 members".
    let members: String
    let avatars: AvatarStackParts
    let myMemberId: String?
    let isOwner: Bool
    let balances: BalancesParts
    let expenses: [ExpenseRow]
    let settlements: [SettlementRow]
    let activity: [ActivityRow]
    let memberRows: [MemberRow]
    /// "Share summary"'s text.
    let shareText: String
    let canDelete: Bool
    /// Who is still in the way of deleting it ("Sofia, Marco").
    let stillIn: String

    /// What the page needs from a read: the members with their avatars and
    /// the balances (a Map, as the core keeps it).
    struct Context: Sendable {
        let members: JSONValue
        let balances: JSONValue
        let myMember: JSONValue
    }

    static func context(detail: JSONValue, userId: String, core: BudgeerCore) throws -> Context {
        let members = try core.json("groupFormat", "membersWithAvatars", [detail["members"] ?? [], detail["avatars"] ?? []])
        let balances = try core.json("groupFormat", "balancesFrom", [detail["balances"] ?? []])
        let viewer = try core.json("groupFormat", "groupViewer", [detail["group"] ?? .null, members, JSONValue.string(userId)])
        return Context(members: members, balances: balances, myMember: viewer["myMember"] ?? .null)
    }

    /// - detail: GroupsRepository.groupDetail's answer; auditLog: group_audit_entries;
    ///   counts: group_comment_counts' rows
    static func compute(detail: JSONValue, auditLog: JSONValue, counts: JSONValue, userId: String, now: Date,
                        core: BudgeerCore) throws -> GroupPageFigures {
        let date = try JSONValue.from(JSDate(now))
        let group = detail["group"] ?? [:]
        let currency = group["currency"] ?? "EUR"
        let user = JSONValue.string(userId)
        let members = try core.json("groupFormat", "membersWithAvatars", [detail["members"] ?? [], detail["avatars"] ?? []])
        let balances = try core.json("groupFormat", "balancesFrom", [detail["balances"] ?? []])
        let expenses = detail["ledger"]?["expenses"] ?? []
        let settlements = detail["ledger"]?["settlements"] ?? []
        let viewer = try core.json("groupFormat", "groupViewer", [group, members, user])
        let myMember = viewer["myMember"] ?? .null
        let isOwner = viewer["isOwner"] ?? false
        let countMap = try core.json("groupFormat", "commentCountsFrom", [counts])
        let check = try core.json("groupFormat", "groupDeleteCheck", [group, members, user])
        let rowOptions: JSONValue = [
            "members": members, "myMemberId": myMember["id"] ?? .null, "myUserId": user, "isOwner": isOwner,
            "currency": currency, "counts": countMap, "now": date,
        ]
        let figures: JSONValue = [
            "name": group["name"] ?? "",
            "imageUrl": group["image_url"] ?? .null,
            "colour": try core.json("groupCover", "groupColour", [group["id"] ?? .null]),
            "currency": currency,
            "total": .string(core.formatMoney(try core.json("groupFormat", "groupTotal", [expenses, currency]),
                                              currency.stringValue ?? "EUR")),
            "members": try core.json("groupFormat", "pluralise", [JSONValue.int(members.arrayValue?.count ?? 0), "member"]),
            "avatars": try core.json("groupFormat", "avatarStackParts", [members, user]),
            "myMemberId": myMember["id"] ?? .null,
            "isOwner": isOwner,
            "balances": try core.json("groupFormat", "balancesParts", [[
                "balances": balances, "members": members, "myMember": myMember, "myUserId": user, "currency": currency,
            ] as JSONValue]),
            "expenses": .array(try (expenses.arrayValue ?? []).map {
                try core.json("groupFormat", "expenseRowParts", [$0, rowOptions])
            }),
            "settlements": .array(try (settlements.arrayValue ?? []).map {
                try core.json("groupFormat", "settlementRowParts", [$0, rowOptions])
            }),
            "activity": try core.json("groupFormat", "activityParts", [auditLog, currency, date]),
            "memberRows": try core.json("groupFormat", "memberRowParts", [members, user, isOwner]),
            "shareText": try core.json("groupFormat", "groupShareText", [[
                "group": group, "expenses": expenses, "balances": balances, "members": members,
            ] as JSONValue]),
            "canDelete": check["canDelete"] ?? false,
            "stillIn": try core.json("groupFormat", "stillInNames", [check["others"] ?? []]),
        ]
        return try figures.decode()
    }
}

// MARK: The expense form

/// expenseFormStart, and the form's state as the user changes it.
struct ExpenseFormState: Codable, Equatable, Sendable {
    var description: String
    var paidCurrency: String
    var currencyPicked: Bool
    var amount: String
    var paidBy: String
    var spentAt: String
    var splitWith: [String]
    var mode: String
    var values: [String: String]
}

/// The split as it stands (splitPreview's parts the form shows).
struct SplitPreview: Codable, Equatable, Sendable {
    let byMember: [String: Int]
    let shareText: [String: String]
    let summary: String
    let complete: Bool
}

struct SplitCard: Codable, Equatable, Sendable {
    let title: String
    let line: String
}

/// Everything the form shows and sends for its state.
struct ExpenseFormFigures: Decodable, Equatable, Sendable {
    let totalMinor: Int
    let preview: SplitPreview
    let card: SplitCard
    /// What stops a save (a toast's words), or nil.
    let problem: ToastText?
    /// add/update_group_expense_v2's arguments (expenseSaveArgs).
    let args: JSONValue
    let toast: ToastText
}

enum GroupExpenseFigures {
    /// Where the form opens (expenseFormStart).
    /// - initial: what the Add form carried over (carryDraft's answer), or null
    static func start(group: JSONValue, members: JSONValue, myMemberId: String?, expense: JSONValue?,
                      initial: JSONValue, today: String, core: BudgeerCore) throws -> ExpenseFormState {
        try core.call("groupExpenseForm", "expenseFormStart", [[
            "expense": expense ?? .null, "members": members, "defaultPayer": myMemberId.json,
            "groupCurrency": group["currency"] ?? "EUR", "initial": initial, "today": .string(today),
        ] as JSONValue])
    }

    /// The state's preview, card, problem, arguments and toast.
    /// - rate: the rate paid → group currency in use (1 for the group's own), nil while none
    static func evaluate(_ form: ExpenseFormState, group: JSONValue, members: JSONValue, myMemberId: String?,
                         expense: JSONValue?, rate: Double?, fxLoading: Bool, quick: Bool,
                         core: BudgeerCore) throws -> ExpenseFormFigures {
        let currency = group["currency"] ?? "EUR"
        let state = try JSONValue.from(form)
        let ids = try core.json("groupExpenseForm", "includedIds", [members, state["splitWith"] ?? []])
        let needsFx = JSONValue.bool(form.paidCurrency != currency.stringValue)
        let rateValue: JSONValue = rate.map { JSONValue.double($0) } ?? .null
        let paidMinor = try core.json("groupExpenseForm", "paidMinorOf", [form.amount, form.paidCurrency])
        let total = try core.json("groupExpenseForm", "splitTotal", [[
            "paidMinor": paidMinor, "paidCurrency": .string(form.paidCurrency), "rate": rateValue, "groupCurrency": currency,
        ] as JSONValue])
        let preview = try core.json("groupExpenseForm", "splitPreview", [[
            "mode": .string(form.mode), "totalMinor": total, "ids": ids, "values": state["values"] ?? [:],
            "currency": currency, "needsFx": needsFx, "paidMinor": paidMinor, "rate": rateValue,
        ] as JSONValue])
        let summary = preview["summary"] ?? ""
        let myShare = myMemberId.flatMap { preview["byMember"]?[$0] } ?? 0
        let figures: JSONValue = [
            "totalMinor": total,
            "preview": preview,
            "card": try core.json("groupExpenseForm", "splitCardParts", [[
                "mode": .string(form.mode), "included": .int(ids.arrayValue?.count ?? 0),
                "total": .int(members.arrayValue?.count ?? 0), "summary": summary,
            ] as JSONValue]),
            "problem": try core.json("groupExpenseForm", "expenseSaveProblem", [[
                "rate": rateValue, "fxLoading": .bool(fxLoading), "ids": ids, "mode": .string(form.mode),
                "preview": preview, "totalMinor": total, "currency": currency,
            ] as JSONValue]),
            "args": try core.json("groupExpenseForm", "expenseSaveArgs", [[
                "groupId": group["id"] ?? .null, "expenseId": expense?["id"] ?? .null,
                "description": .string(form.description), "paidMinor": paidMinor,
                "paidCurrency": .string(form.paidCurrency), "needsFx": needsFx, "rate": rateValue,
                "paidBy": .string(form.paidBy), "spentAt": .string(form.spentAt), "ids": ids, "mode": .string(form.mode),
                "preview": preview,
            ] as JSONValue]),
            "toast": try core.json("groupExpenseForm", "expenseSavedToast", [[
                "isEdit": .bool(expense != nil), "quick": .bool(quick), "groupName": group["name"] ?? "",
                "myShare": myShare, "currency": currency,
            ] as JSONValue]),
        ]
        return try figures.decode()
    }
}

// MARK: Settle up

struct SettleStart: Codable, Equatable, Sendable {
    let direction: String
    let otherId: String
    let amount: String
    let settledAt: String
    let picked: Int
}

struct SettleSuggestion: Codable, Equatable, Identifiable, Sendable {
    struct Remind: Codable, Equatable, Sendable {
        let memberId: String
        let label: String
    }
    let index: Int
    let direction: String
    let otherId: String
    let amount: String
    let key: String
    let values: [String: String]
    /// "Pay <b>Sam</b> €12.00" (translate.parseRich reads the <b>).
    let text: String
    let remind: Remind?
    var id: Int { index }
}

struct SettleParties: Codable, Equatable, Sendable {
    let from: String
    let to: String
}

/// The settle-up form's words and arguments for its state.
struct SettleState: Decodable, Equatable, Sendable {
    let otherLine: String?
    let parties: SettleParties
    let problem: String?
    /// add_settlement's arguments (settlementArgs).
    let args: JSONValue
}

enum SettleFigures {
    /// The page as it opens: who you can settle with, the form, the suggestions.
    static func open(group: JSONValue, members: JSONValue, balances: JSONValue, myMemberId: String, today: String,
                     core: BudgeerCore) throws -> (others: [String], start: SettleStart, suggestions: [SettleSuggestion]) {
        let currency = group["currency"] ?? "EUR"
        let me = JSONValue.string(myMemberId)
        let others = try core.json("settleForm", "settleOthers", [members, me])
        let start: SettleStart = try core.call("settleForm", "settleFormStart", [[
            "balances": balances, "members": members, "myMemberId": me, "currency": currency, "today": .string(today),
        ] as JSONValue])
        let suggestions: [SettleSuggestion] = try core.call("settleForm", "settleSuggestionParts", [[
            "balances": balances, "members": members, "myMemberId": me, "currency": currency,
        ] as JSONValue])
        return ((others.arrayValue ?? []).compactMap { $0["id"]?.stringValue }, start, suggestions)
    }

    /// The form's words and what recording it sends.
    static func state(group: JSONValue, members: JSONValue, balances: JSONValue, myMemberId: String, direction: String,
                      otherId: String, amount: String, settledAt: String, core: BudgeerCore) throws -> SettleState {
        let currency = group["currency"] ?? "EUR"
        let figures: JSONValue = [
            "otherLine": try core.json("settleForm", "settleOtherLine", [[
                "balances": balances, "members": members, "otherId": .string(otherId), "currency": currency,
            ] as JSONValue]),
            "parties": try core.json("settleForm", "settleParties", [[
                "direction": .string(direction), "members": members, "otherId": .string(otherId),
            ] as JSONValue]),
            "problem": try core.json("settleForm", "settleProblem", [["otherId": .string(otherId), "amount": .string(amount)] as JSONValue]),
            "args": try core.json("settleForm", "settlementArgs", [[
                "groupId": group["id"] ?? .null, "direction": .string(direction), "myMemberId": .string(myMemberId),
                "otherId": .string(otherId), "amount": .string(amount), "currency": currency, "settledAt": .string(settledAt),
            ] as JSONValue]),
        ]
        return try figures.decode()
    }
}

// MARK: Errors

enum UserMessage {
    /// What to show for a failed request (errors.userMessage over the web's
    /// error shape): our own words when the server's refusal is ours, the
    /// connection line when offline, else `fallback` (the generic line).
    static func of(_ error: Error, fallback: String? = nil, core: BudgeerCore) -> String {
        var shape: JSONValue
        if let server = error as? ServerError {
            shape = ["code": server.code.json, "message": .string(server.message)]
            if server.edge { shape = shape.with("serverMessage", true) }
        } else if error is URLError {
            // What a browser says when the request never got an answer.
            shape = ["message": "Failed to fetch"]
        } else {
            shape = ["message": .string(String(describing: error))]
        }
        let args: [Encodable] = fallback.map { [shape, JSONValue.string($0)] } ?? [shape]
        return (try? core.call("errors", "userMessage", args)) ?? (fallback ?? core.text("common:errors.generic"))
    }
}
