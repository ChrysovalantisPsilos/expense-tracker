// Settings › Import rules (ImportRulesModel), as on the web: what a rule
// does, your rules with their category, direction and day added, searched
// in the bar and filtered by direction, 15 to a page. Tap one for its page
// (the text and the category, Save, Delete); swipe to delete. Deleting asks
// first. With no rules yet: how they're made, and Import a statement.
import SwiftUI

@MainActor
struct ImportRulesView: View {
    @Bindable var model: ImportRulesModel
    @Environment(AppLanguage.self) private var language

    var body: some View {
        List {
            Section {
                Text(language.t("import:rules.lead")).font(.subheadline)
            }
            .listRowBackground(Color.clear)
            .listRowInsets(EdgeInsets(top: 0, leading: 4, bottom: 0, trailing: 4))

            if let notice = model.notice {
                Section { NativeNotice(text: notice.title, warning: notice.warning) }.listRowBackground(NativeStyle.card)
            }
            switch model.state {
            case .loading:
                Section { NativeLoading() }.listRowBackground(Color.clear)
            case .failed(let message):
                Section { NativeFailed(message: message) { await model.load() } }.listRowBackground(Color.clear)
            case .loaded:
                if model.isEmpty { empty } else { list }
            }
        }
        .listStyle(.insetGrouped)
        .scrollContentBackground(.hidden)
        .background(NativeStyle.canvas)
        .searchable(text: Binding(get: { model.query }, set: { model.setQuery($0) }),
                    prompt: language.t("import:rules.search"))
        .nativeTabBarRoom()
        .navigationTitle(language.t("import:rules.title"))
        .refreshable { await model.load() }
        .task { await model.load() }
        .confirmationDialog(model.deleting.map { model.deleteTitle($0) } ?? "",
                            isPresented: Binding(get: { model.deleting != nil }, set: { if !$0 { model.deleting = nil } }),
                            titleVisibility: .visible) {
            Button(language.t("common:actions.delete"), role: .destructive) { Task { await model.confirmDelete() } }
            Button(language.t("common:actions.cancel"), role: .cancel) { model.deleting = nil }
        } message: {
            Text(language.t("import:rules.remove.body"))
        }
        .sensoryFeedback(.success, trigger: model.notice)
    }

    private var empty: some View {
        Section {
            VStack(spacing: 12) {
                Image(systemName: "wand.and.stars")
                    .font(.system(size: 30, weight: .semibold))
                    .foregroundStyle(NativeStyle.tint)
                Text(language.t("import:rules.empty.title")).font(.headline)
                Text(language.t("import:rules.empty.text")).font(.subheadline).foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
                NavigationLink(value: AppRoute.importStatement) {
                    Label(language.t("import:rules.empty.action"), systemImage: "square.and.arrow.down")
                }
                .nativeGlassButton(prominent: true)
                .accessibilityIdentifier("rules.import")
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 20)
        }
        .listRowBackground(NativeStyle.card)
    }

    @ViewBuilder private var list: some View {
        Section {
            Picker(language.t("import:rules.direction"), selection: Binding(get: { model.filter }, set: { model.setFilter($0) })) {
                ForEach(model.filters, id: \.value) { choice in Text(choice.label).tag(choice.value) }
            }
            .pickerStyle(.segmented)
            .accessibilityIdentifier("rules.filter")
        }
        .listRowBackground(Color.clear)
        .listRowInsets(EdgeInsets())

        Section {
            if model.noMatch {
                Text(language.t("import:rules.noMatch")).foregroundStyle(.secondary)
            }
            ForEach(model.items) { item in
                NavigationLink(value: AppRoute.importRule(item.id)) {
                    HStack(spacing: 12) {
                        CategoryBadge(look: item.look, size: 32)
                        VStack(alignment: .leading, spacing: 2) {
                            Text(verbatim: item.pattern).lineLimit(1)
                            Text(item.meta).font(.footnote).foregroundStyle(.secondary).lineLimit(2)
                        }
                    }
                    .padding(.vertical, 2)
                }
                .swipeActions(edge: .trailing, allowsFullSwipe: false) {
                    Button(role: .destructive) {
                        model.deleting = item
                    } label: {
                        Label(language.t("common:actions.delete"), systemImage: "trash")
                    }
                }
                .accessibilityIdentifier("rules.row.\(item.pattern)")
            }
            if model.pages > 1 { pager }
        } header: {
            NativeCapsHeader(title: [language.t("import:rules.yours"), model.countLabel].compactMap { $0 }.joined(separator: " · "))
        }
        .listRowBackground(NativeStyle.card)
    }

