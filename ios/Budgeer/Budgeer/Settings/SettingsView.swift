// Settings, as iOS's own Settings: you at the top (your picture, name and
// email; Account), then the web's groups in its order. Preferences:
// Categories, Monthly spending, Meal vouchers, Notifications, Appearance, Language, AI
// helpers and this phone's Face ID lock (its page: the switch and the app PIN). Privacy & security: Security,
// Privacy, and the Privacy Notice and Terms of Use (the website's pages in
// Safari). Help: Help & FAQ (native), What's new, Take the tour again, the
// status page (in Safari), Contact support (Mail). Then Sign out and the version. Meal vouchers sits
// after Monthly spending, as on the web. The web's Import rules and Your
// data rows join when their pages are built here (import with its rules and
// backups); the live/test site switch is the website's own.
import SwiftUI

@MainActor
struct SettingsView: View {
    let config: AppConfig
    let session: SessionStore
    let account: AccountModel
    let email: String
    /// "Take the tour again" (the tour, back here when it ends).
    var startTour: (() -> Void)? = nil
    @Environment(AppLanguage.self) private var language
    @AppStorage(AppAppearance.key) private var appearance = AppAppearance.system
    @State private var web: WebPage?

    var body: some View {
        List {
            Section {
                NavigationLink(value: AppRoute.account) {
                    HStack(spacing: 14) {
                        if let avatar = account.avatar {
                            NativeAvatar(avatar: avatar, size: 52)
                        }
                        VStack(alignment: .leading, spacing: 2) {
                            Text(account.savedName.isEmpty ? language.t("settings:yourName") : account.savedName)
                                .font(.headline)
                                .lineLimit(1)
                            Text(email).font(.subheadline).foregroundStyle(.secondary).lineLimit(1)
                        }
                    }
                    .padding(.vertical, 4)
                }
                .accessibilityIdentifier("settings.account")
            } header: {
                NativeCapsHeader(title: language.t("settings:sections.profile"))
            }
            .listRowBackground(NativeStyle.card)

            if account.isDemo {
                Section { DemoNotice() }.listRowBackground(NativeStyle.card)
            }

            Section {
                SettingsRow(route: .categoryList, symbol: "tag.fill", color: NativeTone.coral,
                            title: language.t("settings:rows.categories.label"), id: "settings.categories")
                SettingsRow(route: .spending, symbol: "calendar", color: NativeTone.coral,
                            title: language.t("settings:rows.spending.label"), id: "settings.spending")
                SettingsRow(route: .voucherSetup, symbol: "ticket.fill", color: NativeTone.coral,
                            title: language.t("settings:rows.vouchers.label"), id: "settings.vouchers")
                SettingsRow(route: .messages, symbol: "bell.badge.fill", color: NativeTone.coral,
                            title: language.t("settings:rows.notifications.label"), id: "settings.notifications")
                SettingsRow(route: .appearance, symbol: "circle.lefthalf.filled", color: NativeTone.coral,
                            title: language.t("settings:rows.appearance.label"),
                            value: language.t("settings:appearance.\(appearance)"), id: "settings.appearance")
                SettingsRow(route: .language, symbol: "globe", color: NativeTone.coral,
                            title: language.t("settings:rows.language.label"), value: languageValue, id: "settings.language")
                SettingsRow(route: .aiHelpers, symbol: "sparkles", color: NativeTone.coral,
                            title: language.t("settings:rows.ai.label"), id: "settings.ai")
                SettingsRow(route: .faceLock, symbol: "faceid", color: NativeTone.coral,
                            title: language.t("ios:native.lock.setting"), id: "settings.faceLock")
            } header: {
                NativeCapsHeader(title: language.t("settings:sections.preferences"))
            }
            .listRowBackground(NativeStyle.card)

            Section {
                SettingsRow(route: .security, symbol: "lock.shield.fill", color: NativeTone.sand,
                            title: language.t("settings:rows.security.label"), id: "settings.security")
                SettingsRow(route: .privacy, symbol: "hand.raised.fill", color: NativeTone.sand,
                            title: language.t("settings:rows.privacy.label"), id: "settings.privacy")
                    .tourTarget("settings-privacy")
                webRow("/privacy", symbol: "doc.text.fill", color: NativeTone.sand,
                       title: language.t("settings:rows.privacyNotice.label"), id: "settings.privacyNotice")
                webRow("/terms", symbol: "checkmark.seal.fill", color: NativeTone.sand,
                       title: language.t("settings:rows.terms.label"), id: "settings.terms")
            } header: {
                NativeCapsHeader(title: language.t("settings:sections.privacy"))
            }
            .listRowBackground(NativeStyle.card)

            Section {
                SettingsRow(route: .help(nil), symbol: "questionmark.circle.fill", color: NativeTone.amber,
                            title: language.t("settings:rows.help.label"), id: "settings.help")
                SettingsRow(route: .whatsNew, symbol: "sparkle", color: NativeTone.amber,
                            title: language.t("settings:rows.whatsNew.label"), id: "settings.whatsNew")
                if let startTour {
                    Button(action: startTour) {
                        SettingsLabel(symbol: "safari.fill", color: NativeTone.amber,
                                      title: language.t("settings:rows.tour.label"))
                    }
                    .foregroundStyle(Color.primary)
                    .accessibilityHint(language.t("settings:rows.tour.desc"))
                    .accessibilityIdentifier("settings.tour")
                }
                if let contact = SettingsFigures.contact() {
                    webRow(contact.status, symbol: "waveform.path.ecg", color: NativeTone.amber,
                           title: language.t("settings:rows.status.label"), id: "settings.status")
                    if let mail = URL(string: "mailto:\(contact.support)") {
                        Link(destination: mail) {
                            SettingsLabel(symbol: "envelope.fill", color: NativeTone.amber,
                                          title: language.t("settings:rows.contact.label"), value: contact.support)
                        }
                        .foregroundStyle(Color.primary)
                        .accessibilityIdentifier("settings.contact")
                    }
                }
            } header: {
                NativeCapsHeader(title: language.t("settings:sections.help"))
            }
            .listRowBackground(NativeStyle.card)

            Section {
                Button(role: .destructive) {
                    Task { await session.signOut() }
                } label: {
                    Text(language.t("settings:rows.signOut.label")).frame(maxWidth: .infinity)
                }
                .accessibilityIdentifier("more.signOut")
            } footer: {
                VStack(spacing: 4) {
                    Text(language.t("ios:more.version", ["version": .string(MoreView.version)]))
                    if config.environment == .dev {
                        Text(language.t("ios:more.devProject")).foregroundStyle(NativeStyle.warning)
                    }
                }
                .frame(maxWidth: .infinity)
                .padding(.top, 8)
            }
            .listRowBackground(NativeStyle.card)
        }
        .listStyle(.insetGrouped)
        .scrollContentBackground(.hidden)
        .background(NativeStyle.canvas)
        .nativeTabBarRoom()
        .navigationTitle(language.t("settings:title"))
        .task { if account.state == .loading { await account.load() } }
        .sheet(item: $web) { page in SafariView(url: page.url).ignoresSafeArea() }
    }

