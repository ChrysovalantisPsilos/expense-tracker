// The More tab, after the web's More page: "More", then Money (Insights,
// Recurring: the pages the app has) and Account (Settings), each a card of
// links. Settings, after the web's: Profile (your picture, name and email),
// Preferences (Appearance, Language: each its own page of choices), Sign
// out, and the build (version, which Supabase project a Dev build talks to).
import SwiftUI

@MainActor
struct MoreView: View {
    let config: AppConfig
    let session: SessionStore
    let user: AuthUser
    /// Where a language chosen here is saved for the account (ProfileLanguage).
    let profiles: ProfileRepository
    /// Open one of More's pages.
    let open: (ShellRoute) -> Void
    @Environment(AppLanguage.self) private var language

    var body: some View {
        Page {
            PageHeader(title: language.t("shell:nav.more"))
            NavList(label: language.t("shell:more.money")) {
                NavRow(icon: .trendingUp, label: language.t("shell:nav.insights"), description: language.t("shell:more.insights")) {
                    open(.insights)
                }
                .accessibilityIdentifier("more.insights")
                NavRow(icon: .repeat, label: language.t("shell:nav.recurring"), description: language.t("shell:more.recurring")) {
                    open(.recurring)
                }
                .accessibilityIdentifier("more.recurring")
            }
            NavList(label: language.t("shell:more.account")) {
                NavRow(icon: .settings, label: language.t("shell:nav.settings"), description: language.t("shell:more.settings")) {
                    open(.settings)
                }
                .accessibilityIdentifier("more.settings")
            }
        }
    }

    /// "0.1.0 (1)" from Info.plist.
    static var version: String {
        let info = Bundle.main.infoDictionary ?? [:]
        let short = info["CFBundleShortVersionString"] as? String ?? "0"
        let build = info["CFBundleVersion"] as? String ?? "0"
        return "\(short) (\(build))"
    }
}

/// Settings: what the app can set so far, laid out as the web's Settings.
@MainActor
struct SettingsView: View {
    let config: AppConfig
    let session: SessionStore
    let user: AuthUser
    /// The profile's name and initials (the frame's).
    let name: String
    let initials: String
    let back: () -> Void
    let open: (ShellRoute) -> Void
    @Environment(AppLanguage.self) private var language

    var body: some View {
        Page {
            PageHeader(title: language.t("settings:title"), back: back)
            NavList(label: language.t("settings:sections.profile")) {
                NavRow(label: name.isEmpty ? (user.email ?? "") : name, description: name.isEmpty ? nil : user.email,
                       chevron: false, action: {}) {
                    ShellAvatar(initials: initials, size: 48)
                }
            }
            NavList(label: language.t("settings:sections.preferences")) {
                NavRow(icon: .palette, label: language.t("settings:rows.appearance.label"),
                       description: language.t("settings:rows.appearance.desc")) { open(.appearance) }
                    .accessibilityIdentifier("settings.appearance")
                NavRow(icon: .languages, label: language.t("settings:rows.language.label"),
                       description: language.t("settings:rows.language.desc")) { open(.language) }
                    .accessibilityIdentifier("settings.language")
            }
            NavList {
                NavRow(icon: .logOut, label: language.t("settings:rows.signOut.label"), chevron: false) {
                    Task { await session.signOut() }
                }
                .accessibilityIdentifier("more.signOut")
            }
            VStack(alignment: .leading, spacing: Theme.Space.s1) {
                SectionLabel(text: language.t("ios:more.about"))
                Text(language.t("ios:more.version", ["version": .string(MoreView.version)]))
                    .kitText(14, color: Theme.Colors.textMuted)
                if config.environment == .dev {
                    Text(language.t("ios:more.devProject")).kitText(12, color: Theme.Colors.warning)
                }
            }
            .padding(.horizontal, Theme.Space.s1)
        }
    }
}

/// Settings › Language (LanguageSettings): Follow my device (and what it is
/// now), English, Ελληνικά; a choice applies at once and is saved to the
/// profile.
@MainActor
struct LanguageSettingsView: View {
    let profiles: ProfileRepository
    let back: () -> Void
    @Environment(AppLanguage.self) private var language

    var body: some View {
        Page {
            PageHeader(title: language.t("settings:language.title"), eyebrow: language.t("settings:title"), back: back)
            Text(language.t("settings:language.description")).kitText(14, color: Theme.Colors.textMuted)
            ChoiceList(options: [AppLanguage.system] + AppLanguage.languages, value: language.preference) { value in
                guard value != language.preference else { return }
                language.preference = value
                Task { await ProfileLanguage.save(language, profiles: profiles) }
            } row: { value in
                if value == AppLanguage.system {
                    VStack(alignment: .leading, spacing: 2) {
                        HStack(spacing: Theme.Space.s2) {
                            LucideIcon(icon: .smartphone, size: 16)
                            Text(language.t("settings:language.system"))
                        }
                        Text(language.t("settings:language.systemNow",
                                        ["language": .string(AppLanguage.nativeNames[language.deviceLanguage] ?? "")]))
                            .kitText(14, color: Theme.Colors.textMuted)
                    }
                } else {
                    Text(AppLanguage.nativeNames[value] ?? value)
                }
            }
        }
    }
}

/// Settings › Appearance (AppearanceSettings): Light, Dark or System.
@MainActor
struct AppearanceSettingsView: View {
    let back: () -> Void
    @Environment(AppLanguage.self) private var language
    @Environment(AppAppearance.self) private var appearance

    var body: some View {
        Page {
            PageHeader(title: language.t("settings:appearance.title"), eyebrow: language.t("settings:title"), back: back)
            Text(language.t("settings:appearance.description")).kitText(14, color: Theme.Colors.textMuted)
            ChoiceList(options: ["light", "dark", "system"], value: appearance.stored ?? "system") { value in
                appearance.set(value == "system" ? nil : value)
            } row: { value in
                HStack(spacing: Theme.Space.s2) {
                    LucideIcon(icon: value == "light" ? .sun : value == "dark" ? .moon : .monitor, size: 16)
                    Text(language.t("settings:appearance.\(value)"))
                }
            }
        }
    }
}

/// A card of choices (the settings' pickers): each a full-width row, the
/// picked one on sand with a check.
struct ChoiceList<Row: View>: View {
    let options: [String]
    let value: String
    let pick: (String) -> Void
    @ViewBuilder var row: (String) -> Row

    var body: some View {
        VStack(spacing: Theme.Space.s1) {
            ForEach(options, id: \.self) { option in
                let on = option == value
                Button { pick(option) } label: {
                    HStack(spacing: Theme.Space.s3) {
                        row(option)
                            .kitText(16, .semibold)
                            .frame(maxWidth: .infinity, alignment: .leading)
                        if on { LucideIcon(icon: .check, size: 18).foregroundStyle(Theme.Colors.accentFg) }
                    }
                    .padding(.horizontal, Theme.Space.s3)
                    .padding(.vertical, Theme.Space.s3)
                    .background(on ? Theme.Colors.subtle : Color.clear)
                    .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.lg, style: .continuous))
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityAddTraits(on ? .isSelected : [])
            }
        }
        .padding(Theme.Space.s2)
        .panelSurface()
    }
}
