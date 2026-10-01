// Settings › Your data: Export backup and Restore from backup, after the
// web's ExportBackupPage and RestoreBackupPage. The file is the web's own
// (backupMath's document, or its password envelope), so a backup made on one
// restores on the other. Export reads everything (BackupData.gather), seals
// it when a password is set (BackupSeal, by backupMath.SEAL) and hands the
// file to the share sheet; Restore reads a picked file (readBackup), unlocks
// it when it's sealed, shows what's in it and what happens to the main
// currency, then merges it in (BackupData.restore) and says what it did
// (restoreSummary). Every check and every word is the core's.
import Foundation
import Observation
import BudgeerCore

@MainActor
@Observable
final class ExportBackupModel {
    var password = "" { didSet { failed = nil } }
    var confirm = ""
    /// Download was tapped: the password's problems show from now on.
    private(set) var touched = false
    /// What's being read or made ("Reading your settings"), nil when idle.
    private(set) var step: String?
    private(set) var failed: String?
    /// The backup file, once made: what Share hands to Files, Mail or AirDrop.
    private(set) var file: URL?
    /// The file was sealed with a password (the "keep it safe" line).
    private(set) var sealed = false

    private let data: DataLayer
    private let userId: String
    private let sealer: BackupSealing
    private let core: BudgeerCore
    private let now: @Sendable () -> Date

    init(data: DataLayer, userId: String, sealer: BackupSealing = BackupSeal(), core: BudgeerCore = .shared,
         now: @escaping @Sendable () -> Date = { Date() }) {
        self.data = data
        self.userId = userId
        self.sealer = sealer
        self.core = core
        self.now = now
    }

    var busy: Bool { step != nil }
    /// password.validatePassword, for a password typed (none is fine).
    var passwordError: String? {
        guard !password.isEmpty else { return nil }
        return (try? core.json("password", "validatePassword", [password]))?.stringValue
    }
    var mismatch: Bool { !password.isEmpty && confirm != password }
    var canSubmit: Bool { passwordError == nil && !mismatch }

    /// Read everything, seal it with the password when there is one, and
    /// write the file the web's name gives it (backupFileName). True once made.
    @discardableResult
    func export() async -> Bool {
        touched = true
        guard canSubmit else { return false }
        file = nil
        failed = nil
        step = core.text("backup:export.steps.starting")
        defer { step = nil }
        do {
            let reader = BackupData(data: data, core: core, now: now)
            let doc = try await reader.gather(userId: userId) { step = $0 }
            let secret = password
            step = core.text(secret.isEmpty ? "backup:export.steps.saving" : "backup:export.steps.encrypting")
            let text: String
            if secret.isEmpty {
                text = try core.call("backupMath", "backupText", [doc])
            } else {
                text = try await seal(doc, secret)
            }
            let name: String = try core.call("backupMath", "backupFileName", [JSDate(now())])
            let url = FileManager.default.temporaryDirectory.appendingPathComponent(name)
            try Data(text.utf8).write(to: url, options: .atomic)
            file = url
            sealed = !secret.isEmpty
            return true
        } catch {
            failed = BackupData.message(error, fallback: core.text("backup:export.failed"), core: core)
            return false
        }
    }

    /// The document sealed under `secret` as the web seals it, in its envelope.
    private func seal(_ doc: JSONValue, _ secret: String) async throws -> String {
        let text: String = try core.call("backupMath", "backupText", [doc])
        let how = try core.json("backupMath", "SEAL", [])
        let version = try core.json("backupMath", "BACKUP_VERSION", [])
        let aad: String = try core.call("backupMath", "aadFor", [version])
        guard let iterations = how["iterations"]?.intValue, let saltBytes = how["saltBytes"]?.intValue,
              let ivBytes = how["ivBytes"]?.intValue else { throw BackupSealFailed() }
        let sealer = self.sealer
        let parts = try await Task.detached {
            try sealer.seal(text, password: secret, iterations: iterations, saltBytes: saltBytes, ivBytes: ivBytes, aad: aad)
        }.value
        let fields = try core.json("backupMath", "sealedFields", [[
            "salt": .string(parts.salt), "iv": .string(parts.iv), "ciphertext": .string(parts.ciphertext),
        ] as JSONValue])
        return try core.call("backupMath", "sealedText", [fields])
    }

    /// The password's line: its problem once tried, else the help.
    var passwordNote: (text: String, problem: Bool) {
        if touched, let problem = passwordError { return (problem, true) }
        return (core.text("backup:export.passwordHelp"), false)
    }
}

@MainActor
@Observable
final class RestoreBackupModel {
    enum Step: String, Equatable { case choose, error, password, review, running, done }

    private(set) var step: Step = .choose
    /// The error step's words.
    private(set) var error: String?
    var password = "" { didSet { passwordError = nil } }
    private(set) var passwordError: String?
    private(set) var unlocking = false
    /// The validated backup being restored.
    private(set) var backup: JSONValue = .null
    /// The confirm step's lines: when it was made, the main currency.
    private(set) var made: String?
    private(set) var currencyNote: String?
    private(set) var contents: [(id: String, label: String, count: Int)] = []
    private(set) var groupShares: String?
    private(set) var progress = RestoreProgress(label: "")
    /// The restore stopped: its words (what was added stays).
    private(set) var stopped: String?
    /// The summary: added, skipped, kept.
    private(set) var summary: (added: String, skipped: String?, kept: String?)?

