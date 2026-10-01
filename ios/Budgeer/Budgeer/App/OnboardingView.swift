// The setup wizard (WelcomeModel), as the web's OnboardingWizard: a new
// account's four steps under the mark and a progress bar. Welcome (your
// name and currency), Split costs with friends (a first group, optional),
// Stay in the loop (notifications; the web's passkey offer waits for the
// app's passkeys), and the tour (Start tour or Skip tour). Every step can be
// skipped, and closing it at any point stamps it done so it never asks again.
import SwiftUI

@MainActor
struct OnboardingView: View {
    @Bindable var model: WelcomeModel
    @Environment(AppLanguage.self) private var language
    @FocusState private var focus: Field?

    private enum Field { case name, group }

    var body: some View {
        VStack(spacing: 0) {
            header
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    content
                    if let message = model.message {
                        NativeNotice(text: message, warning: model.warning)
                            .accessibilityIdentifier("onboarding.message")
                    }
                }
                .padding(.horizontal, 24)
                .padding(.vertical, 20)
                .frame(maxWidth: 520)
                .frame(maxWidth: .infinity)
            }
            .scrollDismissesKeyboard(.interactively)
            footer
        }
        .background(NativeStyle.canvas.ignoresSafeArea())
        .interactiveDismissDisabled()
        .onAppear { if model.step == 0 { focus = .name } }
        .onChange(of: model.step) { _, step in focus = step == 1 ? .group : nil }
    }

    /// The mark, Skip setup, and the progress bar.
    private var header: some View {
        VStack(spacing: 12) {
            HStack {
                BrandMark(size: 30)
                Spacer()
                Button {
                    Task { await model.finish(tour: false) }
                } label: {
                    Image(systemName: "xmark")
                        .font(.body.weight(.semibold))
                        .frame(width: 44, height: 44)
                }
                .foregroundStyle(.secondary)
                .accessibilityLabel(language.t("onboarding:wizard.skipSetup"))
                .accessibilityIdentifier("onboarding.close")
            }
            ProgressView(value: model.progress)
                .tint(NativeStyle.tint)
                .animation(.snappy, value: model.progress)
        }
        .padding(.horizontal, 24)
        .padding(.top, 12)
    }

    @ViewBuilder private var content: some View {
        switch model.step {
        case 0:
            heading("sparkles", "onboarding:wizard.welcome.title", "onboarding:wizard.welcome.lead")
            VStack(spacing: 0) {
                TextField(language.t("settings:yourName"), text: $model.name)
                    .textContentType(.name)
                    .focused($focus, equals: .name)
                    .padding(.vertical, 14)
                    .accessibilityIdentifier("onboarding.name")
                Divider()
                Picker(language.t("settings:account.currency"), selection: $model.currency) {
                    ForEach(model.currencyOptions, id: \.self) { code in Text(verbatim: code).tag(code) }
                }
                .padding(.vertical, 6)
                .accessibilityIdentifier("onboarding.currency")
            }
            .padding(.horizontal, 16)
            .background(NativeStyle.card, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
            Text(language.t("onboarding:wizard.welcome.currencyHelp")).font(.footnote).foregroundStyle(.secondary)
        case 1:
            heading("person.2.fill", "onboarding:wizard.group.title", "onboarding:wizard.group.lead")
            VStack(alignment: .leading, spacing: 6) {
                Text(language.t("onboarding:wizard.group.label")).font(.subheadline.weight(.semibold))
                TextField(language.t("onboarding:wizard.group.placeholder"), text: $model.groupName)
                    .focused($focus, equals: .group)
                    .submitLabel(.next)
                    .onSubmit { Task { await model.saveGroup() } }
                    .padding(.horizontal, 16)
                    .padding(.vertical, 14)
                    .background(NativeStyle.card, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
                    .accessibilityIdentifier("onboarding.group")
            }
        case 2:
            heading("bell.badge.fill", "onboarding:wizard.loop.title", "onboarding:wizard.loop.lead")
            Button {
                Task { await model.turnOnPush() }
            } label: {
                Label(language.t(model.pushDone ? "onboarding:wizard.loop.enabled" : "onboarding:wizard.loop.enable"),
                      systemImage: "bell.badge")
                    .frame(maxWidth: .infinity)
            }
            .nativeGlassButton()
            .disabled(model.pushDone || model.pushOptIn == nil)
            .accessibilityIdentifier("onboarding.push")
            Text(language.t("onboarding:wizard.loop.later")).font(.footnote).foregroundStyle(.secondary)
        default:
            heading("safari.fill", "onboarding:wizard.tour.title", "onboarding:wizard.tour.lead")
        }
    }

    private func heading(_ symbol: String, _ title: String, _ lead: String) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Label(language.t(title), systemImage: symbol)
                .font(NativeStyle.title(22, lang: language.current))
                .foregroundStyle(NativeStyle.tint)
            Text(language.t(lead)).foregroundStyle(.secondary).fixedSize(horizontal: false, vertical: true)
        }
    }

    /// Back, Skip (the first two steps) and Continue; on the last step Skip tour and Start tour.
    private var footer: some View {
        HStack(spacing: 10) {
            if model.step > 0 {
                Button(language.t("common:actions.back")) { model.back() }
                    .disabled(model.busy)
                    .accessibilityIdentifier("onboarding.back")
            }
            Spacer(minLength: 0)
            if model.step < 2 {
                Button(language.t("common:actions.skip")) { model.skip() }
                    .disabled(model.busy)
                    .accessibilityIdentifier("onboarding.skip")
            }
            if model.step == 3 {
                Button(language.t("onboarding:wizard.tour.skip")) { Task { await model.finish(tour: false) } }
                    .disabled(model.busy)
                    .accessibilityIdentifier("onboarding.skipTour")
                Button(language.t("onboarding:wizard.tour.start")) { Task { await model.finish(tour: true) } }
                    .nativeGlassButton(prominent: true)
                    .disabled(model.busy)
                    .accessibilityIdentifier("onboarding.startTour")
            } else {
                Button {
                    Task {
                        switch model.step {
                        case 0: await model.saveBasics()
                        case 1: await model.saveGroup()
                        default: model.continueToTour()
                        }
                    }
                } label: {
                    HStack(spacing: 6) {
                        if model.busy { ProgressView().tint(Color.white) }
                        Text(language.t("onboarding:wizard.continue"))
                        Image(systemName: "arrow.right")
                    }
                }
                .nativeGlassButton(prominent: true)
                .disabled(model.busy)
                .accessibilityIdentifier("onboarding.continue")
            }
        }
        .padding(.horizontal, 24)
        .padding(.vertical, 12)
        .nativeFootBar()
    }
}