    /// Previous, "1 of 3", next (the web's Paginator).
    private var pager: some View {
        HStack {
            Button {
                model.step(-1)
            } label: {
                Image(systemName: "chevron.left").frame(width: 44, height: 32)
            }
            .disabled(model.page <= 1)
            .accessibilityLabel(language.t("common:paginator.previous"))
            Spacer()
            Text(model.position).font(.footnote).foregroundStyle(.secondary)
            Spacer()
            Button {
                model.step(1)
            } label: {
                Image(systemName: "chevron.right").frame(width: 44, height: 32)
            }
            .disabled(model.page >= model.pages)
            .accessibilityLabel(language.t("common:paginator.next"))
        }
        .buttonStyle(.borderless)
    }
}

/// A rule's page (ImportRuleEditor): the text with its hint or problem, the
/// category by direction, the note that only future imports change; Save in
/// the bar, Delete at the end.
@MainActor
struct ImportRuleView: View {
    @Bindable var model: ImportRuleEditor
    let rules: ImportRulesModel
    @Environment(AppLanguage.self) private var language
    @Environment(\.dismiss) private var dismiss
    @FocusState private var typing: Bool

    var body: some View {
        List {
            Section {
                TextField(language.t("import:rules.edit.pattern"), text: Binding(get: { model.pattern }, set: { model.setPattern($0) }))
                    .focused($typing)
                    .autocorrectionDisabled()
                    .textInputAutocapitalization(.characters)
                    .submitLabel(.done)
                    .onSubmit { model.touched = true }
                    .accessibilityIdentifier("rule.pattern")
            } header: {
                NativeCapsHeader(title: language.t("import:rules.edit.pattern"))
            } footer: {
                if let problem = model.shownProblem {
                    Text(problem).foregroundStyle(NativeStyle.negative)
                } else {
                    Text(language.t("import:rules.edit.patternHint"))
                }
            }
            .listRowBackground(NativeStyle.card)

            Section {
                Picker(language.t("import:rules.edit.category"), selection: $model.categoryId) {
                    ForEach(model.groups, id: \.kind) { group in
                        Section(group.label) {
                            ForEach(group.categories, id: \.id) { category in Text(category.name).tag(category.id) }
                        }
                    }
                }
                .pickerStyle(.navigationLink)
                .accessibilityIdentifier("rule.category")
            } footer: {
                VStack(alignment: .leading, spacing: 6) {
                    Text(language.t("import:rules.edit.categoryHint"))
                    if model.textChanged { Text(language.t("import:rules.edit.futureOnly")) }
                }
            }
            .listRowBackground(NativeStyle.card)

            Section {
                Button(role: .destructive) {
                    if let item = rules.item(id: model.id) {
                        rules.deleting = item
                        dismiss()
                    }
                } label: {
                    Text(language.t("common:actions.delete")).frame(maxWidth: .infinity)
                }
                .accessibilityIdentifier("rule.delete")
            }
            .listRowBackground(NativeStyle.card)
        }
        .listStyle(.insetGrouped)
        .scrollContentBackground(.hidden)
        .background(NativeStyle.canvas)
        .scrollDismissesKeyboard(.interactively)
        .nativeTabBarRoom()
        .navigationTitle(language.t("import:rules.edit.title"))
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .confirmationAction) {
                Button(language.t("common:actions.save")) {
                    Task {
                        if await model.save() {
                            await rules.saved()
                            dismiss()
                        }
                    }
                }
                .fontWeight(.semibold)
                .disabled(model.busy)
                .accessibilityIdentifier("rule.save")
            }
        }
        .onChange(of: typing) { _, focused in if !focused { model.touched = true } }
    }
}

/// A rule's page with its editor made once from the list's rows.
@MainActor
struct ImportRuleHost: View {
    let rules: ImportRulesModel
    let id: String
    @State private var editor: ImportRuleEditor?

    var body: some View {
        Group {
            if let editor {
                ImportRuleView(model: editor, rules: rules)
            } else {
                NativeLoading().background(NativeStyle.canvas)
            }
        }
        .task {
            guard editor == nil else { return }
            if rules.state != .loaded { await rules.load() }
            editor = rules.editor(id: id)
        }
    }
}
