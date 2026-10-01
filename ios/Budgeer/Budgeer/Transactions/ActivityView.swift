// Activity (the web's Transactions): the picked month's entries by day
// under sticky day headings, a search field under the large title, and a
// floating glass pill that steps through the months and filters by kind
// and category. Swipe left to delete (it asks first); swipe right to
// duplicate or split with a group; tap a row to edit it in the Add sheet.
// A group's share is read-only here (it's edited in the group). Every
// figure and word is LedgerModel's (the core's).
import SwiftUI

@MainActor
struct ActivityView: View {
    let model: LedgerModel
    let chrome: PageChrome
    /// A row's saved transaction, to edit, duplicate or split.
    let open: (JSONValue) -> Void
    let duplicate: (JSONValue) -> Void
    let split: (JSONValue) -> Void
    @Environment(AppLanguage.self) private var language
    @State private var pendingDelete: String?
    @State private var deleted = 0
    @State private var notice: String?

    var body: some View {
        List {
            switch model.state {
            case .loading:
                NativeLoading().listRowSeparator(.hidden)
            case .failed(let message):
                NativeFailed(message: message) { await model.load() }.listRowSeparator(.hidden)
            case .loaded(let figures):
                if let notice {
                    NativeNotice(text: notice, warning: true).listRowSeparator(.hidden)
                }
                if figures.firstRun {
                    ContentUnavailableView(language.t("transactions:firstEntry.title"), systemImage: "tray")
                        .listRowSeparator(.hidden)
                } else if figures.days.isEmpty {
                    Text(figures.subtitle)
                        .foregroundStyle(.secondary)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 24)
                        .listRowSeparator(.hidden)
                } else {
                    Text(figures.subtitle)
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                        .listRowSeparator(.hidden)
                        .accessibilityIdentifier("activity.summary")
                    ForEach(figures.days) { day in
                        Section {
                            ForEach(day.rows) { row in rowView(row) }
                        } header: {
                            HStack(alignment: .firstTextBaseline) {
                                Text(day.title).font(.subheadline.weight(.semibold)).foregroundStyle(Color.primary)
                                Spacer()
                                if let spent = day.spent {
                                    Text(spent).font(.footnote).foregroundStyle(.secondary).monospacedDigit()
                                }
                            }
                            .textCase(nil)
                        }
                    }
                }
            }
        }
        .listStyle(.plain)
        .scrollContentBackground(.hidden)
        .background(NativeStyle.card)
        .searchable(text: Binding(get: { model.text }, set: { model.setText($0) }),
                    placement: .navigationBarDrawer(displayMode: .automatic),
                    prompt: language.t("transactions:ledger.search"))
        .safeAreaInset(edge: .bottom, spacing: 0) {
            ActivityPill(model: model).padding(.bottom, 8)
        }
        .nativeTabBarRoom()
        .navigationTitle(language.t("ios:native.tabs.activity"))
        .pageChrome(chrome)
        .refreshable { await model.reloadRows() }
        .task(id: language.current) { await model.load() }
        .confirmationDialog(pendingDelete.map { model.deleteWords(id: $0).title } ?? "",
                            isPresented: Binding(get: { pendingDelete != nil }, set: { if !$0 { pendingDelete = nil } }),
                            titleVisibility: .visible, presenting: pendingDelete) { id in
            Button(language.t("common:actions.delete"), role: .destructive) {
                Task {
                    if await model.delete(id: id) {
                        notice = nil
                        deleted += 1
                    } else {
                        notice = language.t("transactions:list.notDeleted")
                    }
                }
            }
            Button(language.t("common:actions.cancel"), role: .cancel) {}
        } message: { id in
            Text(model.deleteWords(id: id).body)
        }
        .sensoryFeedback(.success, trigger: deleted)
    }

    @ViewBuilder
    private func rowView(_ row: EntryRow) -> some View {
        if row.shared {
            EntryRowView(row: row)
        } else {
            Button {
                if let saved = model.row(id: row.id) { open(saved) }
            } label: {
                EntryRowView(row: row)
            }
            .foregroundStyle(Color.primary)
            .swipeActions(edge: .trailing, allowsFullSwipe: false) {
                Button(role: .destructive) {
                    pendingDelete = row.id
                } label: {
                    Label(language.t("common:actions.delete"), systemImage: "trash")
                }
            }
            .swipeActions(edge: .leading, allowsFullSwipe: false) {
                Button {
                    if let saved = model.row(id: row.id) { duplicate(saved) }
                } label: {
                    Label(language.t("ios:native.activity.duplicate"), systemImage: "plus.square.on.square")
                }
                .tint(Color.gray)
                if row.kind == "expense" {
                    Button {
                        if let saved = model.row(id: row.id) { split(saved) }
                    } label: {
                        Label(language.t("ios:native.activity.split"), systemImage: "person.2.fill")
                    }
                    .tint(NativeStyle.solid)
                }
            }
            .accessibilityIdentifier("activity.row.\(row.id)")
        }
    }
}

