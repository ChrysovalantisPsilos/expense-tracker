// Settings › Your data (the web's YourData), Export backup
// (ExportBackupModel) and Restore from backup (RestoreBackupModel), in the
// web's words and order. Export: an optional password (with its warning),
// the note about groups, then the file, made on this phone and handed to the
// share sheet (Save to Files, AirDrop, Mail). Restore: pick a file, the
// password when it has one, what's in it and what happens to the main
// currency, the restore with its progress (Back is held meanwhile), then
// what it added, skipped and kept.
import SwiftUI
import UniformTypeIdentifiers

@MainActor
struct YourDataView: View {
    @Environment(AppLanguage.self) private var language

    var body: some View {
        List {
            Section {
                Text(language.t("settings:rows.data.desc")).font(.subheadline)
            }
            .listRowBackground(Color.clear)
            .listRowInsets(EdgeInsets(top: 0, leading: 4, bottom: 0, trailing: 4))

            Section {
                Text(language.t("backup:export.lead")).font(.subheadline).foregroundStyle(.secondary)
                NavigationLink(value: AppRoute.exportBackup) {
                    SettingsLabel(symbol: "square.and.arrow.down.fill", color: NativeTone.coral,
                                  title: language.t("backup:export.title"))
                }
                .accessibilityIdentifier("data.export")
            } header: {
                NativeCapsHeader(title: language.t("backup:export.title"))
            }
            .listRowBackground(NativeStyle.card)

            Section {
                Text(language.t("backup:restore.lead")).font(.subheadline).foregroundStyle(.secondary)
                NavigationLink(value: AppRoute.restoreBackup) {
                    SettingsLabel(symbol: "square.and.arrow.up.fill", color: NativeTone.coral,
                                  title: language.t("backup:restore.title"))
                }
                .accessibilityIdentifier("data.restore")
            } header: {
                NativeCapsHeader(title: language.t("backup:restore.title"))
            }
            .listRowBackground(NativeStyle.card)
        }
        .listStyle(.insetGrouped)
        .scrollContentBackground(.hidden)
        .background(NativeStyle.canvas)
        .nativeTabBarRoom()
        .navigationTitle(language.t("settings:rows.data.label"))
    }
}

/// A quiet callout in the backup pages (the web's Note): an icon and a line,
/// the icon amber for a warning.
struct BackupNote: View {
    let symbol: String
    var warning = false
    let text: String

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            Image(systemName: symbol)
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(warning ? NativeStyle.warning : NativeStyle.tint)
                .frame(width: 20)
                .padding(.top, 1)
            Text(text).font(.subheadline)
        }
        .padding(.vertical, 2)
    }
}

// MARK: Export

@MainActor
struct ExportBackupView: View {
    @Bindable var model: ExportBackupModel
    @Environment(AppLanguage.self) private var language
    @State private var sharing = false

    var body: some View {
        List {
            Section {
                Text(language.t("backup:export.description")).font(.subheadline)
            }
            .listRowBackground(Color.clear)
            .listRowInsets(EdgeInsets(top: 0, leading: 4, bottom: 0, trailing: 4))

            if let failed = model.failed {
                Section { NativeNotice(text: failed, warning: true) }.listRowBackground(NativeStyle.card)
            }
            if let file = model.file {
                Section {
                    NativeNotice(text: language.t("ios:native.backup.ready"))
                    if model.sealed { Text(language.t("backup:export.keepSafe")).font(.footnote).foregroundStyle(.secondary) }
                    ShareLink(item: file) {
                        Label(file.lastPathComponent, systemImage: "square.and.arrow.up")
                    }
                    .accessibilityIdentifier("export.share")
                }
                .listRowBackground(NativeStyle.card)
            }

            Section {
                SecureField(language.t("backup:export.passwordPlaceholder"), text: $model.password)
                    .textContentType(.newPassword)
                    .disabled(model.busy)
                    .accessibilityIdentifier("export.password")
            } header: {
                NativeCapsHeader(title: language.t("backup:export.passwordLabel"))
            } footer: {
                let note = model.passwordNote
                Text(note.text).foregroundStyle(note.problem ? NativeStyle.negative : Color.secondary)
            }
            .listRowBackground(NativeStyle.card)

            if !model.password.isEmpty {
                Section {
                    SecureField(language.t("auth:password.confirm"), text: $model.confirm)
                        .textContentType(.newPassword)
                        .disabled(model.busy)
                        .accessibilityIdentifier("export.confirm")
                } header: {
                    NativeCapsHeader(title: language.t("auth:password.confirm"))
                } footer: {
                    if model.touched && model.mismatch {
                        Text(language.t("backup:export.mismatch")).foregroundStyle(NativeStyle.negative)
                    }
                }
                .listRowBackground(NativeStyle.card)
            }

            Section {
                if model.password.isEmpty {
                    BackupNote(symbol: "eye", warning: true, text: language.t("backup:export.plainWarning"))
                } else {
                    BackupNote(symbol: "key.fill", warning: true, text: language.t("backup:export.lostWarning"))
                }
                BackupNote(symbol: "info.circle", text: language.t("backup:export.groupsNote"))
            }
            .listRowBackground(NativeStyle.card)

            Section {
                VStack(spacing: 10) {
                    if let step = model.step {
                        HStack(spacing: 8) {
                            ProgressView()
                            Text(step + "…").font(.footnote).foregroundStyle(.secondary)
                        }
                    }
                    Button {
                        Task { if await model.export() { sharing = true } }
                    } label: {
                        Label(language.t(model.busy ? "backup:export.exporting" : "ios:native.backup.save"),
                              systemImage: "square.and.arrow.down")
                            .frame(maxWidth: .infinity)
                    }
                    .nativeGlassButton(prominent: true)
                    .disabled(model.busy)
                    .accessibilityIdentifier("export.save")
                }
                .padding(.vertical, 4)
            }
            .listRowBackground(Color.clear)
            .listRowInsets(EdgeInsets(top: 4, leading: 0, bottom: 4, trailing: 0))
        }
        .listStyle(.insetGrouped)
        .scrollContentBackground(.hidden)
        .background(NativeStyle.canvas)
        .scrollDismissesKeyboard(.interactively)
        .nativeTabBarRoom()
        .navigationTitle(language.t("backup:export.title"))
        .navigationBarTitleDisplayMode(.inline)
        .navigationBarBackButtonHidden(model.busy)
        .sheet(isPresented: $sharing) {
            if let file = model.file { ShareSheet(items: [file]) }
        }
        .sensoryFeedback(.success, trigger: model.file)
    }
}

