// The app's entry: read which Supabase project this build talks to
// (AppConfig, from the scheme's xcconfig), make the one client and the
// stores, and hand RootView the session. A build whose Info.plist carries no
// usable configuration shows what is missing instead of talking to nowhere.
import SwiftUI

@main
struct BudgeerApp: App {
    private let container: AppContainer?
    private let configError: String?
    @State private var language = AppLanguage()
    /// Light or dark as the top bar's switch (or Settings › Appearance) left it.
    @State private var appearance = AppAppearance()

    init() {
        do {
            container = AppContainer(config: try AppConfig.load())
            configError = nil
        } catch {
            container = nil
            configError = String(describing: error)
        }
    }

    var body: some Scene {
        WindowGroup {
            Group {
                if let container {
                    RootView(container: container)
                } else {
                    ConfigErrorView(message: configError ?? "")
                }
            }
            .environment(language)
            .environment(appearance)
            .preferredColorScheme(appearance.scheme)
            .tint(Theme.Colors.accentFg)
        }
    }
}

/// A build without a usable Config/*.xcconfig (a project generated without
/// the scheme's configuration, say). Developers only; never a user's screen.
struct ConfigErrorView: View {
    let message: String

    var body: some View {
        VStack(spacing: Theme.Space.s4) {
            LucideIcon(icon: .alertTriangle, size: 40)
                .foregroundStyle(Theme.Colors.warning)
            Text(message)
                .font(.system(size: 14, design: .monospaced))
                .multilineTextAlignment(.center)
                .foregroundStyle(Theme.Colors.textPrimary)
        }
        .padding(Theme.Space.s6)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Theme.Colors.canvas.ignoresSafeArea())
    }
}
