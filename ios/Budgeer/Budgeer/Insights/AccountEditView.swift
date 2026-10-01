// A net-worth account's page (AccountEditorModel), edited in place: the
// name, what it is (with the savings note), the balance in its currency,
// then Add account / Save changes; an existing account's Remove asks first.
// Saved or removed, it goes back to Insights.
import SwiftUI

@MainActor
struct AccountEditView: View {
    let model: AccountEditorModel
    @Environment(AppLanguage.self) private var language
    @Environment(\.dismiss) private var dismiss
    @State private var confirming = false
    @State private var done = 0

    var body: some View {
        List {
            if !model.ready {
                Section { NativeLoading() }.listRowBackground(Color.clear)
            } else {
                if let error = model.error {
                    Section { NativeNotice(text: error, warning: true) }.listRowBackground(NativeStyle.card)
                }
                Section {
                    TextField(language.t("insights:account.nameHint"),
                              text: Binding(get: { model.name }, set: { model.setName($0) }))
                        .font(.body.weight(.semibold))
                        .accessibilityIdentifier("account.name")
                } header: {
                    NativeCapsHeader(title: language.t("insights:account.name"))
                }
                .listRowBackground(NativeStyle.card)
                Section {
                    Picker(language.t("insights:account.type"),
                           selection: Binding(get: { model.type }, set: { model.setType($0) })) {
                        ForEach(model.types, id: \.value) { choice in Text(choice.label).tag(choice.value) }
                    }
                    .pickerStyle(.inline)
                    .labelsHidden()
                    .accessibilityIdentifier("account.type")
                } header: {
                    NativeCapsHeader(title: language.t("insights:account.type"))
                } footer: {
                    if model.type == "savings" { Text(language.t("insights:account.savingsHint")) }
                }
                .listRowBackground(NativeStyle.card)
                Section {
                    HStack {
                        Text(model.balanceLabel)
                        Spacer(minLength: 12)
                        TextField(text: Binding(get: { model.balance }, set: { model.setBalance($0) })) {
                            Text(verbatim: "0")
                        }
                        .keyboardType(.numbersAndPunctuation)
                        .multilineTextAlignment(.trailing)
                        .monospacedDigit()
                        .accessibilityIdentifier("account.balance")
                    }
                }
                .listRowBackground(NativeStyle.card)
                Section {
                    Button {
                        Task { if await model.save() { done += 1; dismiss() } }
                    } label: {
                        Text(language.t(model.isNew ? "insights:account.add" : "insights:account.save"))
                            .fontWeight(.semibold)
                            .frame(maxWidth: .infinity)
                    }
                    .disabled(model.busy)
                    .accessibilityIdentifier("account.save")
                }
                .listRowBackground(NativeStyle.card)
                if !model.isNew {
                    Section {
                        Button(role: .destructive) {
                            confirming = true
                        } label: {
                            Text(language.t("common:actions.delete")).frame(maxWidth: .infinity)
                        }
                        .disabled(model.busy)
                        .accessibilityIdentifier("account.delete")
                    }
                    .listRowBackground(NativeStyle.card)
                }
            }
        }
        .listStyle(.insetGrouped)
        .scrollContentBackground(.hidden)
        .background(NativeStyle.canvas)
        .scrollDismissesKeyboard(.interactively)
        .nativeTabBarRoom()
        .navigationTitle(language.t(model.isNew ? "insights:account.titleNew" : "insights:account.titleEdit"))
        .task { await model.load() }
        .sensoryFeedback(.success, trigger: done)
        .confirmationDialog(language.t("insights:netWorth.removeQuestion", ["name": .string(model.name)]),
                            isPresented: $confirming, titleVisibility: .visible) {
            Button(language.t("common:actions.delete"), role: .destructive) {
                Task { if await model.delete() { dismiss() } }
            }
            Button(language.t("common:actions.cancel"), role: .cancel) {}
        }
    }
}

/// An account's page from Insights: the account as read (nil for a new one),
/// its model made once; an account that no longer exists says so.
@MainActor
struct AccountEditHost: View {
    let insights: InsightsModel
    let id: String?
    let data: DataLayer
    @Environment(AppLanguage.self) private var language
    @State private var editor: AccountEditorModel?
    @State private var gone = false

    var body: some View {
        Group {
            if let editor {
                AccountEditView(model: editor)
            } else if gone {
                List {
                    Section { Text(language.t("insights:account.gone")).foregroundStyle(.secondary) }
                        .listRowBackground(NativeStyle.card)
                }
                .scrollContentBackground(.hidden)
                .background(NativeStyle.canvas)
                .navigationTitle(language.t("insights:account.titleEdit"))
            } else {
                NativeLoading().background(NativeStyle.canvas)
            }
        }
        .task {
            guard editor == nil, !gone else { return }
            guard let id else {
                editor = AccountEditorModel(account: nil, data: data)
                return
            }
            if insights.account(id) == nil { await insights.load() }
            if let account = insights.account(id) {
                editor = AccountEditorModel(account: account, data: data)
            } else {
                gone = true
            }
        }
    }
}
