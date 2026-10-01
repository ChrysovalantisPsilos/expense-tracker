// Settings › Privacy (PrivacyModel): the GDPR rights, each with the way to
// use it here, in the web's order: download your data (one JSON file to
// share or save), correct it (your Account; your entries in Activity),
// delete the account (Security), a privacy request (its own page) or an
// email; then the message switches (consent), the two rights with nothing
// to press, and the consent history.
import SwiftUI

@MainActor
struct PrivacyView: View {
    let model: PrivacyModel
    let preferences: PreferencesModel
    let openActivity: () -> Void
    @Environment(AppLanguage.self) private var language

    var body: some View {
        List {
            if let message = model.message {
                Section { NativeNotice(text: message, warning: model.warning) }.listRowBackground(NativeStyle.card)
            }
            Section {
                Text(intro).font(.subheadline)
            }
            .listRowBackground(Color.clear)

            right("download", symbol: "arrow.down.doc.fill", color: SettingsRow.blue) {
                Button {
                    Task { await model.download() }
                } label: {
                    HStack {
                        Text(language.t("privacy:settings.download.button"))
                        if model.busy { Spacer(); ProgressView() }
                    }
                }
                .disabled(model.busy)
                .accessibilityIdentifier("privacy.download")
                if let file = model.exportFile {
                    ShareLink(item: file) {
                        Label(file.lastPathComponent, systemImage: "square.and.arrow.up")
                    }
                    .accessibilityIdentifier("privacy.share")
                }
            }
            right("correct", symbol: "pencil", color: SettingsRow.amber) {
                NavigationLink(value: AppRoute.account) { Text(language.t("privacy:settings.correct.profile")) }
                Button(language.t("privacy:settings.correct.transactions"), action: openActivity)
            }
            right("delete", symbol: "trash.fill", color: SettingsRow.coral) {
                if !model.isDemo {
                    NavigationLink(value: AppRoute.security) {
                        Text(language.t("privacy:settings.delete.go")).foregroundStyle(NativeStyle.negative)
                    }
                }
            }
            right("request", symbol: "envelope.badge.shield.half.filled", color: SettingsRow.purple) {
                if !model.isDemo {
                    NavigationLink(value: AppRoute.privacyRequest) { Text(language.t("privacy:settings.request.send")) }
                        .accessibilityIdentifier("privacy.request")
                }
                if let mail = URL(string: "mailto:\(model.privacyEmail)") {
                    Link(language.t("privacy:settings.request.email"), destination: mail)
                }
            }

            if preferences.state == .loaded {
                MessageToggles(model: preferences, header: language.t("privacy:settings.consent")) {
                    Task { await model.loadConsents() }
                }
            }

            right("automated", symbol: "cpu", color: SettingsRow.slate) { EmptyView() }
            right("complain", symbol: "building.columns.fill", color: SettingsRow.teal) { EmptyView() }

            Section {
                if let consents = model.consents {
                    if consents.isEmpty {
                        Text(language.t("privacy:settings.history.empty")).foregroundStyle(.secondary)
                    }
                    ForEach(consents) { line in
                        VStack(alignment: .leading, spacing: 2) {
                            Text(line.text).font(.subheadline)
                            Text(line.when).font(.caption).foregroundStyle(.secondary)
                        }
                        .padding(.vertical, 2)
                    }
                } else {
                    ProgressView().frame(maxWidth: .infinity)
                }
            } header: {
                NativeCapsHeader(title: language.t("privacy:settings.history.title"))
            }
            .listRowBackground(NativeStyle.card)
        }
        .listStyle(.insetGrouped)
        .scrollContentBackground(.hidden)
        .background(NativeStyle.canvas)
        .nativeTabBarRoom()
        .navigationTitle(language.t("privacy:settings.title"))
        .task {
            await model.load()
            await preferences.load()
        }
    }

