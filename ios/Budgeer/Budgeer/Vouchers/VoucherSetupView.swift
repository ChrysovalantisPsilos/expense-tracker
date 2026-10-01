// Settings › Meal vouchers (VoucherSetupModel), edited in place: the switch,
// then (on) the amount per working day, whose working days, the next
// top-up's date and what's on the card today, each with the web's hint; Save
// at the end, which says what it did over the form.
import SwiftUI

@MainActor
struct VoucherSetupView: View {
    @Bindable var model: VoucherSetupModel
    @Environment(AppLanguage.self) private var language
    @State private var saved: SetupSaved?

    var body: some View {
        List {
            if let loadError = model.loadError {
                Section { NativeFailed(message: loadError) { await model.load() } }.listRowBackground(Color.clear)
            } else if !model.ready {
                Section { NativeLoading() }.listRowBackground(Color.clear)
            } else {
                if let failed = model.failed {
                    Section { NativeNotice(text: failed, warning: true) }.listRowBackground(NativeStyle.card)
                } else if let saved {
                    Section {
                        NativeNotice(text: saved.title)
                        if let note = saved.note { Text(note).font(.footnote).foregroundStyle(.secondary) }
                    }
                    .listRowBackground(NativeStyle.card)
                }
                Section {
                    Toggle(language.t("vouchers:setup.on"), isOn: $model.on)
                        .tint(NativeStyle.positive)
                        .accessibilityIdentifier("vouchers.on")
                } footer: {
                    Text(language.t("vouchers:setup.lead"))
                }
                .listRowBackground(NativeStyle.card)
                if model.on { fields }
                Section {
                    Button {
                        Task {
                            if let answer = await model.save() {
                                saved = answer
                            }
                        }
                    } label: {
                        Text(language.t("vouchers:setup.save")).fontWeight(.semibold).frame(maxWidth: .infinity)
                    }
                    .disabled(model.busy)
                    .accessibilityIdentifier("vouchers.save")
                }
                .listRowBackground(NativeStyle.card)
            }
        }
        .listStyle(.insetGrouped)
        .scrollContentBackground(.hidden)
        .background(NativeStyle.canvas)
        .scrollDismissesKeyboard(.interactively)
        .nativeTabBarRoom()
        .navigationTitle(language.t("vouchers:setup.title"))
        .task { if !model.ready { await model.load() } }
        .sensoryFeedback(.success, trigger: saved)
    }

    @ViewBuilder private var fields: some View {
        Section {
            amountField(model.perDay, set: model.setPerDay, id: "vouchers.perDay")
        } header: {
            NativeCapsHeader(title: language.t("vouchers:setup.perDay"))
        } footer: {
            if model.missing {
                Text(language.t("vouchers:setup.needAmount")).foregroundStyle(NativeStyle.negative)
            } else {
                Text(language.t("vouchers:setup.perDayHint"))
            }
        }
        .listRowBackground(NativeStyle.card)

        Section {
            Picker(language.t("vouchers:setup.country"), selection: $model.country) {
                ForEach(model.countries, id: \.value) { choice in Text(choice.label).tag(choice.value) }
            }
            .pickerStyle(.inline)
            .labelsHidden()
            .accessibilityIdentifier("vouchers.country")
        } header: {
            NativeCapsHeader(title: language.t("vouchers:setup.country"))
        }
        .listRowBackground(NativeStyle.card)

        Section {
            DatePicker(language.t("vouchers:setup.topUpDate"),
                       selection: Binding(get: { ISODay.date(model.topUpOn) ?? Date() },
                                          set: { model.topUpOn = ISODay.string($0) }),
                       displayedComponents: .date)
                .accessibilityIdentifier("vouchers.topUp")
        } footer: {
            Text(language.t("vouchers:setup.topUpDateHint"))
        }
        .listRowBackground(NativeStyle.card)

        Section {
            amountField(model.onCard, set: model.setOnCard, id: "vouchers.onCard")
        } header: {
            NativeCapsHeader(title: language.t("vouchers:setup.balance"))
        } footer: {
            Text(language.t("vouchers:setup.balanceHint"))
        }
        .listRowBackground(NativeStyle.card)
    }

    private func amountField(_ value: String, set: @escaping (String) -> Void, id: String) -> some View {
        HStack {
            TextField(model.placeholder, text: Binding(get: { value }, set: set))
                .keyboardType(.decimalPad)
                .font(.body.weight(.semibold))
                .monospacedDigit()
                .accessibilityIdentifier(id)
            Text(verbatim: model.currency).foregroundStyle(.secondary)
        }
    }
}

/// Settings › Meal vouchers with its model made once (so typing survives the page's refreshes).
@MainActor
struct VoucherSetupHost: View {
    let data: DataLayer
    @State private var model: VoucherSetupModel?

    var body: some View {
        Group {
            if let model {
                VoucherSetupView(model: model)
            } else {
                NativeLoading().background(NativeStyle.canvas)
            }
        }
        .onAppear { if model == nil { model = VoucherSetupModel(data: data) } }
    }
}