    /// What Language shows: "Follow my device" or the language's own name.
    private var languageValue: String {
        language.preference == AppLanguage.system
            ? language.t("settings:language.system")
            : AppLanguage.nativeNames[language.preference] ?? language.preference
    }

    /// A row that opens a website page in Safari.
    private func webRow(_ address: String, symbol: String, color: Color, title: String, id: String) -> some View {
        Button {
            web = WebPage(address, site: config.siteURL)
        } label: {
            SettingsLabel(symbol: symbol, color: color, title: title, external: true)
        }
        .foregroundStyle(Color.primary)
        .accessibilityIdentifier(id)
    }
}

/// A Settings row that pushes a page: its tile, its name and, when it has
/// one, what it is set to.
struct SettingsRow: View {
    let route: AppRoute
    let symbol: String
    let color: Color
    let title: String
    var value: String? = nil
    let id: String

    var body: some View {
        NavigationLink(value: route) {
            SettingsLabel(symbol: symbol, color: color, title: title, value: value)
        }
        .accessibilityIdentifier(id)
    }
}

/// A Settings row's face: the tile, the name, the value; an arrow for a page that opens outside.
struct SettingsLabel: View {
    let symbol: String
    let color: Color
    let title: String
    var value: String? = nil
    var external = false

    var body: some View {
        HStack(spacing: 14) {
            NativeIconTile(symbol: symbol, color: color)
            Text(title)
            Spacer(minLength: 8)
            if let value { Text(value).foregroundStyle(.secondary).lineLimit(1) }
            if external {
                Image(systemName: "arrow.up.right")
                    .font(.footnote.weight(.semibold))
                    .foregroundStyle(.tertiary)
            }
        }
    }
}

/// The shared demo account's note (DemoNotice): what is off there, then the nightly reset.
struct DemoNotice: View {
    var text: String? = nil
    @Environment(AppLanguage.self) private var language

    var body: some View {
        HStack(alignment: .top, spacing: 14) {
            NativeIconTile(symbol: "testtube.2", color: NativeTone.amber)
            VStack(alignment: .leading, spacing: 4) {
                Text(language.t("settings:demo.title")).font(.subheadline.weight(.semibold))
                if let text { Text(text).font(.subheadline) }
                Text(language.t("settings:demo.reset")).font(.footnote).foregroundStyle(.secondary)
            }
        }
        .padding(.vertical, 4)
    }
}
