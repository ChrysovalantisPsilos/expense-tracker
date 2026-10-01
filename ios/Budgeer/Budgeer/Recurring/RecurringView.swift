// The Recurring page (from More), after the web's: back and "Recurring",
// then one card with Subscriptions | Income as line tabs. Subscriptions: a
// pill per frequency the user has (Weekly · Monthly · Quarterly · Yearly),
// each with its total per period (about how much a month, the rates notes)
// and its rules; Income: what the income rules bring in a month and the
// rules. A rule opens in the entry form (Repeat always on); its ⋮ menu
// pauses or resumes it, edits or removes it. No "add" here, as on the web:
// a recurring entry is added from Add with Repeat on (the empty tabs lead
// there).
import SwiftUI

@MainActor
struct RecurringView: View {
    @Bindable var model: RecurringModel
    var back: (() -> Void)? = nil
    var onOpen: (JSONValue) -> Void = { _ in }
    var onAdd: (String) -> Void = { _ in }
    @Environment(AppLanguage.self) private var language
    @State private var removing: RuleRow?

    var body: some View {
        Page(refresh: { await model.load() }) {
            PageHeader(title: language.t("recurring:list.title"), back: back)
            if let message = model.message { Note(text: message, tone: Theme.Colors.textPrimary, size: 14) }
            Panel {
                switch model.state {
                case .loading:
                    SkeletonRows(count: 5)
                case .failed(let message):
                    LoadErrorBlock(message: message) { await model.load() }
                case .loaded(let figures):
                    VStack(alignment: .leading, spacing: Theme.Space.s4) {
                        LineTabs(options: [("expense", language.t("recurring:list.tabs.subscriptions")),
                                           ("income", language.t("recurring:list.tabs.income"))],
                                 value: model.tab) { model.tab = $0 }
                            .accessibilityIdentifier("recurring.tab")
                        if model.tab == "income" { income(figures.income) } else { subscriptions(figures.groups) }
                    }
                }
            }
        }
        .task(id: language.current) { await model.load() }
        .confirmationDialog(language.t("recurring:list.remove.title"), isPresented: Binding(
            get: { removing != nil }, set: { if !$0 { removing = nil } }), titleVisibility: .visible) {
            Button(language.t("recurring:list.remove.confirm"), role: .destructive) {
                if let row = removing { Task { await model.remove(row) } }
            }
            Button(language.t("common:actions.cancel"), role: .cancel) {}
        } message: {
            if let row = removing { Text(model.removeBody(row)) }
        }
    }

    @ViewBuilder private func subscriptions(_ groups: [RuleGroup]) -> some View {
        if groups.isEmpty {
            empty(title: "recurring:list.emptySubscriptions.title", text: "recurring:list.emptySubscriptions.text",
                  add: "recurring:list.emptySubscriptions.add", kind: "expense")
        } else {
            let shown = groups.first { $0.key == model.group } ?? groups[0]
            if groups.count > 1 {
                PillTabs(options: groups.map { ($0.key, $0.label) }, value: shown.key) { model.group = $0 }
                    .accessibilityLabel(language.t("recurring:list.byFrequency"))
            }
            TotalBlock(total: shown.total, positive: false)
            rows(shown.rows)
        }
    }

    @ViewBuilder private func income(_ income: RecurringFigures.Income) -> some View {
        if income.rows.isEmpty {
            empty(title: "recurring:list.emptyIncome.title", text: "recurring:list.incomeIntro",
                  add: "recurring:list.emptyIncome.add", kind: "income")
        } else {
            Text(language.t("recurring:list.incomeIntro")).kitText(14, color: Theme.Colors.textMuted)
            TotalBlock(total: income.total, label: language.t("recurring:list.recurringIncome"), positive: true)
            rows(income.rows)
        }
    }

    private func rows(_ rows: [RuleRow]) -> some View {
        VStack(spacing: 0) {
            ForEach(rows) { row in
                RuleRowView(row: row, actions: [
                    RowAction(label: language.t(row.active ? "recurring:row.pause" : "recurring:row.resume"),
                              icon: row.active ? .pause : .play) {
                        Task { await model.setActive(row, !row.active) }
                    },
                    RowAction(label: language.t("common:actions.edit"), icon: .pencil) { open(row) },
                    RowAction(label: language.t("common:actions.delete"), icon: .trash2, danger: true) { removing = row },
                ])
                .contentShape(Rectangle())
                .onTapGesture { open(row) }
                .accessibilityAddTraits(.isButton)
            }
        }
    }

    private func open(_ row: RuleRow) {
        if let rule = model.rule(id: row.id) { onOpen(rule) }
    }

    private func empty(title: String, text: String, add: String, kind: String) -> some View {
        EmptyStateBlock(title: language.t(title), text: language.t(text)) {
            Button { onAdd(kind) } label: { IconLabel(text: language.t(add), icon: .plus, size: 18) }
                .buttonStyle(.kit(.solid, .md))
        }
    }
}

/// A total's headline (GroupTotal): the figure, about how much a month, the rates notes.
private struct TotalBlock: View {
    let total: RuleTotal
    var label: String? = nil
    let positive: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: Theme.Space.s1) {
            HStack(alignment: .bottom, spacing: Theme.Space.s3) {
                Figure(label: label ?? total.label ?? "", value: total.value, tone: positive ? .positive : .default, size: .lg)
                Spacer(minLength: 0)
                if let perMonth = total.perMonth { Text(perMonth).kitText(14, color: Theme.Colors.textMuted) }
            }
            if let converted = total.converted { Note(text: converted) }
            if let missing = total.missing { Note(text: missing) }
        }
        .accessibilityElement(children: .combine)
    }
}

/// One rule (RuleRow): badge, name, the muted line with the reminder and
/// paused tags, the amount with its hint, dimmed while paused, then ⋮.
private struct RuleRowView: View {
    let row: RuleRow
    let actions: [RowAction]

    var body: some View {
        ItemRow(title: row.title, amount: row.amount, amountTone: row.tone == "positive" ? .positive : .default,
                amountMeta: row.hint, dimmed: !row.active) {
            CategoryBadge(look: row.look)
        } meta: {
            VStack(alignment: .leading, spacing: 3) {
                MetaText(text: row.meta.joined(separator: " · "))
                if row.remind != nil || row.paused != nil {
                    HStack(spacing: Theme.Space.s1) {
                        if let remind = row.remind { KitTag(text: remind, tone: .accent, pill: true, icon: .bell) }
                        if let paused = row.paused { KitTag(text: paused, tone: .muted, pill: true) }
                    }
                }
            }
        } trailing: {
            RowActionsMenu(actions: actions)
        }
    }
}
