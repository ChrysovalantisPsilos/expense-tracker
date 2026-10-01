// A transaction row as the web's TransactionList draws it (ItemRow): the
// 32 pt category badge, the title over the muted line (MetaLine: date ·
// category · savings note · notes in italics, the group's tag, the repeat
// with its icon, a yearly payment's monthly share, a late salary's month),
// the amount with its sign and tone and a foreign amount's base value under
// it, then the ⋮ menu (Edit, Delete). Every word is rowParts'.
import SwiftUI
import BudgeerCore

struct EntryRowView: View {
    let row: EntryRow
    var actions: [RowAction] = []

    var body: some View {
        ItemRow(title: row.title,
                amount: row.amount,
                amountTone: row.tone == "positive" ? .positive : .default,
                amountMeta: row.approx.map { [$0, row.estimated].compactMap { $0 }.joined(separator: " · ") }) {
            CategoryBadge(look: row.look, size: 32)
        } meta: {
            MetaLineView(row: row)
        } trailing: {
            RowActionsMenu(actions: actions)
        }
    }
}

/// The muted line under a row's title (MetaLine): the parts joined by " · ",
/// the notes in italics, the group's tag, the repeat with its icon.
private struct MetaLineView: View {
    let row: EntryRow

    var body: some View {
        VStack(alignment: .leading, spacing: 3) {
            line
            if let group = row.group { KitTag(text: group, tone: .accent) }
            let after = [row.spread, row.countsFor].compactMap { $0 }
            if row.repeats != nil || !after.isEmpty {
                HStack(spacing: 4) {
                    if let repeats = row.repeats {
                        LucideIcon(icon: .repeat, size: 11)
                        Text(repeats)
                    }
                    if !after.isEmpty { Text((row.repeats == nil ? "" : "· ") + after.joined(separator: " · ")) }
                }
                .kitText(12, color: Theme.Colors.textMuted)
                .foregroundStyle(Theme.Colors.textMuted)
            }
        }
    }

    private var line: some View {
        let before = row.meta.joined(separator: " · ")
        var text = Text(before)
        if let notes = row.notes {
            text = text + Text(before.isEmpty ? "" : " · ") + Text(notes).italic()
        }
        return text
            .kitText(12, color: Theme.Colors.textMuted)
            .fixedSize(horizontal: false, vertical: true)
    }
}

/// A list of transactions (TransactionList): the rows, a group's share
/// read-only, the others opening Edit; Delete after the web's confirm.
struct TransactionListView: View {
    let rows: [EntryRow]
    /// The saved row behind a list row.
    let saved: (String) -> JSONValue?
    let open: (JSONValue) -> Void
    let delete: (JSONValue) async -> Void
    @Environment(AppLanguage.self) private var language
    @State private var removing: JSONValue?

    var body: some View {
        LazyVStack(spacing: 0) {
            ForEach(rows) { row in
                // The row opens Edit; its ⋮ menu takes its own taps.
                EntryRowView(row: row, actions: row.shared ? [] : [
                    RowAction(label: language.t("common:actions.edit"), icon: .pencil) {
                        if let saved = saved(row.id) { open(saved) }
                    },
                    RowAction(label: language.t("common:actions.delete"), icon: .trash2, danger: true) {
                        removing = saved(row.id)
                    },
                ])
                .contentShape(Rectangle())
                .onTapGesture {
                    if !row.shared, let saved = saved(row.id) { open(saved) }
                }
                .accessibilityAddTraits(row.shared ? [] : .isButton)
                .accessibilityIdentifier("row.\(row.id)")
            }
        }
        .confirmationDialog(removing.map { TransactionWords.deleteTitle($0) } ?? "",
                            isPresented: Binding(get: { removing != nil }, set: { if !$0 { removing = nil } }),
                            titleVisibility: .visible) {
            Button(language.t("common:actions.delete"), role: .destructive) {
                if let row = removing { Task { await delete(row) } }
            }
            Button(language.t("common:actions.cancel"), role: .cancel) {}
        } message: {
            if let row = removing { Text(TransactionWords.deleteBody(row)) }
        }
    }
}

/// DeleteTransactionDialog's words: "Delete this expense?", "Lunch · €12.00. This can't be undone."
enum TransactionWords {
    static func deleteTitle(_ row: JSONValue, core: BudgeerCore = .shared) -> String {
        core.text("transactions:deleteDialog.title.\(row["kind"]?.stringValue == "income" ? "income" : "expense")")
    }

    static func deleteBody(_ row: JSONValue, core: BudgeerCore = .shared) -> String {
        let name: String = (try? core.call("categoryName", "entryName",
                                           [row, core.text("transactions:deleteDialog.thisEntry")])) ?? ""
        let amount = core.formatMoney(row["amount_minor"] ?? 0, row["currency"]?.stringValue ?? "EUR")
        return core.text("transactions:deleteDialog.body", ["name": .string(name), "amount": .string(amount)])
    }
}
