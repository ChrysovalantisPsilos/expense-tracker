// A category's page (CategoryPageModel), as the web's: the badge, what kind
// of category it is, the period's total with the period picker, the month's
// budget (its bar, or Set a budget this month), then the entries paid in
// the period (a tap opens Edit). The pencil opens Edit in place for an
// expense category (this month's cap, Save or Cancel, and the category's
// own editor for its name, icon and colour); an income category's pencil
// opens that editor. The uncategorised bucket has nothing to edit.
import SwiftUI

@MainActor
struct CategoryPageView: View {
    @Bindable var model: CategoryPageModel
    /// Opens a saved entry in the Add sheet's Edit.
    let open: (JSONValue) -> Void
    @Environment(AppLanguage.self) private var language
    @FocusState private var capFocused: Bool

    var body: some View {
        List {
            switch model.state {
            case .loading:
                Section { NativeLoading() }.listRowBackground(Color.clear)
            case .failed(let message):
                Section { NativeFailed(message: message) { await model.load() } }.listRowBackground(Color.clear)
            case .loaded(let figures):
                if figures.found {
                    page(figures)
                } else {
                    Section {
                        ContentUnavailableView(figures.title ?? "", systemImage: "tag.slash",
                                               description: Text(figures.text ?? ""))
                    }
                    .listRowBackground(Color.clear)
                }
            }
        }
        .listStyle(.insetGrouped)
        .listSectionSpacing(20)
        .scrollContentBackground(.hidden)
        .background(NativeStyle.canvas)
        .scrollDismissesKeyboard(.interactively)
        .nativeTabBarRoom()
        .navigationTitle(model.figures?.name ?? "")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar { editButton }
        .refreshable { await model.load() }
        .task(id: language.current) { await model.load() }
        .sensoryFeedback(.selection, trigger: model.periodValue)
    }

    // MARK: The page

    @ViewBuilder private func page(_ figures: CategoryPageFigures) -> some View {
        Section { hero(figures) }
            .listRowInsets(EdgeInsets())
            .listRowBackground(Color.clear)
        if let message = model.message {
            Section { NativeNotice(text: message, warning: model.warning) }.listRowBackground(NativeStyle.card)
        }
        if model.editing && figures.editable == true && figures.kind == "expense" {
            editSection(figures)
        }
        if let line = figures.budget {
            Section { budgetRow(line) }.listRowBackground(NativeStyle.card)
        }
        entries(figures)
    }

    /// The badge, the eyebrow, the total and the period picker.
    private func hero(_ figures: CategoryPageFigures) -> some View {
        VStack(spacing: 8) {
            if let look = figures.look { CategoryBadge(look: look, size: 52) }
            Text((figures.eyebrow ?? "").capsLabel)
                .font(.caption.weight(.semibold))
                .foregroundStyle(.secondary)
            Text(figures.totalLabel ?? "")
                .font(.subheadline)
                .foregroundStyle(.secondary)
            Text(figures.total ?? "")
                .font(NativeStyle.money(40))
                .monospacedDigit()
                .lineLimit(1)
                .minimumScaleFactor(0.6)
                .accessibilityIdentifier("category.total")
            periodPicker(figures)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 8)
    }

    private func periodPicker(_ figures: CategoryPageFigures) -> some View {
        Menu {
            Picker(language.t("categories:page.period"),
                   selection: Binding(get: { figures.period?.value ?? "" },
                                      set: { value in Task { await model.setPeriod(value) } })) {
                ForEach(model.periods, id: \.value) { period in Text(period.label).tag(period.value) }
            }
        } label: {
            HStack(spacing: 6) {
                Text(figures.period?.label ?? "")
                Image(systemName: "chevron.up.chevron.down").imageScale(.small)
            }
            .font(.subheadline.weight(.semibold))
            .padding(.horizontal, 14)
            .padding(.vertical, 8)
            .nativeGlass(Capsule(), interactive: true)
        }
        .accessibilityLabel(language.t("categories:page.period"))
        .accessibilityValue(figures.period?.label ?? "")
        .accessibilityIdentifier("category.period")
    }

    // MARK: The budget

    @ViewBuilder private func budgetRow(_ line: CategoryBudgetLine) -> some View {
        switch line.state {
        case "bar":
            VStack(alignment: .leading, spacing: 9) {
                HStack(spacing: 12) {
                    NativeIconTile(symbol: "target", color: NativeStyle.tone(line.tone), size: 34)
                    VStack(alignment: .leading, spacing: 2) {
                        HStack(alignment: .firstTextBaseline) {
                            Text(line.title ?? "").font(.body.weight(.medium))
                            Spacer(minLength: 8)
                            Text(verbatim: "\(line.percent ?? 0)%")
                                .font(.subheadline.weight(.semibold))
                                .foregroundStyle(line.tone == nil ? Color.primary : NativeStyle.tone(line.tone))
                                .monospacedDigit()
                        }
                        Text(line.meta ?? "").font(.footnote).foregroundStyle(.secondary).monospacedDigit()
                    }
                }
                NativeBar(fraction: Double(line.percent ?? 0) / 100, color: NativeStyle.tone(line.tone))
                if let carried = line.carried {
                    Text(carried).font(.caption).foregroundStyle(.secondary)
                }
            }
            .padding(.vertical, 4)
            .accessibilityElement(children: .combine)
        case "set":
            Button {
                if !model.editing { model.toggleEdit() }
                capFocused = true
            } label: {
                Label(line.text ?? "", systemImage: "target")
            }
            .accessibilityIdentifier("category.setBudget")
        default:
            Text(line.text ?? "").font(.subheadline).foregroundStyle(.secondary)
        }
    }

