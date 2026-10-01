// Settings' switch pages over PreferencesModel: Monthly spending (yearly
// subscriptions, the salary shift with its day and category), Notifications
// (the email and weekly-summary messages), Appearance (this device's light,
// dark or the phone's) and AI helpers (the four switches, what each sends).
// Each switch saves as it moves; the words under it are the web's.
import SwiftUI

/// A switch with its explanation under the name.
struct PreferenceToggle: View {
    let title: String
    var hint: String? = nil
    let isOn: Bool
    var disabled = false
    let id: String
    let set: (Bool) -> Void

    var body: some View {
        Toggle(isOn: Binding(get: { isOn }, set: set)) {
            VStack(alignment: .leading, spacing: 3) {
                Text(title)
                if let hint { Text(hint).font(.footnote).foregroundStyle(.secondary) }
            }
            .padding(.vertical, 2)
        }
        .tint(NativeStyle.positive)
        .disabled(disabled)
        .accessibilityIdentifier(id)
    }
}

/// A page of switches: its sections once the profile is read.
@MainActor
struct PreferencesPage<Content: View>: View {
    let model: PreferencesModel
    let title: String
    @ViewBuilder let content: () -> Content

    var body: some View {
        List {
            switch model.state {
            case .loading:
                Section { NativeLoading() }.listRowBackground(Color.clear)
            case .failed(let message):
                Section { NativeFailed(message: message) { await model.load() } }.listRowBackground(Color.clear)
            case .loaded:
                if let message = model.message {
                    Section { NativeNotice(text: message, warning: true) }.listRowBackground(NativeStyle.card)
                }
                content()
            }
        }
        .listStyle(.insetGrouped)
        .scrollContentBackground(.hidden)
        .background(NativeStyle.canvas)
        .nativeTabBarRoom()
        .navigationTitle(title)
        .task { await model.load() }
    }
}

// MARK: Monthly spending

@MainActor
struct SpendingView: View {
    let model: PreferencesModel
    @Environment(AppLanguage.self) private var language

    var body: some View {
        PreferencesPage(model: model, title: language.t("settings:spending.title")) {
            Section {
                PreferenceToggle(title: language.t("settings:spending.yearly.label"), isOn: model.countYearly,
                                 id: "spending.yearly") { on in Task { await model.setCountYearly(on) } }
            } footer: {
                Text([language.t("settings:spending.yearly.hint"), language.t("settings:spending.yearly.more")]
                    .joined(separator: " "))
            }
            .listRowBackground(NativeStyle.card)

            if let salary = model.salary {
                Section {
                    PreferenceToggle(title: language.t("settings:spending.salary.label"), isOn: salary.on,
                                     disabled: salary.disabled, id: "spending.salary") { on in
                        Task { await model.setSalaryShift(on) }
                    }
                    if salary.on {
                        HStack(spacing: 8) {
                            Text(language.t("settings:spending.salary.fromDay"))
                            Picker(language.t("settings:spending.salary.fromDay"),
                                   selection: Binding(get: { model.salaryDay ?? 1 },
                                                      set: { day in Task { await model.setSalaryDay(day) } })) {
                                ForEach(salary.days, id: \.self) { day in Text(verbatim: String(day)).tag(day) }
                            }
                            .labelsHidden()
                            .accessibilityIdentifier("spending.salaryDay")
                            Text(language.t("settings:spending.salary.toEnd")).foregroundStyle(.secondary)
                        }
                        Picker(language.t("settings:spending.salary.category"),
                               selection: Binding(get: { model.salaryCategory },
                                                  set: { id in Task { await model.setSalaryCategory(id) } })) {
                            if model.salaryCategory.isEmpty {
                                Text(language.t("settings:spending.salary.chooseCategory")).tag("")
                            }
                            ForEach(model.incomeOptions, id: \.id) { option in Text(option.name).tag(option.id) }
                        }
                        .accessibilityIdentifier("spending.salaryCategory")
                    }
                } footer: {
                    Text(salaryFooter(salary))
                }
                .listRowBackground(NativeStyle.card)
            }
        }
    }

    /// The hint, the rest of it, and the shorter-months note, as the web shows them.
    private func salaryFooter(_ salary: SalaryShiftView) -> String {
        var lines = [language.t(salary.hint)]
        if salary.more { lines.append(language.t("settings:spending.salary.more")) }
        if salary.shortMonths { lines.append(language.t("settings:spending.salary.shortMonths")) }
        return lines.joined(separator: " ")
    }
}

// MARK: Notifications

/// What Budgeer sends: push to this iPhone (and the account's other devices),
/// email for the big events and the weekly summary (both recorded in the
/// consent history).
@MainActor
struct MessagesView: View {
    let model: PreferencesModel
    let push: PushModel
    @Environment(AppLanguage.self) private var language

    var body: some View {
        PreferencesPage(model: model, title: language.t("settings:notifications.title")) {
            PushToggle(model: model, push: push)
            MessageToggles(model: model)
        }
        .task { await push.refresh() }
    }
}

/// The account's push switch, as the web's: turning it on asks iOS here
/// (once) and registers this iPhone; when iOS says no, how to allow it.
@MainActor
struct PushToggle: View {
    let model: PreferencesModel
    let push: PushModel
    @Environment(AppLanguage.self) private var language

