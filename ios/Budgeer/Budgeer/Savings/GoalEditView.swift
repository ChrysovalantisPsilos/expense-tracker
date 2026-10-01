// A savings goal's page (GoalEditorModel), edited in place: the name, the
// target and what's saved so far in the goal's currency, the optional target
// date, then Add goal / Save changes; an existing goal's Delete asks first.
// Saved or deleted, it goes back to Savings.
import SwiftUI

@MainActor
struct GoalEditView: View {
    let model: GoalEditorModel
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
                    TextField(language.t("savings:goal.nameHint"), text: Binding(get: { model.name }, set: { model.setName($0) }))
                        .font(.body.weight(.semibold))
                        .accessibilityIdentifier("goal.name")
                } header: {
                    NativeCapsHeader(title: language.t("savings:goal.name"))
                }
                .listRowBackground(NativeStyle.card)
                Section {
                    amountRow(model.targetLabel, value: model.target, set: model.setTarget, id: "goal.target")
                    amountRow(language.t("savings:goal.saved"), value: model.saved, set: model.setSaved, id: "goal.saved")
                    Toggle(language.t("savings:goal.targetDate"),
                           isOn: Binding(get: { model.dated }, set: { model.setDated($0) }))
                        .tint(NativeStyle.positive)
                        .accessibilityIdentifier("goal.dated")
                    if model.dated {
                        DatePicker(language.t("savings:goal.targetDate"),
                                   selection: Binding(get: { ISODay.date(model.targetDate) ?? Date() },
                                                      set: { model.setTargetDate(ISODay.string($0)) }),
                                   displayedComponents: .date)
                            .labelsHidden()
                            .accessibilityIdentifier("goal.date")
                    }
                }
                .listRowBackground(NativeStyle.card)
                Section {
                    Button {
                        Task { if await model.save() { done += 1; dismiss() } }
                    } label: {
                        Text(language.t(model.isNew ? "savings:goal.add" : "savings:goal.save"))
                            .fontWeight(.semibold)
                            .frame(maxWidth: .infinity)
                    }
                    .disabled(model.busy)
                    .accessibilityIdentifier("goal.save")
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
                        .accessibilityIdentifier("goal.delete")
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
        .navigationTitle(language.t(model.isNew ? "savings:goal.titleNew" : "savings:goal.titleEdit"))
        .task { await model.load() }
        .sensoryFeedback(.success, trigger: done)
        .confirmationDialog(language.t("savings:goals.deleteQuestion", ["name": .string(model.name)]),
                            isPresented: $confirming, titleVisibility: .visible) {
            Button(language.t("common:actions.delete"), role: .destructive) {
                Task { if await model.delete() { dismiss() } }
            }
            Button(language.t("common:actions.cancel"), role: .cancel) {}
        }
    }

    private func amountRow(_ label: String, value: String, set: @escaping (String) -> Void, id: String) -> some View {
        HStack {
            Text(label)
            Spacer(minLength: 12)
            TextField(model.placeholder, text: Binding(get: { value }, set: set))
                .keyboardType(.decimalPad)
                .multilineTextAlignment(.trailing)
                .monospacedDigit()
                .accessibilityIdentifier(id)
        }
    }
}

/// A goal's page from Savings: the goal as saved (nil for a new one), its
/// model made once; a goal that no longer exists says so (GoalPage's "gone").
@MainActor
struct GoalEditHost: View {
    let savings: SavingsModel
    let id: String?
    let data: DataLayer
    @Environment(AppLanguage.self) private var language
    @State private var editor: GoalEditorModel?
    @State private var gone = false

    var body: some View {
        Group {
            if let editor {
                GoalEditView(model: editor)
            } else if gone {
                List {
                    Section { Text(language.t("savings:goal.gone")).foregroundStyle(.secondary) }
                        .listRowBackground(NativeStyle.card)
                }
                .scrollContentBackground(.hidden)
                .background(NativeStyle.canvas)
                .navigationTitle(language.t("savings:goal.titleEdit"))
            } else {
                NativeLoading().background(NativeStyle.canvas)
            }
        }
        .task {
            guard editor == nil, !gone else { return }
            guard let id else {
                editor = GoalEditorModel(goal: nil, data: data)
                return
            }
            if savings.goal(id: id) == nil { await savings.load() }
            if let goal = savings.goal(id: id) {
                editor = GoalEditorModel(goal: goal, data: data)
            } else {
                gone = true
            }
        }
    }
}
