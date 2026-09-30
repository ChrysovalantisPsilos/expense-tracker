// The signed-in app: five tabs after the web's bottom navigation (Home,
// Transactions, Groups, Budgets, More). Home is real; Transactions, Groups
// and Budgets say "coming soon" until their phase; More holds the account
// (sign out), the language and the build's details.
import SwiftUI

@MainActor
struct MainTabView: View {
    let container: AppContainer
    let user: AuthUser
    @Environment(AppLanguage.self) private var language
    @Environment(\.scenePhase) private var scenePhase
    @State private var home: HomeViewModel?
    /// The entry form, when open.
    @State private var entry: EntrySheet?

    var body: some View {
        TabView {
            Group {
                if let home {
                    HomeView(model: home, onAdd: { entry = EntrySheet.add(data: container.data) })
                        .liveRefresh(container.live, tables: ["transactions", "categories", "profiles"]) {
                            await home.refresh()
                        }
                } else {
                    LoadingView()
                }
            }
            .tabItem { Label(language.t("shell:nav.home"), systemImage: "house") }
            ComingSoonView(title: language.t("shell:nav.transactions"))
                .tabItem { Label(language.t("shell:nav.transactions"), systemImage: "list.bullet.rectangle") }
            ComingSoonView(title: language.t("shell:nav.groups"))
                .tabItem { Label(language.t("shell:nav.groups"), systemImage: "person.2") }
            ComingSoonView(title: language.t("shell:nav.budgets"))
                .tabItem { Label(language.t("shell:nav.budgets"), systemImage: "chart.pie") }
            MoreView(config: container.config, session: container.session, user: user)
                .tabItem { Label(language.t("shell:nav.more"), systemImage: "ellipsis.circle") }
        }
        .sheet(item: $entry) { sheet in
            EntryFormView(model: sheet.model) { _ in entry = nil }
                .environment(language)
        }
        .onAppear {
            if home == nil { home = HomeViewModel(data: container.data) }
        }
        // Live updates for this account while the app is open; back in the
        // foreground, everything catches up on what realtime missed.
        .task(id: user.id) { await container.feed.start(userId: user.id) }
        .onChange(of: scenePhase) { _, phase in
            if phase == .active { container.live.catchUp() }
        }
    }
}

/// A tab whose feature is not in the app yet: the web has it.
struct ComingSoonView: View {
    let title: String
    @Environment(AppLanguage.self) private var language

    var body: some View {
        NavigationStack {
            VStack(spacing: Theme.Space.s4) {
                Spacer()
                IconTile(systemName: "hammer", size: 56, tone: Theme.Colors.textMuted)
                Text(language.t("ios:soon.title"))
                    .font(Theme.Fonts.heading(20, weight: .bold, lang: language.current))
                    .foregroundStyle(Theme.Colors.textPrimary)
                Text(language.t("ios:soon.body"))
                    .font(Theme.Fonts.body(15, lang: language.current))
                    .foregroundStyle(Theme.Colors.textMuted)
                    .multilineTextAlignment(.center)
                Spacer()
            }
            .padding(Theme.Space.s6)
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .background(Theme.Colors.canvas.ignoresSafeArea())
            .navigationTitle(title)
            .navigationBarTitleDisplayMode(.inline)
        }
    }
}
