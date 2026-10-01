// Settle up, after the web's SettleUpPage: always from the user's side (they
// paid someone, or someone paid them), opening on the biggest payment
// they're part of, with the suggestions one tap away, a reminder for
// someone who owes them, "Pay Sam directly" from the payment details Sam
// saved, and, when you're the one being paid and have none, the web's
// one-time ask for yours (PaymentDetailsAsk), filled in place and saved as
// Settings › Account › Getting paid saves them. The rules are settleForm.js's
// (SettleFigures) and payLinks.js's; the reads and writes are the web's
// (add_settlement, nudge_member, member_payment_info, my_payment_info,
// set_payment_info).
import Foundation
import Observation
import BudgeerCore

@MainActor
@Observable
final class SettleUpModel {
    let group: JSONValue
    let members: JSONValue
    let myMemberId: String
    /// The members you can settle with (everyone but you).
    let others: [String]
    let suggestions: [SettleSuggestion]

    private(set) var direction: String
    private(set) var otherId: String
    private(set) var amount: String
    var settledAt: String
    /// The suggestion the form holds (-1: none, edited by hand).
    private(set) var picked: Int
    private(set) var busy = false
    /// What stops recording, a reminder's answer, or a failure.
    private(set) var message: String?
    /// The other person's payment details (nil while they load).
    private(set) var payInfo: JSONValue?
    private var payFor: String?

    /// The ask for your payment details: your details (nil until read),
    /// "Not now" (this device remembers it, as the web's browser does), the
    /// fields once opened, and what saving them said.
    private var myInfo: JSONValue?
    private(set) var askDismissed: Bool
    private(set) var askOpen = false
    var iban = ""
    var revolut = ""
    var paypal = ""
    private(set) var askProblem: String?

    private let balances: JSONValue
    private let data: DataLayer
    private let core: BudgeerCore
    private let defaults: UserDefaults

    /// STORAGE_KEYS.paymentAskDismissed, the web's own key.
    static let askKey = "budge:paymentAsk"

    init(group: JSONValue, members: JSONValue, balances: JSONValue, myMemberId: String, data: DataLayer,
         core: BudgeerCore = .shared, now: @escaping @Sendable () -> Date = { Date() },
         defaults: UserDefaults = .standard) {
        self.group = group
        self.members = members
        self.balances = balances
        self.myMemberId = myMemberId
        self.data = data
        self.core = core
        self.defaults = defaults
        askDismissed = defaults.string(forKey: SettleUpModel.askKey) == "1"
        let today = (try? core.isoDate(now())) ?? ""
        let opened = try? SettleFigures.open(group: group, members: members, balances: balances, myMemberId: myMemberId,
                                             today: today, core: core)
        others = opened?.others ?? []
        suggestions = opened?.suggestions ?? []
        direction = opened?.start.direction ?? "out"
        otherId = opened?.start.otherId ?? ""
        amount = opened?.start.amount ?? ""
        settledAt = opened?.start.settledAt ?? today
        picked = opened?.start.picked ?? -1
    }

    var currency: String { group["currency"]?.stringValue ?? "EUR" }

    /// The words and arguments for the form as it stands.
    var state: SettleState? {
        try? SettleFigures.state(group: group, members: members, balances: balances, myMemberId: myMemberId,
                                 direction: direction, otherId: otherId, amount: amount, settledAt: settledAt, core: core)
    }

    /// A member's name as the picker lists it.
    func name(_ id: String) -> String {
        (members.arrayValue ?? []).first { $0["id"]?.stringValue == id }?["display_name"]?.stringValue ?? ""
    }

    /// A member's circle (groupFormat.memberAvatar), the viewer's in the accent.
    func avatar(_ memberId: String?) -> Avatar? {
        guard let memberId,
              let member = (members.arrayValue ?? []).first(where: { $0["id"]?.stringValue == memberId }) else { return nil }
        return try? core.call("groupFormat", "memberAvatar", [member, JSONValue.bool(memberId == myMemberId)])
    }

    /// A suggestion's words as rich text (translate.parseRich: strings and { tag, children }).
    func rich(_ text: String) -> JSONValue {
        (try? core.json("translate", "parseRich", [text])) ?? [.string(text)]
    }

    // MARK: Editing (a change by hand no longer matches a suggestion)