// MARK: Restore

@MainActor
struct RestoreBackupView: View {
    @Bindable var model: RestoreBackupModel
    @Environment(AppLanguage.self) private var language
    @Environment(\.dismiss) private var dismiss
    @State private var picking = false

    var body: some View {
        List {
            switch model.step {
            case .choose: choose
            case .error: failed
            case .password: password
            case .review, .running: review
            case .done: done
            }
        }
        .listStyle(.insetGrouped)
        .scrollContentBackground(.hidden)
        .background(NativeStyle.canvas)
        .scrollDismissesKeyboard(.interactively)
        .nativeTabBarRoom()
        .navigationTitle(model.title)
        .navigationBarTitleDisplayMode(.inline)
        .navigationBarBackButtonHidden(model.running)
        .fileImporter(isPresented: $picking, allowedContentTypes: [.json]) { result in
            if case .success(let url) = result { Task { await model.read(url: url) } }
        }
        .sensoryFeedback(.success, trigger: model.step == .done)
    }

    private var choose: some View {
        Section {
            Text(language.t("backup:restore.chooseLead")).font(.subheadline).foregroundStyle(.secondary)
            Button {
                picking = true
            } label: {
                Label(language.t("backup:restore.chooseFile"), systemImage: "square.and.arrow.up").frame(maxWidth: .infinity)
            }
            .nativeGlassButton(prominent: true)
            .padding(.vertical, 4)
            .accessibilityIdentifier("restore.choose")
        }
        .listRowBackground(NativeStyle.card)
    }

    @ViewBuilder private var failed: some View {
        Section {
            BackupNote(symbol: "exclamationmark.shield.fill", warning: true, text: model.error ?? "")
        }
        .listRowBackground(NativeStyle.card)
        Section {
            Button {
                model.chooseAnother()
            } label: {
                Text(language.t("backup:restore.chooseAnother")).frame(maxWidth: .infinity)
            }
            .nativeGlassButton(prominent: true)
            .accessibilityIdentifier("restore.another")
        }
        .listRowBackground(Color.clear)
        .listRowInsets(EdgeInsets(top: 4, leading: 0, bottom: 4, trailing: 0))
    }

    @ViewBuilder private var password: some View {
        Section {
            Text(language.t("backup:restore.locked")).font(.subheadline).foregroundStyle(.secondary)
        }
        .listRowBackground(Color.clear)
        .listRowInsets(EdgeInsets(top: 0, leading: 4, bottom: 0, trailing: 4))
        Section {
            SecureField(language.t("auth:password.label"), text: $model.password)
                .onSubmit { Task { await model.unlock() } }
                .accessibilityIdentifier("restore.password")
        } header: {
            NativeCapsHeader(title: language.t("auth:password.label"))
        } footer: {
            if let error = model.passwordError { Text(error).foregroundStyle(NativeStyle.negative) }
        }
        .listRowBackground(NativeStyle.card)
        Section {
            Button {
                Task { await model.unlock() }
            } label: {
                Text(language.t(model.unlocking ? "backup:restore.unlocking" : "backup:restore.unlock")).frame(maxWidth: .infinity)
            }
            .nativeGlassButton(prominent: true)
            .disabled(model.password.isEmpty || model.unlocking)
            .accessibilityIdentifier("restore.unlock")
        }
        .listRowBackground(Color.clear)
        .listRowInsets(EdgeInsets(top: 4, leading: 0, bottom: 4, trailing: 0))
    }

