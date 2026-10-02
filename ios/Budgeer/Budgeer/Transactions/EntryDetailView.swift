// Beside the sidebar, Activity's list sits beside the entry picked in it:
// its badge, name, amount (and a foreign amount's value) and day, Edit,
// Duplicate, Split with a group and Delete (asking first, in the web's
// words), then everything the row's muted line says, one fact a line. A
// group's share is only shown (it's edited in the group). Every word and
// figure is the row's (rowParts, through LedgerModel); nothing is worked
// out here. Nothing picked: a hint to pick an entry.
import SwiftUI

@MainActor
struct EntryPane: View {
    let model: LedgerModel
    /// The entry picked in the list, nil for none.
    let id: String?
    let edit: (JSONValue) -> Void
    let duplicate: (JSONValue) -> Void
    let split: (JSONValue) -> Void
    /// The entry was deleted: nothing is picked any more.
    let deleted: () -> Void
    @Environment(AppLanguage.self) private var language

    var body: some View {
        if let id, let shown = model.entry(id: id) {
            EntryDetailView(model: model, row: shown.row, day: shown.day, edit: edit, duplicate: duplicate, split: split,
                            deleted: deleted)
        } else {
            WidePlaceholder(symbol: "list.bullet.rectangle.portrait", text: language.t("ios:native.wide.pickEntry"))
        }
    }
}

@MainActor
struct EntryDetailView: View {
    let model: LedgerModel
    let row: EntryRow
    let day: EntryDay
    let edit: (JSONValue) -> Void
    let duplicate: (JSONValue) -> Void
    let split: (JSONValue) -> Void
    let deleted: () -> Void
    @Environment(AppLanguage.self) private var language
    @State private var confirmDelete = false
    @State private var failed = false

    var body: some View {
        ScrollView {
            VStack(spacing: 22) {
                head
                if !row.shared { actions }
                if failed { NativeNotice(text: language.t("transactions:list.notDeleted"), warning: true) }
                if !facts.isEmpty { factsCard }
            }
            .frame(maxWidth: 620)
            .padding(.horizontal, 24)
            .padding(.top, 12)
            .padding(.bottom, 40)
            .frame(maxWidth: .infinity)
        }
        .background(NativeStyle.canvas.ignoresSafeArea())
        .navigationTitle(row.title)
        .navigationBarTitleDisplayMode(.inline)
        .confirmationDialog(model.deleteWords(id: row.id).title, isPresented: $confirmDelete, titleVisibility: .visible) {
            Button(language.t("common:actions.delete"), role: .destructive) {
                Task {
                    if await model.delete(id: row.id) { deleted() } else { failed = true }
                }
            }
            Button(language.t("common:actions.cancel"), role: .cancel) {}
        } message: {
            Text(model.deleteWords(id: row.id).body)
        }
        .accessibilityIdentifier("activity.detail")
    }

    /// The badge, the name, the amount big, and the day.
    private var head: some View {
        VStack(spacing: 8) {
            CategoryBadge(look: row.look, size: 76)
                .padding(.bottom, 6)
            Text(row.title)
                .font(.title2.weight(.semibold))
                .multilineTextAlignment(.center)
            Text(row.amount)
                .font(NativeStyle.money(46))
                .foregroundStyle(row.tone == "positive" ? NativeStyle.positive : Color.primary)
                .monospacedDigit()
                .lineLimit(1)
                .minimumScaleFactor(0.5)
            if let approx = row.approx {
                Text([approx, row.estimated].compactMap { $0 }.joined(separator: " · "))
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            }
            Text(day.title)
                .font(.body)
                .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity)
        .accessibilityElement(children: .combine)
    }

    /// Edit, Duplicate, Split (an expense) and Delete, as on the row's swipes.
    private var actions: some View {
        HStack(spacing: 10) {
            action("common:actions.edit", symbol: "pencil") { if let saved = model.row(id: row.id) { edit(saved) } }
            action("ios:native.activity.duplicate", symbol: "plus.square.on.square") {
                if let saved = model.row(id: row.id) { duplicate(saved) }
            }
            if row.kind == "expense" {
                action("ios:native.activity.split", symbol: "person.2.fill") {
                    if let saved = model.row(id: row.id) { split(saved) }
                }
            }
            action("common:actions.delete", symbol: "trash") { confirmDelete = true }
        }
        .frame(maxWidth: .infinity)
    }

    private func action(_ key: String, symbol: String, run: @escaping () -> Void) -> some View {
        Button(action: run) {
            Label(language.t(key), systemImage: symbol)
                .font(.subheadline.weight(.semibold))
                .lineLimit(1)
                .padding(.horizontal, 4)
        }
        .nativeGlassButton()
        .accessibilityIdentifier("activity.detail.\(symbol)")
    }

    /// What the row's muted line says, one fact a line, with its symbol.
    private var facts: [(symbol: String, text: String)] {
        var list = row.meta.map { (symbol: "tag", text: $0) }
        if let notes = row.notes { list.append((symbol: "text.alignleft", text: notes)) }
        if let group = row.group { list.append((symbol: "person.2", text: group)) }
        if let repeats = row.repeats { list.append((symbol: "repeat", text: repeats)) }
        if let spread = row.spread { list.append((symbol: "calendar", text: spread)) }
        if let counts = row.countsFor { list.append((symbol: "calendar.badge.clock", text: counts)) }
        if let rate = row.rate { list.append((symbol: "arrow.left.arrow.right", text: rate)) }
        return list
    }

    private var factsCard: some View {
        VStack(alignment: .leading, spacing: 0) {
            ForEach(Array(facts.enumerated()), id: \.offset) { index, fact in
                if index > 0 { Divider().padding(.leading, 44) }
                Label {
                    Text(fact.text).fixedSize(horizontal: false, vertical: true)
                } icon: {
                    Image(systemName: fact.symbol).foregroundStyle(NativeStyle.tint)
                }
                .font(.body)
                .padding(.vertical, 13)
                .frame(maxWidth: .infinity, alignment: .leading)
            }
        }
        .padding(.horizontal, 18)
        .background(NativeStyle.card, in: RoundedRectangle(cornerRadius: 22, style: .continuous))
    }
}

/// Beside the sidebar, the page of a list with nothing picked yet.
struct WidePlaceholder: View {
    let symbol: String
    let text: String

    var body: some View {
        ContentUnavailableView {
            Label(text, systemImage: symbol)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(NativeStyle.canvas.ignoresSafeArea())
    }
}
