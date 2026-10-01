// The legal gate: the server says the Privacy Notice and Terms in force are
// not accepted by this account (a new account made with Google or Apple, or
// a version bump). The web's prompt (LegalGate): its words for a first
// acceptance or an update, the two documents to read (the website's pages in
// Safari), and "Accept and continue", which records the acceptance
// (accept_legal_documents, consent source 'prompt'). "I don't agree" says
// what's left: signing out, or deleting the account on the website.
import SwiftUI

@MainActor
struct LegalGateView: View {
    let status: LegalStatus
    let session: SessionStore
    /// This build's website, whose /privacy and /terms are the documents.
    var site: String = "https://www.budgeer.com"
    @Environment(AppLanguage.self) private var language
    @State private var accepting = false
    @State private var declined = false
    @State private var failed = false
    @State private var page: WebPage?

    var body: some View {
        ScrollView {
            VStack(spacing: 22) {
                NativeIconTile(symbol: "checkmark.shield.fill", color: NativeStyle.coral, size: 64)
                    .padding(.top, 48)
                VStack(spacing: 10) {
                    Text(language.t(status.isFirstAcceptance ? "privacy:gate.firstTitle" : "privacy:gate.updateTitle"))
                        .font(NativeStyle.title(24, lang: language.current))
                        .multilineTextAlignment(.center)
                    Text(language.t(status.isFirstAcceptance ? "privacy:gate.firstBody" : "privacy:gate.updateBody"))
                        .foregroundStyle(.secondary)
                        .multilineTextAlignment(.center)
                    if let version = status.privacyVersion {
                        Text(language.t("privacy:gate.version", ["date": .string(version)]))
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                }
                VStack(spacing: 0) {
                    documentRow("/privacy", title: language.t("settings:rows.privacyNotice.label"))
                    Divider().padding(.leading, 16)
                    documentRow("/terms", title: language.t("settings:rows.terms.label"))
                }
                .background(NativeStyle.card, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
                if failed {
                    Text(language.t("privacy:gate.acceptFailed"))
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(NativeStyle.negative)
                        .multilineTextAlignment(.center)
                        .accessibilityIdentifier("gate.failed")
                }
                if declined {
                    Text(language.t("ios:gate.declined"))
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                        .multilineTextAlignment(.center)
                }
                VStack(spacing: 12) {
                    Button {
                        Task { await accept() }
                    } label: {
                        Group {
                            if accepting { ProgressView().tint(Color.white) } else { Text(language.t("privacy:gate.accept")) }
                        }
                        .frame(maxWidth: .infinity)
                    }
                    .nativeGlassButton(prominent: true)
                    .disabled(accepting)
                    .accessibilityIdentifier("gate.accept")
                    if declined {
                        Button(language.t("privacy:gate.signOut")) { Task { await session.signOut() } }
                            .fontWeight(.semibold)
                            .foregroundStyle(NativeStyle.tint)
                            .frame(minHeight: 44)
                    } else {
                        Button(language.t("privacy:gate.disagree")) { declined = true }
                            .fontWeight(.semibold)
                            .foregroundStyle(NativeStyle.tint)
                            .frame(minHeight: 44)
                            .accessibilityIdentifier("gate.disagree")
                    }
                }
            }
            .padding(24)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(NativeStyle.canvas.ignoresSafeArea())
        .sheet(item: $page) { page in SafariView(url: page.url).ignoresSafeArea() }
    }

    private func documentRow(_ path: String, title: String) -> some View {
        Button {
            page = WebPage(path, site: site)
        } label: {
            HStack {
                Text(title).foregroundStyle(.primary)
                Spacer()
                Image(systemName: "arrow.up.right.square").foregroundStyle(.secondary)
            }
            .padding(.horizontal, 16)
            .frame(minHeight: 48)
        }
        .buttonStyle(.plain)
    }

    private func accept() async {
        accepting = true
        failed = false
        defer { accepting = false }
        do {
            try await session.acceptLegal()
        } catch {
            failed = true
        }
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
            NativeIconTile(symbol: "wifi.slash", color: NativeStyle.warning, size: 64)
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
