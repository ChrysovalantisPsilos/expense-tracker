// The app PIN's pieces for the screens that use it: the lock screen's slot
// (LockPinEntry: "Use PIN", then the pad in place, checking once the PIN's
// length is typed; shown at once when the phone can't check its owner) and
// the pad itself (PinPad: the dots and the digits), which Settings › Face ID
// lock uses to set, change and remove the PIN. What a try answers (wrong,
// wait) is AppPin's; the words are the ios namespace's.
import SwiftUI

/// The lock screen's PIN slot: drop it under Unlock (LockView); it shows
/// nothing without a PIN.
@MainActor
struct LockPinEntry: View {
    let lock: AppLock
    @Environment(AppLanguage.self) private var language
    @State private var open = false
    @State private var digits = ""
    @State private var note: String?
    @State private var shake = 0

    var body: some View {
        if lock.hasPin {
            VStack(spacing: 14) {
                if open || !lock.deviceCheck {
                    PinPad(digits: $digits, length: lock.pinLength ?? AppPin.lengths.upperBound,
                           title: language.t("ios:native.lock.pin.enter"), note: note, shake: shake) { check() }
                        .transition(NativeMotion.reveal)
                } else {
                    Button {
                        withAnimation(NativeMotion.expand) { open = true }
                    } label: {
                        Label(language.t("ios:native.lock.pin.use"), systemImage: "circle.grid.3x3.fill")
                            .font(.subheadline.weight(.semibold))
                    }
                    .buttonStyle(.borderless)
                    .foregroundStyle(NativeStyle.tint)
                    .accessibilityIdentifier("lock.usePin")
                }
            }
        }
    }

    private func check() {
        switch lock.unlock(pin: digits) {
        case .ok:
            note = nil
        case .wrong(let wait):
            note = wait > 0 ? waitText(wait) : language.t("ios:native.lock.pin.wrong")
            shake += 1
            NativeHaptics.warning()
        case .waiting(let wait):
            note = waitText(wait)
            shake += 1
        }
        digits = ""
    }

    private func waitText(_ seconds: TimeInterval) -> String {
        LockPinEntry.waitText(seconds, language)
    }

    /// "Too many tries. Try again in 30 seconds."
    static func waitText(_ seconds: TimeInterval, _ language: AppLanguage) -> String {
        language.t("ios:native.lock.pin.wait", ["count": .int(Int(seconds.rounded(.up)))])
    }
}

/// A PIN's dots and a digit pad. Checks (`done`) once `length` digits are in.
struct PinPad: View {
    @Binding var digits: String
    let length: Int
    let title: String
    var note: String? = nil
    var shake = 0
    let done: () -> Void

    var body: some View {
        VStack(spacing: 16) {
            Text(title).font(.headline).multilineTextAlignment(.center)
            HStack(spacing: 14) {
                ForEach(0..<length, id: \.self) { index in
                    Circle()
                        .fill(index < digits.count ? NativeStyle.tint : Color.clear)
                        .overlay(Circle().stroke(NativeStyle.tint, lineWidth: 1.5))
                        .frame(width: 13, height: 13)
                        .scaleEffect(index < digits.count ? 1.1 : 1)
                }
            }
            .animation(NativeMotion.pick, value: digits.count)
            .modifier(PinShake(times: CGFloat(shake)))
            .animation(.linear(duration: 0.4), value: shake)
            .accessibilityElement()
            .accessibilityValue(Text(verbatim: "\(digits.count)/\(length)"))
            if let note {
                Text(note)
                    .font(.footnote.weight(.semibold))
                    .foregroundStyle(NativeStyle.negative)
                    .multilineTextAlignment(.center)
                    .transition(.opacity)
            }
            LazyVGrid(columns: Array(repeating: GridItem(.fixed(76), spacing: 18), count: 3), spacing: 12) {
                ForEach(1...9, id: \.self) { key($0) }
                Color.clear.frame(width: 64, height: 64)
                key(0)
                Button {
                    if !digits.isEmpty { digits.removeLast() }
                } label: {
                    Image(systemName: "delete.left").font(.title3).frame(width: 64, height: 64)
                }
                .buttonStyle(.plain)
                .foregroundStyle(.secondary)
                .accessibilityIdentifier("pin.delete")
            }
        }
        .sensoryFeedback(.selection, trigger: digits.count)
    }

    private func key(_ digit: Int) -> some View {
        Button {
            guard digits.count < length else { return }
            digits.append(String(digit))
            if digits.count == length { done() }
        } label: {
            Text(verbatim: String(digit))
                .font(.system(size: 28, weight: .medium, design: .rounded))
                .frame(width: 64, height: 64)
                .background(Theme.Colors.subtle, in: Circle())
        }
        .buttonStyle(.plain)
        .accessibilityIdentifier("pin.\(digit)")
    }
}

/// The dots shake sideways when a try is wrong.
private struct PinShake: GeometryEffect {
    var times: CGFloat
    var animatableData: CGFloat {
        get { times }
        set { times = newValue }
    }

    func effectValue(size: CGSize) -> ProjectionTransform {
        ProjectionTransform(CGAffineTransform(translationX: 8 * sin(times * .pi * 4), y: 0))
    }
}
