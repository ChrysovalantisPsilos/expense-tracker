// Budgets (from Home's "See all" and More): this month's caps with their
// spend, each row's bar easing to its percent (a light warning tap the
// first time one crosses its cap). Tap a row (or swipe it) to change its
// cap; swipe it away to delete it; the floating Add sets a new one (the
// page lends it, AddSlot); "Copy last month's
// budgets" when they can be copied. Every figure and word is BudgetsModel's.
import SwiftUI

@MainActor
struct BudgetsView: View {
    @Bindable var model: BudgetsModel
    @Environment(AppLanguage.self) private var language
    @State private var editing = false
    @State private var confirmCopy = false
    @State private var removing: BudgetItem?

    var body: some View {
        List {
            switch model.state {
            case .loading:
                Section { NativeLoading() }.listRowBackground(Color.clear)
            case .failed(let message):
                Section { NativeFailed(message: message) { await model.load() } }.listRowBackground(Color.clear)
            case .loaded(let figures):
                if let message = model.message {
                    Section { NativeNotice(text: message) }
                }
                if figures.items.isEmpty {
                    Section {
                        ContentUnavailableView {
                            Label(language.t("budgets:empty.title"), systemImage: "chart.pie")
                        } description: {
                            Text(language.t("budgets:empty.text"))
                        } actions: {
                            Button(language.t("budgets:empty.first")) { startNew() }
                                .nativeGlassButton(prominent: true)
                            if figures.canCopy {
                                Button(language.t("budgets:copy.button")) { Task { await model.copyPrevious() } }
                                    .nativeGlassButton()
                            }
                        }
                    }
                    .listRowBackground(Color.clear)
                } else {
                    Section {
                        ForEach(figures.items) { item in
                            Button { edit(item) } label: { BudgetRowView(item: item) }
                                .foregroundStyle(Color.primary)
                                .swipeActions(edge: .trailing, allowsFullSwipe: false) {
                                    Button(role: .destructive) { removing = item } label: {
                                        Label(language.t("common:actions.delete"), systemImage: "trash")
                                    }
                                }
                                .accessibilityIdentifier("budgets.row.\(item.categoryId)")
                        }
                    } header: {
                        NativeCapsHeader(title: figures.heading)
                    } footer: {
                        Text([figures.subtitle, language.t("budgets:rollover")].compactMap { $0 }.joined(separator: " "))
                    }
                    .listRowBackground(NativeStyle.card)
                    if figures.canCopy {
                        Section {
                            Button { confirmCopy = true } label: {
                                Label(language.t("budgets:copy.action"), systemImage: "doc.on.doc")
                            }
                        }
                        .listRowBackground(NativeStyle.card)
                    }
                }
            }
        }
        .listStyle(.insetGrouped)
        .scrollContentBackground(.hidden)
        .background(NativeStyle.canvas)
        .nativeTabBarRoom()
        .navigationTitle(language.t("budgets:title"))
        .lendsAdd(.run { startNew() })
        .refreshable { await model.load() }
        .task(id: language.current) { await model.load() }
        .sensoryFeedback(.warning, trigger: overCount) { old, new in new > old }
        .sheet(isPresented: $editing) { capSheet.environment(language) }
        .confirmationDialog(language.t("budgets:copy.title"), isPresented: $confirmCopy, titleVisibility: .visible) {
            Button(language.t("budgets:copy.confirm")) { Task { await model.copyPrevious() } }
            Button(language.t("common:actions.cancel"), role: .cancel) {}
        } message: {
            Text(model.copyBody)
        }
        .confirmationDialog(language.t("budgets:delete", ["name": .string(removing?.name ?? "")]),
                            isPresented: Binding(get: { removing != nil }, set: { if !$0 { removing = nil } }),
                            titleVisibility: .visible, presenting: removing) { item in
            Button(language.t("common:actions.delete"), role: .destructive) { Task { await model.delete(item) } }
            Button(language.t("common:actions.cancel"), role: .cancel) {}
        }
    }

    /// How many budgets are over their cap (a new one over taps a warning).
    private var overCount: Int { model.figures?.items.filter(\.over).count ?? 0 }

    private func startNew() {
        model.formCategory = ""
        model.setAmount("")
        editing = true
    }

    private func edit(_ item: BudgetItem) {
        model.edit(item)
        editing = true
    }

    /// "Set a monthly cap": the category and its cap.
    private var capSheet: some View {
        NavigationStack {
            Form {
                Picker(language.t("budgets:form.category"), selection: $model.formCategory) {
                    Text(language.t("budgets:form.select")).tag("")
                    ForEach(model.categoryOptions, id: \.id) { option in Text(option.name).tag(option.id) }
                }
                HStack {
                    Text(language.t("budgets:form.cap"))
                    Spacer()
                    TextField(model.amountPlaceholder, text: Binding(get: { model.formAmount }, set: { model.setAmount($0) }))
                        .keyboardType(.decimalPad)
                        .multilineTextAlignment(.trailing)
                        .accessibilityIdentifier("budgets.cap")
                }
            }
            .navigationTitle(language.t("budgets:form.title"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button { editing = false } label: { Image(systemName: "xmark") }
                        .accessibilityLabel(language.t("common:actions.cancel"))
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button(language.t("budgets:form.submit")) {
                        Task {
                            if await model.setCap() {
                                NativeHaptics.success()
                                editing = false
                            }
                        }
                    }
                    .fontWeight(.semibold)
                    .disabled(!model.canSet)
                }
            }
        }
        .presentationDetents([.medium])
    }
}