    var body: some View {
        Section {
            PreferenceToggle(title: language.t("settings:notifications.push.label"),
                             hint: language.t("settings:notifications.push.hint"),
                             isOn: model.pushOn && push.permission == .allowed,
                             disabled: model.isDemo, id: "notifications.push") { on in
                Task {
                    await model.setPush(on)
                    if on { await push.enable() }
                }
            }
        } footer: {
            if push.permission == .denied && !model.isDemo {
                VStack(alignment: .leading, spacing: 6) {
                    Text(language.t("ios:native.push.off"))
                    Button(language.t("ios:native.push.openSettings")) { openAppSettings() }
                        .font(.footnote.weight(.semibold))
                        .accessibilityIdentifier("notifications.openSettings")
                }
            }
        }
        .listRowBackground(NativeStyle.card)
    }
}

/// The two message switches (also Privacy's consent switches).
@MainActor
struct MessageToggles: View {
    let model: PreferencesModel
    var header: String? = nil
    var onChanged: () -> Void = {}
    @Environment(AppLanguage.self) private var language

    var body: some View {
        Section {
            PreferenceToggle(title: language.t("settings:notifications.email.label"),
                             hint: language.t("settings:notifications.email.hint"), isOn: model.emailOn,
                             disabled: model.isDemo, id: "notifications.email") { on in
                Task {
                    await model.setEmail(on)
                    onChanged()
                }
            }
            PreferenceToggle(title: language.t("settings:notifications.digest.label"),
                             hint: language.t("settings:notifications.digest.hint"), isOn: model.digestOn,
                             disabled: model.isDemo, id: "notifications.digest") { on in
                Task {
                    await model.setDigest(on)
                    onChanged()
                }
            }
        } header: {
            if let header { NativeCapsHeader(title: header) }
        } footer: {
            if model.isDemo { Text(language.t("settings:notifications.demoOff")) }
        }
        .listRowBackground(NativeStyle.card)
    }
}

// MARK: Appearance

@MainActor
struct AppearanceView: View {
    @Environment(AppLanguage.self) private var language
    @AppStorage(AppAppearance.key) private var appearance = AppAppearance.system

    var body: some View {
        List {
            Section {
                ForEach(SettingsFigures.appearancePrefs(), id: \.self) { pref in
                    Button {
                        appearance = pref
                    } label: {
                        HStack(spacing: 14) {
                            Image(systemName: AppearanceView.symbol(pref))
                                .font(.body.weight(.semibold))
                                .foregroundStyle(NativeStyle.tint)
                                .frame(width: 28)
                            Text(language.t("settings:appearance.\(pref)"))
                            Spacer()
                            if pref == appearance {
                                Image(systemName: "checkmark").fontWeight(.semibold).foregroundStyle(NativeStyle.tint)
                            }
                        }
                        .foregroundStyle(Color.primary)
                    }
                    .accessibilityAddTraits(pref == appearance ? .isSelected : [])
                    .accessibilityIdentifier("appearance.\(pref)")
                }
            } footer: {
                Text(language.t("settings:appearance.description"))
            }
            .listRowBackground(NativeStyle.card)
        }
        .listStyle(.insetGrouped)
        .scrollContentBackground(.hidden)
        .background(NativeStyle.canvas)
        .nativeTabBarRoom()
        .navigationTitle(language.t("settings:appearance.title"))
    }

    /// Each choice's picture (the web's Sun, Moon and Monitor).
    static func symbol(_ pref: String) -> String {
        switch pref {
        case "light": return "sun.max.fill"
        case "dark": return "moon.fill"
        default: return "iphone"
        }
    }
}

// MARK: AI helpers

@MainActor
struct AiHelpersView: View {
    let model: PreferencesModel
    @Environment(AppLanguage.self) private var language

    var body: some View {
        PreferencesPage(model: model, title: language.t("ai:settings.title")) {
            if model.isDemo {
                Section { DemoNotice(text: language.t("ai:demoNote")) }.listRowBackground(NativeStyle.card)
            }
            Section {
                HStack(alignment: .top, spacing: 14) {
                    NativeIconTile(symbol: "checkmark.shield.fill", color: SettingsRow.green)
                    VStack(alignment: .leading, spacing: 4) {
                        Text(language.t("ai:settings.note")).font(.subheadline)
                        Text(language.t("ai:settings.noteMore")).font(.footnote).foregroundStyle(.secondary)
                    }
                }
                .padding(.vertical, 4)
            } header: {
                NativeCapsHeader(title: language.t("ai:settings.noteLabel"))
            }
            .listRowBackground(NativeStyle.card)

            ForEach(model.aiSwitches, id: \.self) { id in
                Section {
                    PreferenceToggle(title: language.t("ai:settings.\(id).label"), hint: language.t("ai:settings.\(id).hint"),
                                     isOn: model.aiOn(id), id: "ai.\(id)") { on in Task { await model.setAi(id, on) } }
                } footer: {
                    Text(language.t("ai:settings.\(id).more"))
                }
                .listRowBackground(NativeStyle.card)
            }
        }
    }
}
