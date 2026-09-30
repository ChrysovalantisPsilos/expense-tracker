// The legal gate: the server says the Privacy Notice and Terms in force are
// not accepted by this account (a new account, or a version bump). The web's
// words for a first acceptance or an update, then — until the app can record
// consent itself — the way out: accept on the website, then check again.
// Sign out is the other way out, as on the web.
import SwiftUI

struct LegalGateView: View {
    let status: LegalStatus
    let session: SessionStore
    @Environment(AppLanguage.self) private var language
    @State private var checking = false

    var body: some View {
        VStack(spacing: Theme.Space.s6) {
            Spacer()
            IconTile(systemName: "checkmark.shield", size: 56, tone: Theme.Colors.accentFg)
            VStack(spacing: Theme.Space.s3) {
                Text(language.t(status.isFirstAcceptance ? "privacy:gate.firstTitle" : "privacy:gate.updateTitle"))
                    .font(Theme.Fonts.heading(22, weight: .bold, lang: language.current))
                    .foregroundStyle(Theme.Colors.textPrimary)
                    .multilineTextAlignment(.center)
                Text(language.t(status.isFirstAcceptance ? "privacy:gate.firstBody" : "privacy:gate.updateBody"))
                    .font(Theme.Fonts.body(15, lang: language.current))
                    .foregroundStyle(Theme.Colors.textMuted)
                    .multilineTextAlignment(.center)
                Text(language.t("ios:gate.acceptOnWeb"))
                    .font(Theme.Fonts.body(15, weight: .semibold, lang: language.current))
                    .foregroundStyle(Theme.Colors.textPrimary)
                    .multilineTextAlignment(.center)
                if let version = status.privacyVersion {
                    Text(language.t("privacy:gate.version", ["date": .string(version)]))
                        .font(Theme.Fonts.body(12, lang: language.current))
                        .foregroundStyle(Theme.Colors.textMuted)
                }
            }
            VStack(spacing: Theme.Space.s3) {
                Link(destination: URL(string: "https://www.budgeer.com/")!) {
                    Text("budgeer.com")
                }
                .buttonStyle(PrimaryButtonStyle())
                Button {
                    checking = true
                    Task { await session.recheckLegal(); checking = false }
                } label: {
                    Text(language.t("common:actions.retry"))
                }
                .buttonStyle(OutlineButtonStyle())
                .disabled(checking)
                Button {
                    Task { await session.signOut() }
                } label: {
                    Text(language.t("privacy:gate.signOut"))
                        .font(Theme.Fonts.body(15, weight: .semibold, lang: language.current))
                        .foregroundStyle(Theme.Colors.accentFg)
                        .frame(minHeight: 44)
                }
            }
            Spacer()
        }
        .padding(Theme.Space.s6)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Theme.Colors.canvas.ignoresSafeArea())
    }
}

/// The legal check could not reach the server: "Try again" or sign out,
/// nothing of the app (the web's LegalCheckError).
struct LegalCheckErrorView: View {
    let message: String
    let session: SessionStore
    @Environment(AppLanguage.self) private var language

    var body: some View {
        VStack(spacing: Theme.Space.s5) {
            Spacer()
            IconTile(systemName: "wifi.exclamationmark", size: 56, tone: Theme.Colors.warning)
            Text(language.t("common:errors.connection"))
                .font(Theme.Fonts.body(15, lang: language.current))
                .foregroundStyle(Theme.Colors.textPrimary)
                .multilineTextAlignment(.center)
            Text(message)
                .font(.system(size: 12, design: .monospaced))
                .foregroundStyle(Theme.Colors.textMuted)
                .multilineTextAlignment(.center)
                .lineLimit(3)
            Button {
                Task { await session.recheckLegal() }
            } label: {
                Text(language.t("common:errorScreen.actions.tryAgain"))
            }
            .buttonStyle(PrimaryButtonStyle())
            Button {
                Task { await session.signOut() }
            } label: {
                Text(language.t("shell:signOut"))
                    .font(Theme.Fonts.body(15, weight: .semibold, lang: language.current))
                    .foregroundStyle(Theme.Colors.accentFg)
                    .frame(minHeight: 44)
            }
            Spacer()
        }
        .padding(Theme.Space.s6)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Theme.Colors.canvas.ignoresSafeArea())
    }
}
