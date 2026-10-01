// More, as an iOS Settings-style list: you at the top (your profile and
// settings), then the pages the tabs don't hold: Money (Budgets,
// Recurring) and Insights. Savings, Plan, Meal vouchers, Your salary and
// Categories join here as their pages are built. Settings holds your
// profile, the language, the Face ID lock, the build and Sign out; light
// and dark follow the phone.
import SwiftUI

@MainActor
struct MoreView: View {
    let name: String
    let email: String
    let initials: String
    let chrome: PageChrome
    @Environment(AppLanguage.self) private var language

    var body: some View {
        List {
            Section {
                NavigationLink(value: AppRoute.settings) {
                    HStack(spacing: 14) {
                        Text(initials)
                            .font(.system(size: 22, weight: .semibold))
                            .foregroundStyle(Color.white)
                            .frame(width: 58, height: 58)
                            .background(NativeStyle.solid, in: Circle())
                        VStack(alignment: .leading, spacing: 2) {
                            Text(name.isEmpty ? email : name).font(.title3.weight(.semibold)).lineLimit(1)
                            if !name.isEmpty { Text(email).font(.subheadline).foregroundStyle(.secondary).lineLimit(1) }
                            Text(language.t("shell:more.settings")).font(.footnote).foregroundStyle(.secondary).lineLimit(2)
                        }
                    }
                    .padding(.vertical, 6)
                }
                .accessibilityIdentifier("more.settings")
            }
            .listRowBackground(NativeStyle.card)

            Section {
                row(.budgets, symbol: "chart.pie.fill", color: NativeStyle.coral, title: "shell:nav.budgets", id: "more.budgets")
                row(.recurring, symbol: "arrow.triangle.2.circlepath", color: Color(hex: 0x8558D0),
                    title: "shell:nav.recurring", subtitle: "shell:more.recurring", id: "more.recurring")
            } header: {
                NativeCapsHeader(title: language.t("shell:more.money"))
            }
            .listRowBackground(NativeStyle.card)

            Section {
                row(.insights, symbol: "chart.xyaxis.line", color: Color(hex: 0xD24D8A), title: "shell:nav.insights",
                    subtitle: "shell:more.insights", id: "more.insights")
            } header: {
                NativeCapsHeader(title: language.t("insights:title"))
            }
            .listRowBackground(NativeStyle.card)
        }
        .listStyle(.insetGrouped)
        .listSectionSpacing(20)
        .scrollContentBackground(.hidden)
        .background(NativeStyle.canvas)
        .nativeTabBarRoom()
        .navigationTitle(language.t("shell:nav.more"))
        .pageChrome(chrome)
    }

    private func row(_ route: AppRoute, symbol: String, color: Color, title: String, subtitle: String? = nil,
                     id: String) -> some View {
        NavigationLink(value: route) {
            HStack(spacing: 14) {
                NativeIconTile(symbol: symbol, color: color)
                VStack(alignment: .leading, spacing: 1) {
                    Text(language.t(title))
                    if let subtitle { Text(language.t(subtitle)).font(.footnote).foregroundStyle(.secondary) }
                }
            }
        }
        .accessibilityIdentifier(id)
    }

    /// "0.1.0 (1)" from Info.plist.
    static var version: String {
        let info = Bundle.main.infoDictionary ?? [:]
        let short = info["CFBundleShortVersionString"] as? String ?? "0"
        let build = info["CFBundleVersion"] as? String ?? "0"
        return "\(short) (\(build))"
    }
}

/// Settings: your profile, Language, the Face ID lock, the build, Sign out.
@MainActor
struct SettingsView: View {
    let config: AppConfig
    let session: SessionStore
    let lock: AppLock
    let name: String
    let email: String
    let initials: String
    @Environment(AppLanguage.self) private var language

    var body: some View {
        List {
            Section {
                HStack(spacing: 14) {
                    Text(initials)
                        .font(.system(size: 18, weight: .semibold))
                        .foregroundStyle(Color.white)
                        .frame(width: 48, height: 48)
                        .background(NativeStyle.solid, in: Circle())
                    VStack(alignment: .leading, spacing: 2) {
                        Text(name.isEmpty ? email : name).font(.headline)
                        if !name.isEmpty { Text(email).font(.subheadline).foregroundStyle(.secondary) }
                    }
                }
                .padding(.vertical, 4)
            } header: {
                NativeCapsHeader(title: language.t("settings:sections.profile"))
            }
            .listRowBackground(NativeStyle.card)

            Section {
                NavigationLink(value: AppRoute.language) {
                    HStack(spacing: 14) {
                        NativeIconTile(symbol: "globe", color: Color(hex: 0x3A78D4))
                        Text(language.t("settings:rows.language.label"))
                        Spacer()
                        Text(languageValue).foregroundStyle(.secondary)
                    }
                }
                .accessibilityIdentifier("settings.language")
                Toggle(isOn: Binding(get: { lock.enabled }, set: { on in
                    Task { await lock.set(on, reason: language.t("ios:native.lock.reason")) }
                })) {
                    HStack(spacing: 14) {
                        NativeIconTile(symbol: "faceid", color: Color(hex: 0x2E9B62))
                        Text(language.t("ios:native.lock.setting"))
                    }
                }
                .tint(NativeStyle.positive)
                .disabled(!lock.available && !lock.enabled)
                .accessibilityIdentifier("settings.lock")
            } header: {
                NativeCapsHeader(title: language.t("settings:sections.preferences"))
            } footer: {
                Text(language.t(lock.available || lock.enabled ? "ios:native.lock.settingNote" : "ios:native.lock.unavailable"))
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
    }

    /// What Language shows: "System" or the language's own name.
    private var languageValue: String {
        language.preference == AppLanguage.system
            ? language.t("settings:language.system")
            : AppLanguage.nativeNames[language.preference] ?? language.preference
    }
}

/// Settings › Language (LanguageSettings): Follow my device (and what it is
/// now), English, Ελληνικά; a choice applies at once and is saved to the profile.
@MainActor
struct LanguageView: View {
    let profiles: ProfileRepository
    @Environment(AppLanguage.self) private var language

    var body: some View {
        List {
            Section {
                ForEach([AppLanguage.system] + AppLanguage.languages, id: \.self) { value in
                    Button {
                        guard value != language.preference else { return }
                        language.preference = value
                        Task { await ProfileLanguage.save(language, profiles: profiles) }
                    } label: {
                        HStack {
                            VStack(alignment: .leading, spacing: 2) {
                                Text(value == AppLanguage.system ? language.t("settings:language.system")
                                     : AppLanguage.nativeNames[value] ?? value)
                                if value == AppLanguage.system {
                                    Text(language.t("settings:language.systemNow",
                                                    ["language": .string(AppLanguage.nativeNames[language.deviceLanguage] ?? "")]))
                                        .font(.footnote)
                                        .foregroundStyle(.secondary)
                                }
                            }
                            Spacer()
                            if value == language.preference {
                                Image(systemName: "checkmark").fontWeight(.semibold).foregroundStyle(NativeStyle.tint)
                            }
                        }
                        .foregroundStyle(Color.primary)
                    }
                    .accessibilityAddTraits(value == language.preference ? .isSelected : [])
                }
            } footer: {
                Text(language.t("settings:language.description"))
            }
            .listRowBackground(NativeStyle.card)
        }
        .listStyle(.insetGrouped)
        .scrollContentBackground(.hidden)
        .background(NativeStyle.canvas)
        .nativeTabBarRoom()
        .navigationTitle(language.t("settings:language.title"))
    }
}
