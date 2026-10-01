// What the window shows for each session state (SessionStore): a spinner
// while the stored session is read or the legal check runs, the sign-in
// screen (with Sign up and Forgot password), the legal gate, the new password
// a reset link asks for, or the app's tabs (under the Face ID lock when it's
// on). A link the app is opened with (the website's Universal Links, or
// budgeer://) goes where it leads (AppContainer.open): an invite or a page
// waits for the tabs, an auth email's link signs in.
import SwiftUI

@MainActor
struct RootView: View {
    let container: AppContainer
    @State private var signIn = SignInViewModel()
    @AppStorage(AppAppearance.key) private var appearance = AppAppearance.system

    var body: some View {
        let session = container.session
        Group {
            switch session.state {
            case .loading, .checkingLegal:
                LoadingView()
            case .signedOut:
                AuthFlowView(signIn: signIn, session: session, access: container.access, site: container.config.siteURL)
            case .legalRequired(_, let status):
                LegalGateView(status: status, session: session, site: container.config.siteURL)
            case .legalCheckFailed(_, let message):
                LegalCheckErrorView(message: message, session: session)
            case .recovering:
                ResetPasswordHost(session: session)
            case .ready(let user):
                ZStack {
                    AppFrame(container: container, user: user, lock: container.lock)
                    if container.lock.covers {
                        LockScreen(lock: container.lock).transition(.opacity)
                    }
                }
                .animation(.easeInOut(duration: 0.25), value: container.lock.covers)
            }
        }
        .task { await session.start() }
        // budgeer://join/<token>, a widget's budgeer://app/<path> (opened as a
        // notification's page is), and the website's links (Universal Links
        // reach SwiftUI as an opened URL or as a browsing activity).
        .onOpenURL { url in
            if let path = WidgetLinks.path(url) { PushInbox.shared.path = path } else { container.open(url) }
        }
        .onContinueUserActivity(NSUserActivityTypeBrowsingWeb) { activity in
            if let url = activity.webpageURL { container.open(url) }
        }
        // Settings › Appearance: this device's light, dark or the phone's.
        .onChange(of: appearance, initial: true) { _, pref in AppAppearance.apply(pref) }
        .onChange(of: session.state) { _, state in
            if state == .signedOut { Task { await container.signedOut() } }
        }
    }
}

/// The new password a reset link asks for (ResetPasswordModel).
@MainActor
private struct ResetPasswordHost: View {
    let session: SessionStore
    @State private var model: ResetPasswordModel?

    var body: some View {
        Group {
            if let model { ResetPasswordView(model: model) } else { LoadingView() }
        }
        .onAppear { if model == nil { model = ResetPasswordModel(session: session) } }
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
