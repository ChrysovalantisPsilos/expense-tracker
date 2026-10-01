// Settings › Account, after the web's AccountSettings: your picture (a photo
// uploaded as the web's uploadAvatar does; not on the shared demo account),
// your name and default currency (fixed once entries depend on it,
// base_currency_locked), then "Getting paid" (the IBAN, Revolut tag and
// PayPal.me name friends see when settling up, tidied by the core's
// payLinks.paymentDetailsToSave). Every word and rule is the web's.
import Foundation
import Observation
import BudgeerCore

@MainActor
@Observable
final class AccountModel {
    enum State: Equatable {
        case loading
        case loaded
        case failed(String)
    }

    private(set) var state: State = .loading
    /// The profile as last read or saved (Settings' first row shows its name and picture).
    private(set) var profile: JSONValue = [:]
    var name = ""
    var currency = "EUR"
    private(set) var currencyLocked = false
    var iban = ""
    var revolut = ""
    var paypal = ""
    private(set) var busy = false
    private(set) var uploading = false
    /// What the last action said, and whether it is a warning.
    private(set) var message: String?
    private(set) var warning = false

    private let data: DataLayer
    private let core: BudgeerCore

    init(data: DataLayer, core: BudgeerCore = .shared) {
        self.data = data
        self.core = core
    }

    /// The shared demo login (profiles.is_demo): no photo upload there.
    var isDemo: Bool { (try? core.call("demoAccount", "isDemoAccount", [profile])) ?? false }

    /// The name as saved ('' when there is none yet).
    var savedName: String { profile["display_name"]?.stringValue ?? "" }

    /// Your circle: the photo, or your initials in the accent (avatarLook, highlighted).
    var avatar: Avatar? { Avatar.viewer(profile, core: core) }

    /// The currency picker's codes (CurrencySelect: currency.currencyCodes).
    var currencyOptions: [String] {
        (try? core.call("currency", "currencyCodes", [JSONValue.string(currency)])) ?? [currency]
    }

    func load() async {
        do {
            profile = try await data.profile.profile()
            name = savedName
            currency = profile["base_currency"]?.stringValue ?? "EUR"
            // If the lock can't be read, the picker stays and the server has
            // the last word (its refusal is the save's message).
            currencyLocked = (try? await data.profile.baseCurrencyLocked()) ?? false
            if let info = try? await data.profile.myPaymentInfo() {
                iban = info["payment_iban"]?.stringValue ?? ""
                revolut = info["payment_revolut"]?.stringValue ?? ""
                paypal = info["payment_paypal"]?.stringValue ?? ""
            }
            state = .loaded
        } catch {
            if case .loaded = state { return } // a failed refresh keeps the page
            state = .failed(UserMessage.of(error, core: core))
        }
    }

    /// The profile read again (another device changed it), leaving what is being typed alone.
    func refreshProfile() async {
        guard let fresh = try? await data.profile.profile() else { return }
        profile = fresh
        if case .loading = state { state = .loaded }
    }

    /// "Save changes": the name (none when empty) and, while it can change, the currency.
    func saveProfile() async {
        busy = true
        defer { busy = false }
        var fields: JSONValue = ["display_name": name.isEmpty ? .null : .string(name)]
        if !currencyLocked { fields = fields.with("base_currency", .string(currency)) }
        do {
            try await data.profile.updateProfile(fields)
            for (key, value) in fields.objectValue ?? [:] { profile = profile.with(key, value) }
            say(core.text("settings:account.saved"))
        } catch {
            say(UserMessage.of(error, core: core), warning: true)
        }
    }

    /// "Getting paid"'s Save: the details as the web tidies them, or why the PayPal name can't be saved.
    func savePayment() async {
        let input: JSONValue = ["iban": .string(iban), "revolut": .string(revolut), "paypal": .string(paypal)]
        guard let details = try? core.json("payLinks", "paymentDetailsToSave", [input]) else { return }
        if let error = details["error"]?.stringValue {
            say(core.text(error), warning: true)
            return
        }
        busy = true
        defer { busy = false }
        do {
            try await data.profile.savePaymentInfo(details)
            paypal = details["paypal"]?.stringValue ?? ""
            say(core.text("settings:payment.saved"))
        } catch {
            say(UserMessage.of(error, core: core), warning: true)
        }
    }

    /// A new picture (a JPEG the view made from the photo picked).
    func uploadPhoto(_ data: Data) async {
        uploading = true
        defer { uploading = false }
        do {
            let url = try await self.data.profile.uploadAvatar(data: data, contentType: "image/jpeg", ext: "jpg")
            profile = profile.with("avatar_url", .string(url))
            say(core.text("settings:account.photoUpdated"))
        } catch {
            say(UserMessage.of(error, fallback: core.text("settings:account.photoFailed"), core: core), warning: true)
        }
    }

    private func say(_ text: String, warning: Bool = false) {
        message = text
        self.warning = warning
    }
}
