// What the window shows for each session state (SessionStore): a spinner
// while the stored session is read or the legal check runs, the sign-in
// screen, the legal gate, or the app's tabs.
import SwiftUI

@MainActor
struct RootView: View {
    let container: AppContainer
    @State private var signIn = SignInViewModel()

    var body: some View {
        let session = container.session
        Group {
            switch session.state {
            case .loading, .checkingLegal:
                LoadingView()
            case .signedOut:
                SignInView(model: signIn, session: session)
            case .legalRequired(_, let status):
                LegalGateView(status: status, session: session)
            case .legalCheckFailed(_, let message):
                LegalCheckErrorView(message: message, session: session)
            case .ready(let user):
                MainTabView(container: container, user: user)
            }
        }
        .task { await session.start() }
    }
}

/// A spinner on the canvas.
struct LoadingView: View {
    var body: some View {
        ProgressView()
            .tint(Theme.Colors.textMuted)
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .background(Theme.Colors.canvas.ignoresSafeArea())
    }
}
