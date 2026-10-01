// The app's entry: read which Supabase project this build talks to
// (AppConfig, from the scheme's xcconfig), make the one client and the
// stores, and hand RootView the session. A build whose Info.plist carries no
// usable configuration shows what is missing instead of talking to nowhere.
import SwiftUI

@main
struct BudgeerApp: App {
    private let container: AppContainer?
    private let configError: String?
    @State private var language: AppLanguage

    init() {
        let language = AppLanguage()
        _language = State(initialValue: language)
        NativeStyle.installAppearance(lang: language.current)
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
            .tint(NativeStyle.tint)
        }
    }
}

/// A build without a usable Config/*.xcconfig (a project generated without
/// the scheme's configuration, say). Developers only; never a user's screen.
struct ConfigErrorView: View {
    let message: String

    var body: some View {
        VStack(spacing: 16) {
            Image(systemName: "exclamationmark.triangle.fill")
                .font(.system(size: 40))
                .foregroundStyle(NativeStyle.warning)
            Text(message)
                .font(.system(size: 14, design: .monospaced))
                .multilineTextAlignment(.center)
        }
        .padding(24)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(NativeStyle.canvas.ignoresSafeArea())
    }
}