    /// One right: its title and article, what it means, and how to use it here.
    private func right<Actions: View>(_ id: String, symbol: String, color: Color,
                                      @ViewBuilder actions: () -> Actions) -> some View {
        Section {
            HStack(alignment: .top, spacing: 14) {
                NativeIconTile(symbol: symbol, color: color)
                VStack(alignment: .leading, spacing: 4) {
                    Text(language.t("privacy:settings.\(id).title")).font(.subheadline.weight(.semibold))
                    Text(language.t("privacy:settings.articles.\(id)")).font(.caption).foregroundStyle(.secondary)
                    Text(language.t("privacy:settings.\(id).text")).font(.footnote).foregroundStyle(.secondary)
                }
            }
            .padding(.vertical, 4)
            actions()
        }
        .listRowBackground(NativeStyle.card)
    }

    /// The introduction as one sentence: the privacy address where it says <email/>.
    private var intro: String {
        plain(SettingsFigures.rich(language.t("privacy:settings.intro")))
    }

    private func plain(_ nodes: JSONValue) -> String {
        (nodes.arrayValue ?? []).map { node -> String in
            if let text = node.stringValue { return text }
            if node["tag"]?.stringValue == "email" { return model.privacyEmail }
            return plain(node["children"] ?? [])
        }
        .joined()
    }
}

/// Settings › Privacy › Send a request (the web's PrivacyRequestPage): what
/// it is about, your words, Send; back to Privacy once it's sent.
@MainActor
struct PrivacyRequestView: View {
    @Bindable var model: PrivacyModel
    @Environment(AppLanguage.self) private var language
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        List {
            if let message = model.message, model.warning {
                Section { NativeNotice(text: message, warning: true) }.listRowBackground(NativeStyle.card)
            }
            Section {
                Picker(language.t("privacy:request.about"), selection: $model.kind) {
                    ForEach(model.requestKinds, id: \.self) { kind in
                        Text(language.t("privacy:request.kinds.\(kind)")).tag(kind)
                    }
                }
                .pickerStyle(.inline)
                .labelsHidden()
                .accessibilityIdentifier("request.kind")
            } header: {
                NativeCapsHeader(title: language.t("privacy:request.about"))
            }
            .listRowBackground(NativeStyle.card)
            Section {
                TextField(language.t("privacy:request.placeholder"), text: $model.requestText, axis: .vertical)
                    .lineLimit(5...12)
                    .accessibilityIdentifier("request.text")
            } header: {
                NativeCapsHeader(title: language.t("privacy:request.yourRequest"))
            } footer: {
                Text(language.t("privacy:request.help"))
            }
            .listRowBackground(NativeStyle.card)
            Section {
                Button {
                    Task { if await model.sendRequest() { dismiss() } }
                } label: {
                    HStack {
                        Text(language.t("privacy:request.send")).fontWeight(.semibold)
                        if model.busy { Spacer(); ProgressView() }
                    }
                }
                .disabled(model.busy)
                .accessibilityIdentifier("request.send")
            }
            .listRowBackground(NativeStyle.card)
        }
        .listStyle(.insetGrouped)
        .scrollContentBackground(.hidden)
        .background(NativeStyle.canvas)
        .scrollDismissesKeyboard(.interactively)
        .nativeTabBarRoom()
        .navigationTitle(language.t("privacy:request.title"))
        .onAppear { model.startRequest() }
    }
}

/// Settings › What's new: every release, newest first, each page's title and words.
@MainActor
struct WhatsNewView: View {
    @Environment(AppLanguage.self) private var language

    var body: some View {
        List {
            Section {
                Text(language.t("whatsnew:description")).font(.subheadline).foregroundStyle(.secondary)
            }
            .listRowBackground(Color.clear)
            ForEach(SettingsFigures.whatsNew()) { release in
                Section {
                    ForEach(Array(release.pages.enumerated()), id: \.offset) { _, page in
                        VStack(alignment: .leading, spacing: 4) {
                            Text(page.title).font(.subheadline.weight(.semibold))
                            Text(page.body).font(.footnote).foregroundStyle(.secondary)
                        }
                        .padding(.vertical, 2)
                    }
                } header: {
                    NativeCapsHeader(title: release.date)
                }
                .listRowBackground(NativeStyle.card)
            }
        }
        .listStyle(.insetGrouped)
        .scrollContentBackground(.hidden)
        .background(NativeStyle.canvas)
        .nativeTabBarRoom()
        .navigationTitle(language.t("settings:rows.whatsNew.label"))
        // The releases are worded in the language on screen.
        .id(language.current)
    }
}
