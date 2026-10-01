// The lock's screen: the brand's mark on a glass disc over a soft coral and
// amber glow, "Budgeer is locked", the note, and Unlock in glass (Face ID's
// glyph in it) with the app PIN under it (LockPinEntry: "Use PIN", or the
// pad itself when the phone can't check its owner). It asks at once when it
// appears, as banking apps do; the checks themselves are AppLock's.
import SwiftUI

@MainActor
struct LockScreen: View {
    let lock: AppLock
    @Environment(AppLanguage.self) private var language
    @State private var tries = 0
    @State private var shown = false

    var body: some View {
        glow
            .task(id: tries) {
                guard lock.locked, lock.deviceCheck else { return }
                await lock.unlock(reason: language.t("ios:native.lock.reason"))
            }
            .onAppear { withAnimation(.spring(response: 0.6, dampingFraction: 0.8)) { shown = true } }
            .sensoryFeedback(.success, trigger: lock.locked) { was, now in was && !now }
    }

    // MARK: The glow

    private var glow: some View {
        ZStack {
            NativeStyle.canvas.ignoresSafeArea()
            RadialGradient(colors: [NativeStyle.coral.opacity(0.32), .clear], center: .top, startRadius: 0, endRadius: 460)
                .ignoresSafeArea()
            RadialGradient(colors: [NativeStyle.amber.opacity(0.24), .clear], center: .bottomTrailing, startRadius: 0,
                           endRadius: 420)
                .ignoresSafeArea()
            VStack(spacing: 14) {
                Spacer()
                BrandMark(size: 62)
                    .frame(width: 116, height: 116)
                    .nativeGlass(Circle())
                    .scaleEffect(shown ? 1 : 0.86)
                    .opacity(shown ? 1 : 0)
                words.padding(.top, 14)
                Spacer()
                actions
            }
            .padding(.horizontal, 32)
            .padding(.bottom, 24)
        }
    }

    // MARK: The words and Unlock

    private var words: some View {
        VStack(spacing: 8) {
            Text(language.t("ios:native.lock.locked"))
                .font(NativeStyle.title(26, lang: language.current))
                .multilineTextAlignment(.center)
            Text(language.t("ios:native.lock.note"))
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
        }
    }

    /// Unlock (Face ID's glyph in it) when the phone can check its owner, and the PIN under it.
    private var actions: some View {
        VStack(spacing: 10) {
            if lock.locked && lock.deviceCheck {
                Button {
                    tries += 1
                } label: {
                    Label(language.t("ios:native.lock.unlock"), systemImage: "faceid")
                        .frame(maxWidth: .infinity)
                }
                .nativeGlassButton(prominent: true)
                .accessibilityIdentifier("lock.unlock")
                .transition(.opacity.combined(with: .move(edge: .bottom)))
            }
            if lock.locked { LockPinEntry(lock: lock) }
        }
        .animation(.snappy, value: lock.locked)
    }
}
