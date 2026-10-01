// Settings › Privacy, after the web's PrivacySettings: each GDPR right with
// the way to use it here (download your data as one JSON file, correct it,
// delete the account, a privacy request to the privacy inbox), the consent
// switches (the email and weekly-summary messages, PreferencesModel) and the
// consent history (legal.describeConsent, dates.shortDateTime). The request
// form is the web's PrivacyRequestPage (legal.privacyRequestToSend); the
// shared demo account sends no requests and can't be deleted.
import Foundation
import Observation
import BudgeerCore

/// One line of the consent history.
struct ConsentLine: Identifiable, Equatable {
    let id: String
    let text: String
    let when: String
}

@MainActor
@Observable
final class PrivacyModel {
    private(set) var consents: [ConsentLine]? = nil
    private(set) var isDemo = false
    private(set) var busy = false
    /// The data file, once downloaded: what Share hands to Files, Mail or AirDrop.
    private(set) var exportFile: URL? = nil
    private(set) var message: String?
    private(set) var warning = false

    // The request form.
    var kind = "restrict"
    var requestText = ""
    private(set) var sent = false

    private let data: DataLayer
    private let core: BudgeerCore
    private let now: @Sendable () -> Date

    init(data: DataLayer, core: BudgeerCore = .shared, now: @escaping @Sendable () -> Date = { Date() }) {
        self.data = data
        self.core = core
        self.now = now
    }

    /// privacy@ and support@ (contact.contactLinks).
    var privacyEmail: String {
        (try? core.json("contact", "contactLinks", []))?["privacy"]?.stringValue ?? ""
    }

    /// What a request can be about, in the form's order (legal.requestKinds).
    var requestKinds: [String] { (try? core.call("legal", "requestKinds", [])) ?? [] }

    func load() async {
        if let profile = try? await data.profile.profile() {
            isDemo = (try? core.call("demoAccount", "isDemoAccount", [profile])) ?? false
        }
        await loadConsents()
    }

    func loadConsents() async {
        guard let rows = try? await data.privacy.consents() else {
            if consents == nil { consents = [] }
            return
        }
        let instant = JSDate(now())
        consents = (rows.arrayValue ?? []).map { row in
            ConsentLine(id: row["id"]?.stringValue ?? UUID().uuidString,
                        text: (try? core.call("legal", "describeConsent", [row])) ?? "",
                        when: (try? core.call("dates", "shortDateTime", [row["created_at"] ?? .null, instant])) ?? "")
        }
    }

    /// "Download my data": everything, as the web's JSON file (legal.exportFileName), ready to share.
    func download() async {
        busy = true
        defer { busy = false }
        do {
            let everything = try await data.privacy.exportMyData()
            let name: String = try core.call("legal", "exportFileName", [JSDate(now())])
            let encoder = JSONEncoder()
            encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
            let file = FileManager.default.temporaryDirectory.appendingPathComponent(name)
            try encoder.encode(everything).write(to: file, options: .atomic)
            exportFile = file
            say([core.text("privacy:gate.downloaded"), core.text("privacy:settings.download.unprotected")]
                .joined(separator: " "))
        } catch {
            say(UserMessage.of(error, fallback: core.text("privacy:gate.downloadFailed"), core: core), warning: true)
        }
    }

    /// Send the request: checked as the web checks it, then to the privacy
    /// inbox; the receipt's date in the message.
    @discardableResult
    func sendRequest() async -> Bool {
        let typed: JSONValue = ["kind": .string(kind), "message": .string(requestText)]
        guard let checked = try? core.json("legal", "privacyRequestToSend", [typed]) else { return false }
        if let error = checked["error"]?.stringValue {
            say(error, warning: true)
            return false
        }
        busy = true
        defer { busy = false }
        do {
            try await data.privacy.sendPrivacyRequest(checked["request"] ?? .null)
            let by: String = (try? core.call("legal", "responseDeadlineText", [JSDate(now())])) ?? ""
            say(core.text("privacy:request.sentBody", ["date": .string(by)]))
            requestText = ""
            sent = true
            return true
        } catch {
            say(UserMessage.of(error, fallback: core.text("privacy:request.failed"), core: core), warning: true)
            return false
        }
    }

    /// The form opened again: a new request.
    func startRequest() {
        sent = false
        message = nil
    }

    private func say(_ text: String, warning: Bool = false) {
        message = text
        self.warning = warning
    }
}