    private var envelope: JSONValue = .null
    private let data: DataLayer
    private let userId: String
    private let email: String?
    private let sealer: BackupSealing
    private let core: BudgeerCore
    private let now: @Sendable () -> Date

    init(data: DataLayer, userId: String, email: String?, sealer: BackupSealing = BackupSeal(), core: BudgeerCore = .shared,
         now: @escaping @Sendable () -> Date = { Date() }) {
        self.data = data
        self.userId = userId
        self.email = email
        self.sealer = sealer
        self.core = core
        self.now = now
    }

    /// The page's title at each step (backup:restore.steps.*).
    var title: String { core.text("backup:restore.steps.\(step.rawValue)") }
    /// From a picked file until the summary, Back would lose the work.
    var running: Bool { step == .running }

    func chooseAnother() {
        step = .choose
        error = nil
        stopped = nil
    }

    /// A file picked in Files: read, checked, then the password or the review.
    func read(url: URL) async {
        let scoped = url.startAccessingSecurityScopedResource()
        defer { if scoped { url.stopAccessingSecurityScopedResource() } }
        let size = (try? url.resourceValues(forKeys: [.fileSizeKey]).fileSize) ?? 0
        do {
            let limit: Int = try core.call("backupMath", "MAX_BACKUP_BYTES", [])
            guard size <= limit else { throw BackupMessage(text: core.text("backup:errors.tooLarge")) }
            await read(text: String(decoding: try Data(contentsOf: url), as: UTF8.self))
        } catch {
            fail(error)
        }
    }

    /// A backup file's text: is it ours, a version we read, sealed?
    func read(text: String) async {
        do {
            let read = try core.json("backupMath", "readBackup", [text])
            if read["encrypted"]?.boolValue == true {
                envelope = read["envelope"] ?? .null
                password = ""
                step = .password
            } else {
                await review(read["backup"] ?? .null)
            }
        } catch {
            fail(error)
        }
    }

    private func fail(_ error: Error) {
        self.error = BackupData.message(error, fallback: core.text("backup:errors.unreadable"), core: core)
        step = .error
    }

    /// Open the envelope with the password typed (its parameters checked by
    /// the core first), then the backup inside it.
    func unlock() async {
        guard !password.isEmpty else { return }
        unlocking = true
        defer { unlocking = false }
        do {
            let params = try core.json("backupMath", "envelopeParams", [envelope])
            guard let salt = params["salt"]?.stringValue, let iv = params["iv"]?.stringValue,
                  let ciphertext = params["ciphertext"]?.stringValue, let iterations = params["iterations"]?.intValue,
                  let aad = params["aad"]?.stringValue else { throw BackupSealFailed() }
            let sealer = self.sealer
            let secret = password
            let text: String
            do {
                text = try await Task.detached {
                    try sealer.open(salt: salt, iv: iv, ciphertext: ciphertext, iterations: iterations, aad: aad, password: secret)
                }.value
            } catch {
                throw BackupMessage(text: core.text("backup:errors.wrongPassword"))
            }
            await review(try core.json("backupMath", "openedBackup", [text]))
        } catch {
            passwordError = BackupData.message(error, fallback: core.text("backup:errors.wrongPassword"), core: core)
        }
    }

    /// The confirm step: what's in the backup, when it was made, the main currency.
    private func review(_ validated: JSONValue) async {
        backup = validated
        made = (try? core.json("backupMath", "madeLine", [validated["exportedAt"] ?? .null]))?.stringValue
        let counts = (try? core.json("backupMath", "backupContents", [validated])) ?? [:]
        let rows: [String] = (try? core.call("backupMath", "CONTENT_ROWS", [])) ?? []
        contents = rows.map { id in (id, core.text("backup:restore.contents.\(id)"), counts[id]?.intValue ?? 0) }
        let shares = counts["groupShares"]?.intValue ?? 0
        groupShares = shares > 0 ? core.text("backup:restore.groupShares", ["shares": .int(shares)]) : nil
        currencyNote = nil
        stopped = nil
        step = .review
        // A failed check leaves the line out, as on the web.
        if let plan = try? await BackupData(data: data, core: core, now: now).currencyPlan(validated) {
            currencyNote = (try? core.json("backupMath", "currencyLine", [plan]))?.stringValue
        }
    }

    /// Merge it in; on a failure the confirm step comes back with why (what
    /// was added stays, and running it again picks up the rest).
    func restore() async {
        step = .running
        stopped = nil
        progress = RestoreProgress(label: core.text("backup:restore.progressSteps.starting"))
        do {
            let tally = try await BackupData(data: data, core: core, now: now)
                .restore(backup, userId: userId, email: email) { [weak self] next in self?.progress = next }
            let words = try core.json("backupMath", "restoreSummary", [tally])
            summary = (words["added"]?.stringValue ?? "", words["skipped"]?.stringValue, words["kept"]?.stringValue)
            step = .done
        } catch {
            stopped = core.text("backup:restore.stoppedBody", ["error": .string(BackupData.message(error, core: core))])
            step = .review
        }
    }
}