/// An entry: its badge, its name, the muted line (the category, where
/// savings came from, the notes; the group it's shared in; how it repeats; a
/// yearly payment's monthly share; which month a late salary counts for),
/// and the signed amount (income in green) with a foreign amount's value.
struct EntryRowView: View {
    let row: EntryRow

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            CategoryBadge(look: row.look, size: 38)
            VStack(alignment: .leading, spacing: 2) {
                Text(row.title).font(.body.weight(.medium)).lineLimit(1)
                if !line.isEmpty {
                    Text(line).font(.footnote).foregroundStyle(.secondary).lineLimit(2)
                }
                if let group = row.group {
                    Label(group, systemImage: "person.2.fill")
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(NativeStyle.tint)
                        .labelStyle(.titleAndIcon)
                }
                if let repeats = row.repeats {
                    Label(repeats, systemImage: "repeat")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }
            Spacer(minLength: 8)
            VStack(alignment: .trailing, spacing: 2) {
                Text(row.amount)
                    .font(.body.weight(.semibold))
                    .foregroundStyle(row.tone == "positive" ? NativeStyle.positive : Color.primary)
                    .monospacedDigit()
                if let approx = row.approx {
                    Text([approx, row.estimated].compactMap { $0 }.joined(separator: " · "))
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }
        }
        .padding(.vertical, 2)
        .accessibilityElement(children: .combine)
    }

    /// The muted line's parts in the web's order, " · " between them.
    private var line: String {
        (row.meta + [row.notes, row.spread, row.countsFor].compactMap { $0 }).joined(separator: " · ")
    }
}

/// The floating pill over Activity: the previous and next month either
/// side of the picked one, which opens the kind and category filters.
@MainActor
struct ActivityPill: View {
    let model: LedgerModel
    @Environment(AppLanguage.self) private var language

    var body: some View {
        HStack(spacing: 2) {
            step(-1, symbol: "chevron.left", label: "ios:native.activity.previousMonth")
            Menu {
                Picker(language.t("transactions:form.kind"), selection: Binding(get: { model.type }, set: { kind in
                    Task { await model.setType(kind) }
                })) {
                    Text(language.t("transactions:ledger.types.all")).tag("all")
                    Text(language.t("transactions:ledger.types.expense")).tag("expense")
                    Text(language.t("transactions:ledger.types.income")).tag("income")
                }
                if !model.categoryOptions.isEmpty {
                    Picker(language.t("transactions:ledger.category"), selection: Binding(get: { model.filter("categoryId") },
                                                                                        set: { id in
                        Task { await model.setFilter("categoryId", id) }
                    })) {
                        Text(language.t("transactions:ledger.anyCategory")).tag("")
                        ForEach(model.categoryOptions, id: \.id) { option in Text(option.name).tag(option.id) }
                    }
                    .pickerStyle(.menu)
                }
                if model.hasFilters {
                    Button(language.t("ios:native.activity.clearFilters"), role: .destructive) { Task { await model.clearAll() } }
                }
            } label: {
                HStack(spacing: 6) {
                    Text(model.period?.label ?? "")
                        .font(.subheadline.weight(.semibold))
                        .lineLimit(1)
                    Image(systemName: model.hasFilters || model.type != "all"
                          ? "line.3.horizontal.decrease.circle.fill" : "line.3.horizontal.decrease.circle")
                }
                .foregroundStyle(Color.primary)
                .padding(.horizontal, 6)
                .frame(minHeight: 44)
            }
            .accessibilityIdentifier("activity.filter")
            step(1, symbol: "chevron.right", label: "ios:native.activity.nextMonth")
        }
        .padding(.horizontal, 4)
        .nativeGlass(Capsule(), interactive: true)
        .sensoryFeedback(.selection, trigger: model.periodValue)
    }

    private func step(_ direction: Int, symbol: String, label: String) -> some View {
        let next = model.neighbour(direction)
        return Button {
            if let next { Task { await model.setPeriod(next.value) } }
        } label: {
            Image(systemName: symbol)
                .font(.subheadline.weight(.semibold))
                .frame(width: 44, height: 44)
        }
        .foregroundStyle(next == nil ? Color.secondary : NativeStyle.tint)
        .disabled(next == nil)
        .accessibilityLabel(language.t(label))
    }
}
