// What the window shows for each session state (SessionStore): a spinner
// while the stored session is read or the legal check runs, the sign-in
// screen, the legal gate, or the app's tabs (under the Face ID lock when
// it's on).
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
                SignInView(model: signIn, session: session, site: container.config.siteURL)
            case .legalRequired(_, let status):
                LegalGateView(status: status, session: session)
            case .legalCheckFailed(_, let message):
                LegalCheckErrorView(message: message, session: session)
            case .ready(let user):
                ZStack {
                    AppFrame(container: container, user: user, lock: container.lock)
                    if container.lock.covers {
                        LockView(lock: container.lock).transition(.opacity)
                    }
                }
                .animation(.easeInOut(duration: 0.25), value: container.lock.covers)
            }
        }
        .task { await session.start() }
        .onChange(of: session.state) { _, state in
            if state == .signedOut { Task { await container.signedOut() } }
        }
    }
}

/// A spinner on the canvas.
struct LoadingView: View {
    var body: some View {
        ProgressView()
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .background(NativeStyle.canvas.ignoresSafeArea())
    }
}
