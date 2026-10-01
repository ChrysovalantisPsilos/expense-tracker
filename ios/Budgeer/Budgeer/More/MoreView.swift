// The More tab, after the web's: Money (Insights, Recurring: each a page
// the tab pushes), the account (who is signed in, sign out), the language
// (the web's "Follow my device" / English / Ελληνικά) and the build
// (version, which Supabase project a Dev build talks to). Settings proper
// come with their phase.
import SwiftUI

@MainActor
struct MoreView: View {
    let config: AppConfig
    let session: SessionStore
    let user: AuthUser
    /// The Money section's pages, in the web's order.
    var pages: [MorePage] = []
    @Environment(AppLanguage.self) private var language

    var body: some View {
        @Bindable var language = language
        NavigationStack {
            List {
                if !pages.isEmpty {
                    Section(language.t("shell:more.money")) {
                        ForEach(pages) { page in
                            NavigationLink {
                                page.view
                            } label: {
                                HStack(spacing: Theme.Space.s3) {
                                    IconTile(systemName: page.icon, tone: Theme.Colors.accentFg)
                                    VStack(alignment: .leading, spacing: 2) {
                                        Text(language.t("shell:nav.\(page.id)"))
                                            .font(Theme.Fonts.body(15, weight: .semibold, lang: language.current))
                                            .foregroundStyle(Theme.Colors.textPrimary)
                                        Text(language.t("shell:more.\(page.id)"))
                                            .font(Theme.Fonts.body(13, lang: language.current))
                                            .foregroundStyle(Theme.Colors.textMuted)
                                    }
                                }
                            }
                            .accessibilityIdentifier("more.\(page.id)")
                        }
                    }
                }
                Section(language.t("ios:more.account")) {
                    if let email = user.email {
                        Text(email)
                            .font(Theme.Fonts.body(15, lang: language.current))
                            .foregroundStyle(Theme.Colors.textPrimary)
                    }
                    Button(role: .destructive) {
                        Task { await session.signOut() }
                    } label: {
                        Text(language.t("shell:signOut"))
                            .font(Theme.Fonts.body(15, weight: .semibold, lang: language.current))
                    }
                    .accessibilityIdentifier("more.signOut")
                }
                Section(language.t("settings:language.title")) {
                    Picker(language.t("settings:language.title"), selection: $language.preference) {
                        Text(language.t("settings:language.system")).tag(AppLanguage.system)
                        ForEach(AppLanguage.languages, id: \.self) { lang in
                            Text(AppLanguage.nativeNames[lang] ?? lang).tag(lang)
                        }
                    }
                    .pickerStyle(.inline)
                    .labelsHidden()
                }
                Section(language.t("ios:more.about")) {
                    Text(language.t("ios:more.version", ["version": .string(MoreView.version)]))
                        .font(Theme.Fonts.body(15, lang: language.current))
                        .foregroundStyle(Theme.Colors.textMuted)
                    if config.environment == .dev {
                        Text(language.t("ios:more.devProject"))
                            .font(Theme.Fonts.body(13, lang: language.current))
                            .foregroundStyle(Theme.Colors.warning)
                    }
                }
            }
            .scrollContentBackground(.hidden)
            .background(Theme.Colors.canvas.ignoresSafeArea())
            .navigationTitle(language.t("shell:nav.more"))
            .navigationBarTitleDisplayMode(.inline)
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

/// A page the More tab opens: its id is the web's (shell:nav.<id>,
/// shell:more.<id> name and describe it).
struct MorePage: Identifiable {
    let id: String
    let icon: String
    let view: AnyView
}