    @ViewBuilder private var review: some View {
        if let stopped = model.stopped {
            Section {
                NativeNotice(text: language.t("backup:restore.stopped"), warning: true)
                Text(stopped).font(.footnote).foregroundStyle(.secondary)
            }
            .listRowBackground(NativeStyle.card)
        }
        Section {
            if model.running {
                VStack(alignment: .leading, spacing: 8) {
                    HStack {
                        Text(model.progress.label + "…").font(.subheadline)
                        Spacer(minLength: 8)
                        if model.progress.total > 0 {
                            Text(verbatim: "\(model.progress.done) / \(model.progress.total)")
                                .font(.footnote).foregroundStyle(.secondary).monospacedDigit()
                        }
                    }
                    if model.progress.total > 0 {
                        ProgressView(value: Double(model.progress.done), total: Double(model.progress.total))
                    } else {
                        ProgressView().frame(maxWidth: .infinity, alignment: .leading)
                    }
                }
                .accessibilityLabel(language.t("backup:restore.progress"))
            }
            if let made = model.made { Text(made).font(.subheadline).foregroundStyle(.secondary) }
            if let note = model.currencyNote { Text(note).font(.subheadline).foregroundStyle(.secondary) }
            LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 10), count: 3), spacing: 10) {
                ForEach(model.contents, id: \.id) { item in
                    VStack(alignment: .leading, spacing: 4) {
                        Text(verbatim: "\(item.count)")
                            .font(.title3.weight(.semibold))
                            .monospacedDigit()
                            .foregroundStyle(item.count > 0 ? Color.primary : Color.secondary)
                        Text(item.label).font(.caption).foregroundStyle(.secondary).lineLimit(2)
                    }
                    .frame(maxWidth: .infinity, minHeight: 64, alignment: .topLeading)
                    .padding(10)
                    .background(Theme.Colors.subtle, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                }
            }
            .padding(.vertical, 4)
            if let shares = model.groupShares { BackupNote(symbol: "info.circle", text: shares) }
            BackupNote(symbol: "info.circle", text: language.t("backup:restore.onlyMissing"))
        }
        .listRowBackground(NativeStyle.card)
        Section {
            Button {
                Task { await model.restore() }
            } label: {
                Label(language.t(model.running ? "backup:restore.restoring" : "backup:restore.restore"),
                      systemImage: "square.and.arrow.up")
                    .frame(maxWidth: .infinity)
            }
            .nativeGlassButton(prominent: true)
            .disabled(model.running)
            .accessibilityIdentifier("restore.restore")
        }
        .listRowBackground(Color.clear)
        .listRowInsets(EdgeInsets(top: 4, leading: 0, bottom: 4, trailing: 0))
    }

    @ViewBuilder private var done: some View {
        if let summary = model.summary {
            Section {
                VStack(spacing: 10) {
                    Image(systemName: "checkmark")
                        .font(.system(size: 26, weight: .bold))
                        .foregroundStyle(NativeStyle.positive)
                        .frame(width: 56, height: 56)
                        .background(NativeStyle.positive.opacity(0.14), in: RoundedRectangle(cornerRadius: 16, style: .continuous))
                    Text(summary.added).font(.headline).multilineTextAlignment(.center)
                    if let skipped = summary.skipped {
                        Text(skipped).font(.subheadline).foregroundStyle(.secondary).multilineTextAlignment(.center)
                    }
                    if let kept = summary.kept {
                        Text(kept).font(.subheadline).foregroundStyle(.secondary).multilineTextAlignment(.center)
                    }
                }
                .frame(maxWidth: .infinity)
                .padding(.vertical, 12)
            }
            .listRowBackground(NativeStyle.card)
        }
        Section {
            Button {
                dismiss()
            } label: {
                Text(language.t("common:actions.done")).frame(maxWidth: .infinity)
            }
            .nativeGlassButton(prominent: true)
            .accessibilityIdentifier("restore.done")
        }
        .listRowBackground(Color.clear)
        .listRowInsets(EdgeInsets(top: 4, leading: 0, bottom: 4, trailing: 0))
    }
}

/// Export or Restore with its model made once (so a typed password or a
/// picked file survives the page's refreshes).
@MainActor
struct BackupHost: View {
    enum Page { case export, restore }
    let page: Page
    let data: DataLayer
    let userId: String
    let email: String?
    @State private var exporter: ExportBackupModel?
    @State private var restorer: RestoreBackupModel?

    var body: some View {
        Group {
            if let exporter {
                ExportBackupView(model: exporter)
            } else if let restorer {
                RestoreBackupView(model: restorer)
            } else {
                NativeLoading().background(NativeStyle.canvas)
            }
        }
        .onAppear {
            switch page {
            case .export: if exporter == nil { exporter = ExportBackupModel(data: data, userId: userId) }
            case .restore: if restorer == nil { restorer = RestoreBackupModel(data: data, userId: userId, email: email) }
            }
        }
    }
}
