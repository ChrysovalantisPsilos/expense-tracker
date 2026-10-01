// The lock's screen, two takes (DesignOptions.lock), both with the brand's
// mark and colours, "Budgeer is locked", the note, and Unlock in glass with
// a slot under it for another way in (Use PIN). A: the mark on a glass disc
// over a soft coral and amber glow. B: the app itself, blurred behind thick
// material, with the mark and the words on a glass card. It asks at once
// when it appears, as banking apps do; the check itself is AppLock's.
import SwiftUI

@MainActor
struct LockScreen<Fallback: View>: View {
    let lock: AppLock
    /// Under Unlock: another way in (Use PIN), when there is one.
    @ViewBuilder let fallback: () -> Fallback
    @Environment(AppLanguage.self) private var language
    @Environment(\.design) private var design
    @State private var tries = 0
    @State private var shown = false

    var body: some View {
        Group {
            switch design.lock {
            case .a: glow
            case .b: frosted
            }
        }
        .task(id: tries) {
            guard lock.locked else { return }
            await lock.unlock(reason: language.t("ios:native.lock.reason"))
        }
        .onAppear { withAnimation(.spring(response: 0.6, dampingFraction: 0.8)) { shown = true } }
        .sensoryFeedback(.success, trigger: lock.locked) { was, now in was && !now }
    }

    // MARK: A: the glow

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

    // MARK: B: the app behind frosted glass

    private var frosted: some View {
        ZStack {
            Rectangle().fill(.thickMaterial).ignoresSafeArea()
            LinearGradient(colors: [NativeStyle.coral.opacity(0.18), NativeStyle.canvas.opacity(0.35)],
                           startPoint: .top, endPoint: .bottom)
                .ignoresSafeArea()
            VStack(spacing: 14) {
                Spacer()
                VStack(spacing: 12) {
                    BrandMark(size: 54)
                        .frame(width: 84, height: 84)
                        .background(NativeStyle.card, in: RoundedRectangle(cornerRadius: 22, style: .continuous))
                    words.padding(.top, 4)
                }
                .padding(.vertical, 28)
                .padding(.horizontal, 22)
                .frame(maxWidth: .infinity)
                .nativeGlass(RoundedRectangle(cornerRadius: 32, style: .continuous))
                .scaleEffect(shown ? 1 : 0.94)
                .opacity(shown ? 1 : 0)
                Spacer()
                actions
            }
            .padding(.horizontal, 24)
            .padding(.bottom, 24)
        }
    }

    // MARK: Shared

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

    /// Unlock (Face ID's glyph in it), and the slot under it.
    private var actions: some View {
        VStack(spacing: 10) {
            if lock.locked {
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
            fallback()
        }
        .animation(.snappy, value: lock.locked)
    }
}

extension LockScreen where Fallback == EmptyView {
    init(lock: AppLock) {
        self.init(lock: lock) { EmptyView() }
    }
}
