// Settings › Categories (CategoriesModel): Expenses or Income, then your
// categories with their badges (archived ones dimmed, under the active
// ones). Tap one for its page (its entries and budget; its pencil edits it);
// swipe to archive (or unarchive) or delete; +
// adds one of the kind shown. Deleting asks where its entries go first
// (DeleteCategorySheet), the one confirmation here.
import SwiftUI

@MainActor
struct CategoriesView: View {
    @Bindable var model: CategoriesModel
    @Environment(AppLanguage.self) private var language
    @State private var confirming = false

    var body: some View {
        List {
            Section {
                Picker(language.t("categories:list.typeLabel"), selection: $model.kind) {
                    Text(language.t("categories:kinds.expense")).tag("expense")
                    Text(language.t("categories:kinds.income")).tag("income")
                }
                .pickerStyle(.segmented)
                .accessibilityIdentifier("categories.kind")
            }
            .listRowBackground(Color.clear)
            .listRowInsets(EdgeInsets())

            switch model.state {
            case .loading:
                Section { NativeLoading() }.listRowBackground(Color.clear)
            case .failed(let message):
                Section { NativeFailed(message: message) { await model.load() } }.listRowBackground(Color.clear)
            case .loaded:
                if let message = model.message {
                    Section { NativeNotice(text: message, warning: model.warning) }.listRowBackground(NativeStyle.card)
                }
                list
            }
        }
        .listStyle(.insetGrouped)
        .scrollContentBackground(.hidden)
        .background(NativeStyle.canvas)
        .nativeTabBarRoom()
        .navigationTitle(language.t("categories:list.title"))
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                NavigationLink(value: AppRoute.newCategory(model.kind)) { Image(systemName: "plus") }
                    .accessibilityLabel(language.t("categories:actions.add"))
                    .accessibilityIdentifier("categories.add")
            }
        }
        .refreshable { await model.load() }
        .task { await model.load() }
        .sheet(isPresented: $confirming) {
            DeleteCategorySheet(model: model).environment(language)
        }
    }

    private var list: some View {
        Section {
            let items = model.items
            if items.isEmpty {
                Text(language.t("categories:list.empty.\(model.kind)")).foregroundStyle(.secondary)
            }
            ForEach(items) { item in
                NavigationLink(value: AppRoute.categoryPage(item.id, nil)) { CategoryRowView(item: item) }
                    .swipeActions(edge: .trailing, allowsFullSwipe: false) {
                        Button(role: .destructive) {
                            confirming = true
                            Task { await model.startDelete(item) }
                        } label: {
                            Label(language.t("common:actions.delete"), systemImage: "trash")
                        }
                        Button {
                            Task { await model.toggleArchive(item) }
                        } label: {
                            Label(language.t(item.archived ? "categories:actions.unarchive" : "categories:actions.archive"),
                                  systemImage: item.archived ? "tray.and.arrow.up" : "archivebox")
                        }
                        .tint(SettingsRow.slate)
                    }
                    .accessibilityIdentifier("categories.row.\(item.id)")
            }
        } header: {
            NativeCapsHeader(title: language.t("categories:list.yours"))
        } footer: {
            Text(language.t("categories:list.description"))
        }
        .listRowBackground(NativeStyle.card)
    }
}

/// A category in the list: its badge, its name ("New" beside a new default
/// one), and Archived or "Savings, not income" under it.
struct CategoryRowView: View {
    let item: CategoryItem
    @Environment(AppLanguage.self) private var language

    var body: some View {
        HStack(spacing: 12) {
            CategoryBadge(look: item.look, size: 32)
            VStack(alignment: .leading, spacing: 2) {
                HStack(spacing: 6) {
                    Text(item.name).lineLimit(1)
                    if item.isNew {
                        Text(language.t("categories:list.new"))
                            .font(.caption2.weight(.bold))
                            .foregroundStyle(NativeStyle.positive)
                            .padding(.horizontal, 6)
                            .padding(.vertical, 2)
                            .background(NativeStyle.positive.opacity(0.14), in: Capsule())
                    }
                }
                if item.archived {
                    Text(language.t("categories:list.archived")).font(.footnote).foregroundStyle(.secondary)
                } else if item.savings {
                    Text(language.t("categories:list.savings")).font(.footnote).foregroundStyle(.secondary)
                }
            }
        }
        .opacity(item.archived ? 0.6 : 1)
        .padding(.vertical, 2)
    }
}

/// Delete "Groceries"? Where its entries go (or that none use it), what
/// moves with them, and that its budgets go; then Delete.
@MainActor
struct DeleteCategorySheet: View {
    @Bindable var model: CategoriesModel
    var onDeleted: () -> Void = {}
    @Environment(AppLanguage.self) private var language
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            List {
                if let deletion = model.deleting {
                    Section {
                        if deletion.count == nil {
                            HStack(spacing: 10) {
                                ProgressView()
                                Text(language.t("categories:deleteDialog.checking")).foregroundStyle(.secondary)
                            }
                        } else if deletion.count == 0 {
                            Text(language.t("categories:deleteDialog.unused")).foregroundStyle(.secondary)
                        } else {
                            Picker(model.moveLabel(deletion),
                                   selection: Binding(get: { model.deleting?.moveTo ?? "" },
                                                      set: { model.deleting?.moveTo = $0 })) {
                                Text(language.t("categories:deleteDialog.leave")).tag("")
                                ForEach(deletion.targets, id: \.id) { target in Text(target.name).tag(target.id) }
                            }
                            .pickerStyle(.navigationLink)
                            .accessibilityIdentifier("categories.moveTo")
                        }
                    } footer: {
                        if let count = deletion.count, count != 0 {
                            Text(language.t("categories:deleteDialog.movesToo"))
                        }
                    }
                    .listRowBackground(NativeStyle.card)
                    Section {
                        Text(language.t("categories:deleteDialog.budgetsGo")).font(.subheadline).foregroundStyle(.secondary)
                    }
                    .listRowBackground(NativeStyle.card)
                }
            }
            .listStyle(.insetGrouped)
            .scrollContentBackground(.hidden)
            .background(NativeStyle.canvas)
            .navigationTitle(language.t("categories:deleteDialog.title", ["name": .string(model.deleting?.item.name ?? "")]))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(language.t("common:actions.cancel")) {
                        model.deleting = nil
                        dismiss()
                    }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button(role: .destructive) {
                        Task {
                            if await model.confirmDelete() {
                                NativeHaptics.success()
                                dismiss()
                                onDeleted()
                            }
                        }
                    } label: {
                        Text(language.t("common:actions.delete")).fontWeight(.semibold)
                    }
                    .tint(NativeStyle.negative)
                    .disabled(model.deleting?.count == nil || model.busy)
                    .accessibilityIdentifier("categories.deleteConfirm")
                }
            }
        }
        .presentationDetents([.medium, .large])
    }
}
