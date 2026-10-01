// A category's page (CategoryEditorModel), for a new one or one of yours:
// the badge as it will look beside the name, the colour, the icon (the
// web's icons in their groups), "Counts as savings" on an income category,
// then Archive or Unarchive and Delete. Save (top right) writes it and goes
// back to the list, which says what happened.
import SwiftUI

@MainActor
struct CategoryEditView: View {
    @Bindable var model: CategoryEditorModel
    let categories: CategoriesModel
    @Environment(AppLanguage.self) private var language
    @Environment(\.dismiss) private var dismiss
    @State private var confirming = false
    @FocusState private var naming: Bool

    var body: some View {
        List {
            if let message = model.message {
                Section { NativeNotice(text: message, warning: true) }.listRowBackground(NativeStyle.card)
            }
            name
            if let picker = model.picker {
                colours(picker)
                ForEach(picker.icons) { group in icons(group) }
            }
            if model.kind == "income" {
                Section {
                    Toggle(language.t("categories:fields.savings"), isOn: $model.savings)
                        .tint(NativeStyle.positive)
                        .accessibilityIdentifier("category.savings")
                } footer: {
                    Text(language.t("categories:fields.savingsHelp"))
                }
                .listRowBackground(NativeStyle.card)
            }
            if !model.isNew { manage }
        }
        .listStyle(.insetGrouped)
        .scrollContentBackground(.hidden)
        .background(NativeStyle.canvas)
        .scrollDismissesKeyboard(.interactively)
        .nativeTabBarRoom()
        .navigationTitle(model.title)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .confirmationAction) {
                Button(language.t(model.isNew ? "categories:newPage.submit" : "common:actions.save")) {
                    Task { await save() }
                }
                .fontWeight(.semibold)
                .disabled(model.busy)
                .accessibilityIdentifier("category.save")
            }
        }
        .onChange(of: naming) { _, focused in if !focused && !model.name.isEmpty { model.touched = true } }
        .sheet(isPresented: $confirming) {
            DeleteCategorySheet(model: categories) { dismiss() }.environment(language)
        }
    }

    // MARK: The name

    private var name: some View {
        Section {
            HStack(spacing: 12) {
                CategoryBadge(look: model.look, size: 40)
                TextField(language.t(model.kind == "income" ? "categories:fields.placeholder.income"
                                     : "categories:fields.placeholder.expense"), text: $model.name)
                    .focused($naming)
                    .submitLabel(.done)
                    .onSubmit { model.touched = true }
                    .accessibilityIdentifier("category.name")
            }
            .padding(.vertical, 2)
        } header: {
            NativeCapsHeader(title: language.t("categories:fields.name"))
        } footer: {
            if model.touched, let error = model.nameError {
                Text(error).foregroundStyle(NativeStyle.negative)
            }
        }
        .listRowBackground(NativeStyle.card)
    }

    // MARK: Colour and icon

    private func colours(_ picker: CategoryPicker) -> some View {
        Section {
            LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 8), count: 5), spacing: 12) {
                swatch(nil, hex: nil, label: language.t("categories:fields.defaultColour"))
                ForEach(picker.colours) { colour in swatch(colour.key, hex: colour.hex, label: colour.label) }
            }
            .padding(.vertical, 6)
        } header: {
            NativeCapsHeader(title: language.t("categories:fields.colour"))
        } footer: {
            Text(language.t("categories:fields.colourHelp"))
        }
        .listRowBackground(NativeStyle.card)
    }

    private func swatch(_ key: String?, hex: String?, label: String) -> some View {
        let on = model.color == key
        return Button {
            model.color = key
        } label: {
            ZStack {
                Circle().fill(hex.flatMap { Color(hexString: $0) } ?? Theme.Colors.subtle)
                Circle().strokeBorder(on ? Color.primary : Color.secondary.opacity(0.25), lineWidth: 2)
                if on {
                    Image(systemName: "checkmark")
                        .font(.footnote.weight(.bold))
                        .foregroundStyle(hex == nil ? Color.secondary : Color.white)
                }
            }
            .frame(width: 40, height: 40)
        }
        .buttonStyle(.plain)
        .accessibilityLabel(label)
        .accessibilityAddTraits(on ? .isSelected : [])
        .accessibilityIdentifier("category.colour.\(key ?? "default")")
    }

    private func icons(_ group: CategoryPicker.IconGroup) -> some View {
        Section {
            LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 6), count: 6), spacing: 6) {
                ForEach(group.keys) { icon in
                    let on = model.icon == icon.key
                    Button {
                        model.icon = icon.key
                    } label: {
                        Image(CategoryBadge.asset(for: icon.key))
                            .renderingMode(.template)
                            .resizable()
                            .scaledToFit()
                            .frame(width: 20, height: 20)
                            .foregroundStyle(on ? Color.white : Theme.Colors.accentFg)
                            .frame(width: 44, height: 44)
                            .background(on ? NativeStyle.solid : Theme.Colors.subtle,
                                        in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel(icon.label)
                    .accessibilityAddTraits(on ? .isSelected : [])
                    .accessibilityIdentifier("category.icon.\(icon.key)")
                }
            }
            .padding(.vertical, 6)
        } header: {
            NativeCapsHeader(title: group.label)
        }
        .listRowBackground(NativeStyle.card)
    }

    // MARK: Archive and delete

    private var manage: some View {
        Section {
            Button {
                Task {
                    if await model.toggleArchive() {
                        let shown = categories.item(model.category ?? [:])?.name ?? model.name
                        categories.say(language.t(model.archived ? "categories:toasts.unarchived" : "categories:toasts.archived",
                                                  ["name": .string(shown)]))
                        await categories.load()
                        dismiss()
                    }
                }
            } label: {
                Label(language.t(model.archived ? "categories:actions.unarchive" : "categories:actions.archive"),
                      systemImage: model.archived ? "tray.and.arrow.up" : "archivebox")
            }
            .disabled(model.busy)
            .accessibilityIdentifier("category.archive")
            Button(role: .destructive) {
                guard let item = categories.item(model.category ?? [:]) else { return }
                confirming = true
                Task { await categories.startDelete(item) }
            } label: {
                Label(language.t("common:actions.delete"), systemImage: "trash")
            }
            .accessibilityIdentifier("category.delete")
        } footer: {
            Text(language.t("categories:deleteDialog.budgetsGo"))
        }
        .listRowBackground(NativeStyle.card)
    }

    private func save() async {
        guard await model.save() else { return }
        if let words = model.message { categories.say(words) }
        await categories.load()
        NativeHaptics.success()
        dismiss()
    }
}

/// The page's host: the editor made once for the category (or a new one of `kind`).
@MainActor
struct CategoryEditHost: View {
    let categories: CategoriesModel
    let id: String?
    let kind: String
    @State private var editor: CategoryEditorModel?

    var body: some View {
        Group {
            if let editor {
                CategoryEditView(model: editor, categories: categories)
            } else {
                NativeLoading().background(NativeStyle.canvas)
            }
        }
        .task {
            guard editor == nil else { return }
            if categories.state != .loaded { await categories.load() }
            editor = categories.editor(id: id, kind: kind)
        }
    }
}
