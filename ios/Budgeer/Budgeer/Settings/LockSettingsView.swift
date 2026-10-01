// Settings › Face ID lock: the switch (kept on this iPhone), then the app
// PIN for when Face ID fails or isn't there: set one up (4–6 digits, then
// again to confirm), change it or remove it (each after the current PIN).
// Everything happens in place on the page, one step at a time; the PIN's
// rules and its keeping are AppPin's (a salted hash in the Keychain).
import SwiftUI

@MainActor
struct LockSettingsView: View {
    let lock: AppLock
    @Environment(AppLanguage.self) private var language

    /// Where the PIN steps are.
    private enum Step: Equatable {
        /// The current PIN first, before a change (`then: new`) or a removal.
        case current(change: Bool)
        case new
        case confirm(String)
    }

    @State private var step: Step?
    @State private var digits = ""
    @State private var note: String?
    @State private var done: String?
    @State private var shake = 0

    var body: some View {
        List {
            Section {
                Toggle(isOn: Binding(get: { lock.enabled }, set: { on in
                    Task { await lock.set(on, reason: language.t("ios:native.lock.reason")) }
                })) {
                    HStack(spacing: 14) {
                        NativeIconTile(symbol: "faceid")
                        Text(language.t("ios:native.lock.setting"))
                    }
                }
                .tint(NativeStyle.positive)
                .disabled(!lock.available && !lock.enabled)
                .accessibilityIdentifier("settings.lock")
            } footer: {
                Text(language.t(lock.available || lock.enabled ? "ios:native.lock.settingNote" : "ios:native.lock.unavailable"))
            }
            .listRowBackground(NativeStyle.card)

            Section {
                if let done {
                    NativeNotice(text: done)
                }
                if let step {
                    pad(step)
                        .padding(.vertical, 8)
                        .frame(maxWidth: .infinity)
                        .transition(NativeMotion.reveal)
                } else if lock.hasPin {
                    Button { begin(.current(change: true)) } label: {
                        Label(language.t("ios:native.lock.pin.change"), systemImage: "circle.grid.3x3")
                    }
                    .accessibilityIdentifier("pin.change")
                    Button(role: .destructive) { begin(.current(change: false)) } label: {
                        Label(language.t("ios:native.lock.pin.remove"), systemImage: "trash")
                    }
                    .accessibilityIdentifier("pin.remove")
                } else {
                    Button { begin(.new) } label: {
                        Label(language.t("ios:native.lock.pin.set"), systemImage: "circle.grid.3x3")
                    }
                    .accessibilityIdentifier("pin.set")
                }
            } header: {
                NativeCapsHeader(title: language.t("ios:native.lock.pin.title"))
            } footer: {
                Text(language.t("ios:native.lock.pin.note"))
            }
            .listRowBackground(NativeStyle.card)
        }
        .listStyle(.insetGrouped)
        .scrollContentBackground(.hidden)
        .background(NativeStyle.canvas)
        .nativeTabBarRoom()
        .navigationTitle(language.t("ios:native.lock.setting"))
    }

    /// One step's pad: its title, the dots, the digits; Next for a new PIN
    /// (its length is chosen), Cancel under every step.
    @ViewBuilder private func pad(_ step: Step) -> some View {
        VStack(spacing: 14) {
            switch step {
            case .current:
                PinPad(digits: $digits, length: lock.pinLength ?? AppPin.lengths.upperBound,
                       title: language.t("ios:native.lock.pin.current"), note: note, shake: shake) { current(step) }
            case .new:
                PinPad(digits: $digits, length: AppPin.lengths.upperBound, title: language.t("ios:native.lock.pin.new"),
                       note: note, shake: shake) { next() }
                Button(language.t("ios:native.lock.pin.next")) { next() }
                    .nativeGlassButton(prominent: true)
                    .disabled(!AppPin.valid(digits))
                    .accessibilityIdentifier("pin.next")
            case .confirm(let first):
                PinPad(digits: $digits, length: first.count, title: language.t("ios:native.lock.pin.confirm"),
                       note: note, shake: shake) { confirm(first) }
            }
            Button(language.t("common:actions.cancel")) { finish(nil) }
                .buttonStyle(.borderless)
                .foregroundStyle(.secondary)
        }
    }

    private func begin(_ next: Step) {
        withAnimation(NativeMotion.expand) {
            done = nil
            note = nil
            digits = ""
            step = next
        }
    }

    /// The current PIN: right goes on (to a new one, or removes it).
    private func current(_ step: Step) {
        switch lock.checkPin(digits) {
        case .ok:
            if step == .current(change: true) {
                begin(.new)
            } else {
                lock.removePin()
                finish(language.t("ios:native.lock.pin.removed"))
            }
        case .wrong(let wait):
            wrong(wait > 0 ? waitText(wait) : language.t("ios:native.lock.pin.wrong"))
        case .waiting(let wait):
            wrong(waitText(wait))
        }
    }

    private func next() {
        guard AppPin.valid(digits) else { return }
        let first = digits
        begin(.confirm(first))
    }

    private func confirm(_ first: String) {
        guard digits == first else {
            begin(.new)
            note = language.t("ios:native.lock.pin.mismatch")
            shake += 1
            return
        }
        if lock.setPin(first) {
            NativeHaptics.success()
            finish(language.t("ios:native.lock.pin.saved"))
        } else {
            wrong(language.t("common:errors.generic"))
        }
    }

    private func wrong(_ text: String) {
        note = text
        digits = ""
        shake += 1
        NativeHaptics.warning()
    }

    private func finish(_ said: String?) {
        withAnimation(NativeMotion.expand) {
            step = nil
            digits = ""
            note = nil
            done = said
        }
    }

    private func waitText(_ seconds: TimeInterval) -> String {
        LockPinEntry.waitText(seconds, language)
    }
}