    func apply(_ suggestion: SettleSuggestion) {
        direction = suggestion.direction
        otherId = suggestion.otherId
        amount = suggestion.amount
        picked = suggestion.index
    }

    func setDirection(_ value: String) {
        direction = value
        picked = -1
    }

    func pickOther(_ id: String) {
        otherId = id
        picked = -1
    }

    func setAmount(_ text: String) {
        amount = (try? core.call("moneyParse", "sanitizeAmountInput", [text, currency])) ?? text
        picked = -1
    }

    // MARK: Pay directly

    /// "Pay Sam directly" (payShortcutParts), for the person picked when you paid.
    var payShortcut: JSONValue? {
        guard direction == "out", state?.problem == nil,
              let member = (members.arrayValue ?? []).first(where: { $0["id"]?.stringValue == otherId }) else { return nil }
        let minor = (try? core.json("currency", "toMinor", [amount, currency])) ?? 0
        let info: JSONValue = payFor == otherId ? (payInfo ?? .null) : .null
        let parts = try? core.json("settleForm", "payShortcutParts", [[
            "member": member, "info": info, "amountMinor": minor, "currency": .string(currency),
            "groupName": group["name"] ?? "",
        ] as JSONValue])
        return parts?["kind"]?.stringValue == "hidden" ? nil : parts
    }

    /// Read the picked member's payment details (once per person; none on a failure).
    func loadPayInfo() async {
        let id = otherId
        guard payFor != id else { return }
        let member = (members.arrayValue ?? []).first { $0["id"]?.stringValue == id }
        payFor = id
        payInfo = nil
        guard member?["user_id"]?.stringValue != nil else { return }
        let info = (try? await data.groups.memberPaymentInfo(memberId: id)) ?? [:]
        if payFor == id { payInfo = info }
    }

    // MARK: Getting paid (the web's PaymentDetailsAsk)

    /// The ask shows: you're being paid, your details are read and empty,
    /// and "Not now" wasn't tapped (payLinks.askForPaymentDetails).
    var asksForDetails: Bool {
        let args: JSONValue = ["direction": .string(direction), "info": myInfo ?? .null, "dismissed": .bool(askDismissed)]
        return (try? core.call("payLinks", "askForPaymentDetails", [args])) ?? false
    }

    /// Read your own details once, when you're the one being paid (none on a failure: just don't ask).
    func loadMyInfo() async {
        guard direction == "in", !askDismissed, myInfo == nil else { return }
        myInfo = try? await data.profile.myPaymentInfo()
    }

    /// "Add payment details": the fields, in place.
    func openAsk() {
        askOpen = true
    }

    /// "Not now", remembered on this device.
    func notNow() {
        defaults.set("1", forKey: SettleUpModel.askKey)
        askDismissed = true
        askOpen = false
    }

    /// Save the details as Getting paid saves them (payLinks.paymentDetailsToSave,
    /// set_payment_info); once in, the ask goes.
    func saveDetails() async {
        let input: JSONValue = ["iban": .string(iban), "revolut": .string(revolut), "paypal": .string(paypal)]
        guard let details = try? core.json("payLinks", "paymentDetailsToSave", [input]) else { return }
        if let error = details["error"]?.stringValue {
            askProblem = core.text(error)
            return
        }
        busy = true
        defer { busy = false }
        do {
            try await data.profile.savePaymentInfo(details)
            askProblem = nil
            askOpen = false
            myInfo = (try? await data.profile.myPaymentInfo()) ?? myInfo
            message = core.text("settings:payment.saved")
        } catch {
            askProblem = UserMessage.of(error, core: core)
        }
    }

    // MARK: Writes

    /// Record the settlement: true once in.
    func record() async -> Bool {
        guard let state else { return false }
        if let problem = state.problem {
            message = problem
            return false
        }
        busy = true
        defer { busy = false }
        do {
            try await data.groups.addSettlement(state.args)
            message = core.text("groups:settle.recorded")
            return true
        } catch {
            message = UserMessage.of(error, core: core)
            return false
        }
    }

    /// Remind someone who owes you (rate-limited by the server).
    func remind(_ memberId: String) async {
        guard let groupId = group["id"]?.stringValue else { return }
        do {
            try await data.groups.nudgeMember(groupId: groupId, memberId: memberId)
            message = core.text("groups:settle.reminderSent")
        } catch {
            message = UserMessage.of(error, fallback: core.text("groups:settle.reminderFailed"), core: core)
        }
    }
}
