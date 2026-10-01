// The legal gate: the server says the Privacy Notice and Terms in force are
// not accepted by this account (a new account, or a version bump). The web's
// words for a first acceptance or an update, then — until the app can record
// consent itself — the way out: accept on the website, then check again.
// Sign out is the other way out, as on the web.
import SwiftUI

@MainActor
struct LegalGateView: View {
    let status: LegalStatus
    let session: SessionStore
    @Environment(AppLanguage.self) private var language
    @State private var checking = false

    var body: some View {
        VStack(spacing: 22) {
            Spacer()
            NativeIconTile(symbol: "checkmark.shield.fill", color: NativeTone.coral, size: 64)
            VStack(spacing: 10) {
                Text(language.t(status.isFirstAcceptance ? "privacy:gate.firstTitle" : "privacy:gate.updateTitle"))
                    .font(NativeStyle.title(24, lang: language.current))
                    .multilineTextAlignment(.center)
                Text(language.t(status.isFirstAcceptance ? "privacy:gate.firstBody" : "privacy:gate.updateBody"))
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
                Text(language.t("ios:gate.acceptOnWeb"))
                    .fontWeight(.semibold)
                    .multilineTextAlignment(.center)
                if let version = status.privacyVersion {
                    Text(language.t("privacy:gate.version", ["date": .string(version)]))
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }
            VStack(spacing: 12) {
                Link(destination: URL(string: "https://www.budgeer.com/")!) {
                    Text(verbatim: "budgeer.com").frame(maxWidth: .infinity)
                }
                .nativeGlassButton(prominent: true)
                Button {
                    checking = true
                    Task {
                        await session.recheckLegal()
                        checking = false
                    }
                } label: {
                    Text(language.t("common:actions.retry")).frame(maxWidth: .infinity)
                }
                .nativeGlassButton()
                .disabled(checking)
                Button(language.t("privacy:gate.signOut")) { Task { await session.signOut() } }
                    .fontWeight(.semibold)
                    .foregroundStyle(NativeStyle.tint)
                    .frame(minHeight: 44)
            }
            Spacer()
        }
        .padding(24)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(NativeStyle.canvas.ignoresSafeArea())
    }
}

/// The legal check could not reach the server: "Try again" or sign out,
/// nothing of the app (the web's LegalCheckError).
@MainActor
struct LegalCheckErrorView: View {
    let message: String
    let session: SessionStore
    @Environment(AppLanguage.self) private var language

    var body: some View {
        VStack(spacing: 20) {
            Spacer()
            NativeIconTile(symbol: "wifi.slash", color: NativeTone.amber, size: 64)
            Text(language.t("common:errors.connection")).multilineTextAlignment(.center)
            Text(message)
                .font(.system(size: 12, design: .monospaced))
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
                .lineLimit(3)
            Button {
                Task { await session.recheckLegal() }
            } label: {
                Text(language.t("common:errorScreen.actions.tryAgain")).frame(maxWidth: .infinity)
            }
            .nativeGlassButton(prominent: true)
            Button(language.t("shell:signOut")) { Task { await session.signOut() } }
                .fontWeight(.semibold)
                .foregroundStyle(NativeStyle.tint)
                .frame(minHeight: 44)
            Spacer()
        }
        .padding(24)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(NativeStyle.canvas.ignoresSafeArea())
    }
}
