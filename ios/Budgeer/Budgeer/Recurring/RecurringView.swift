// Recurring (from More and Home's "Coming up"): Subscriptions | Income;
// the subscriptions by how often they charge, each group under its total;
// the recurring income under its own. Tap a rule to edit it in the Add
// sheet; swipe right to pause or resume it, left to remove it (it asks
// first); the floating Add adds one of the kind shown (AppFrame lends it).
// Every figure and word is RecurringModel's.
import SwiftUI

@MainActor
struct RecurringView: View {
    @Bindable var model: RecurringModel
    /// A rule's saved row, to edit.
    let open: (JSONValue) -> Void
    /// Add a recurring expense or income.
    let add: (String) -> Void
    @Environment(AppLanguage.self) private var language
    @State private var removing: RuleRow?

    var body: some View {
        List {
            Section {
                Picker("", selection: $model.tab) {
                    Text(language.t("recurring:list.tabs.subscriptions")).tag("expense")
                    Text(language.t("recurring:list.tabs.income")).tag("income")
                }
                .pickerStyle(.segmented)
                .listRowBackground(Color.clear)
                .listRowInsets(EdgeInsets())
            }
            if let message = model.message {
                Section { NativeNotice(text: message) }
            }
            switch model.state {
            case .loading:
                Section { NativeLoading() }.listRowBackground(Color.clear)
            case .failed(let message):
                Section { NativeFailed(message: message) { await model.load() } }.listRowBackground(Color.clear)
            case .loaded(let figures):
                if model.tab == "income" {
                    income(figures.income)
                } else if figures.groups.isEmpty {
                    empty(title: "recurring:list.emptySubscriptions.title", text: "recurring:list.emptySubscriptions.text",
                          action: "recurring:list.emptySubscriptions.add", kind: "expense")
                } else {
                    ForEach(figures.groups) { group in
                        Section {
                            ForEach(group.rows) { row in ruleRow(row) }
                        } header: {
                            TotalHeader(label: group.label, total: group.total)
                        } footer: {
                            notes(group.total)
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
        .navigationTitle(language.t("recurring:list.title"))
        .refreshable { await model.load() }
        .task(id: language.current) { await model.load() }
        .confirmationDialog(language.t("recurring:list.remove.title"),
                            isPresented: Binding(get: { removing != nil }, set: { if !$0 { removing = nil } }),
                            titleVisibility: .visible, presenting: removing) { row in
            Button(language.t("recurring:list.remove.confirm"), role: .destructive) { Task { await model.remove(row) } }
            Button(language.t("common:actions.cancel"), role: .cancel) {}
        } message: { row in
            Text(model.removeBody(row))
        }
    }

    @ViewBuilder private func income(_ income: RecurringFigures.Income) -> some View {
        if income.rows.isEmpty {
            empty(title: "recurring:list.emptyIncome.title", text: "recurring:list.incomeIntro",
                  action: "recurring:list.emptyIncome.add", kind: "income")
        } else {
            Section {
                ForEach(income.rows) { row in ruleRow(row) }
            } header: {
                TotalHeader(label: language.t("recurring:list.recurringIncome"), total: income.total)
            } footer: {
                VStack(alignment: .leading, spacing: 4) {
                    Text(language.t("recurring:list.incomeIntro"))
                    notes(income.total)
                }
            }
            .listRowBackground(NativeStyle.card)
        }
    }

    private func ruleRow(_ row: RuleRow) -> some View {
        Button {
            if let rule = model.rule(id: row.id) { open(rule) }
        } label: {
            RuleRowView(row: row)
        }
        .foregroundStyle(Color.primary)
        .swipeActions(edge: .leading, allowsFullSwipe: true) {
            Button { Task { await model.setActive(row, !row.active) } } label: {
                Label(language.t(row.active ? "recurring:row.pause" : "recurring:row.resume"),
                      systemImage: row.active ? "pause.fill" : "play.fill")
            }
            .tint(NativeStyle.amber)
        }
        .swipeActions(edge: .trailing, allowsFullSwipe: false) {
            Button(role: .destructive) { removing = row } label: {
                Label(language.t("common:actions.delete"), systemImage: "trash")
            }
        }
    }

    @ViewBuilder private func notes(_ total: RuleTotal) -> some View {
        let lines = [total.converted, total.missing].compactMap { $0 }
        if !lines.isEmpty { Text(lines.joined(separator: "\n")) }
    }

    private func empty(title: String, text: String, action: String, kind: String) -> some View {
        Section {
            ContentUnavailableView {
                Label(language.t(title), systemImage: "arrow.triangle.2.circlepath")
            } description: {
                Text(language.t(text))
            } actions: {
                Button(language.t(action)) { add(kind) }.nativeGlassButton(prominent: true)
            }
        }
        .listRowBackground(Color.clear)
    }
}

/// A group's headline over its rules: the label, the total, about how much a month.
struct TotalHeader: View {
    let label: String
    let total: RuleTotal

    var body: some View {
        HStack(alignment: .firstTextBaseline) {
            Text(label).font(.title3.weight(.semibold)).foregroundStyle(Color.primary)
            Spacer(minLength: 8)
            VStack(alignment: .trailing, spacing: 0) {
                Text(total.value).font(.headline).foregroundStyle(Color.primary).monospacedDigit()
                if let perMonth = total.perMonth { Text(perMonth).font(.caption).foregroundStyle(.secondary) }
            }
        }
        .textCase(nil)
        .padding(.horizontal, -4)
    }
}

/// One rule: badge, name, how often and the next charge, the reminder and
/// paused tags, the amount with its hint; dimmed while paused.
struct RuleRowView: View {
    let row: RuleRow

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            CategoryBadge(look: row.look, size: 36)
            VStack(alignment: .leading, spacing: 3) {
                Text(row.title).font(.body.weight(.medium)).lineLimit(1)
                Text(row.meta.joined(separator: " · ")).font(.footnote).foregroundStyle(.secondary).lineLimit(2)
                HStack(spacing: 6) {
                    if let remind = row.remind {
                        Label(remind, systemImage: "bell.fill")
                            .font(.caption2.weight(.semibold))
                            .foregroundStyle(NativeStyle.tint)
                    }
                    if let paused = row.paused {
                        Text(paused.capsLabel)
                            .font(.caption2.weight(.bold))
                            .foregroundStyle(.secondary)
                            .padding(.horizontal, 6)
                            .padding(.vertical, 2)
                            .background(Theme.Colors.subtle, in: Capsule())
                    }
                }
            }
            Spacer(minLength: 8)
            VStack(alignment: .trailing, spacing: 2) {
                Text(row.amount)
                    .font(.body.weight(.semibold))
                    .foregroundStyle(row.tone == "positive" ? NativeStyle.positive : Color.primary)
                    .monospacedDigit()
                if let hint = row.hint { Text(hint).font(.caption).foregroundStyle(.secondary) }
            }
        }
        .opacity(row.active ? 1 : 0.55)
        .accessibilityElement(children: .combine)
    }
}
