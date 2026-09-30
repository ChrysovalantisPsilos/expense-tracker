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
    @State private var home: HomeViewModel?

    var body: some View {
        TabView {
            Group {
                if let home {
                    HomeView(model: home)
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
        .onAppear {
            if home == nil { home = HomeViewModel(repository: container.home) }
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