    /// Edit, in place: this month's cap (or why it can't change here), the
    /// category's own editor, then Cancel and Save.
    private func editSection(_ figures: CategoryPageFigures) -> some View {
        Section {
            if figures.canEditBudget == true {
                HStack {
                    Text(language.t("categories:page.monthlyBudget"))
                    Spacer()
                    TextField(model.budgetPlaceholder,
                              text: Binding(get: { model.budgetText }, set: { model.setBudgetText($0) }))
                        .keyboardType(.decimalPad)
                        .multilineTextAlignment(.trailing)
                        .focused($capFocused)
                        .accessibilityIdentifier("category.cap")
                }
            } else {
                Text(language.t("categories:page.budgetPast")).font(.subheadline).foregroundStyle(.secondary)
            }
            NavigationLink(value: AppRoute.category(model.categoryId)) {
                Label(language.t("categories:page.editTitle", ["name": .string(figures.name ?? "")]),
                      systemImage: "paintpalette")
            }
            .accessibilityIdentifier("category.editor")
            if figures.canEditBudget == true {
                HStack(spacing: 12) {
                    Button(language.t("common:actions.cancel")) { model.toggleEdit() }
                        .nativeGlassButton()
                    Button(language.t("common:actions.save")) {
                        Task {
                            if await model.saveBudget() { NativeHaptics.success() }
                        }
                    }
                    .nativeGlassButton(prominent: true)
                    .disabled(model.busy)
                    .accessibilityIdentifier("category.save")
                }
                .frame(maxWidth: .infinity)
                .listRowBackground(Color.clear)
            }
        } header: {
            NativeCapsHeader(title: language.t("common:actions.edit"))
        } footer: {
            if figures.canEditBudget == true { Text(figures.budgetHelp ?? "") }
        }
        .listRowBackground(NativeStyle.card)
    }

    // MARK: The entries

    private func entries(_ figures: CategoryPageFigures) -> some View {
        Section {
            let rows = figures.rows ?? []
            if rows.isEmpty {
                Text(language.t("categories:page.empty")).font(.subheadline).foregroundStyle(.secondary)
            }
            ForEach(rows) { row in
                if row.shared {
                    EntryRowView(row: row)
                } else {
                    Button {
                        if let saved = model.row(id: row.id) { open(saved) }
                    } label: {
                        EntryRowView(row: row)
                    }
                    .foregroundStyle(Color.primary)
                }
            }
        } header: {
            VStack(alignment: .leading, spacing: 2) {
                Text(figures.listTitle ?? "").font(.title3.weight(.semibold)).foregroundStyle(Color.primary)
                Text(figures.listSubtitle ?? "").font(.footnote).foregroundStyle(.secondary)
            }
            .textCase(nil)
            .padding(.horizontal, -4)
        }
        .listRowBackground(NativeStyle.card)
    }

    // MARK: Edit

    @ToolbarContentBuilder private var editButton: some ToolbarContent {
        if let figures = model.figures, figures.editable == true {
            ToolbarItem(placement: .topBarTrailing) {
                if figures.kind == "expense" {
                    Button { model.toggleEdit() } label: {
                        Image(systemName: model.editing ? "xmark" : "pencil")
                    }
                    .accessibilityLabel(language.t(model.editing ? "common:actions.close" : "common:actions.edit"))
                    .accessibilityIdentifier("category.edit")
                } else {
                    NavigationLink(value: AppRoute.category(model.categoryId)) { Image(systemName: "pencil") }
                        .accessibilityLabel(language.t("common:actions.edit"))
                        .accessibilityIdentifier("category.edit")
                }
            }
        }
    }
}

/// The page for a category id (or the uncategorised bucket) and a period
/// value from a link, its model made once.
@MainActor
struct CategoryPageHost: View {
    let id: String
    let period: String?
    let data: DataLayer
    let live: LiveHub
    let open: (JSONValue) -> Void
    @State private var model: CategoryPageModel?

    var body: some View {
        Group {
            if let model {
                CategoryPageView(model: model, open: open)
                    .liveRefresh(live, tables: ["transactions", "categories", "profiles", "budgets"]) { await model.load() }
            } else {
                NativeLoading().background(NativeStyle.canvas)
            }
        }
        .onAppear {
            if model == nil { model = CategoryPageModel(categoryId: id, periodValue: period, data: data) }
        }
    }
}
