// The Recurring page (from More), after the web's: Subscriptions | Income.
// Subscriptions: one chip per frequency the user has (Weekly · Monthly ·
// Quarterly · Yearly), each with its total per period (about how much a
// month, the rates notes) and its rules; Income: what the income rules
// bring in a month and the rules. Each rule has its pause switch; a tap
// opens it in the entry form (Repeat always on); its menu removes it. No
// "add" here, as on the web: a recurring entry is added from Add with
// Repeat on (the empty tabs lead there).
import SwiftUI

@MainActor
struct RecurringView: View {
    @Bindable var model: RecurringModel
    var onOpen: (JSONValue) -> Void = { _ in }
    var onAdd: (String) -> Void = { _ in }
    @Environment(AppLanguage.self) private var language
    @State private var removing: RuleRow?

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: Theme.Space.s4) {
                if let message = model.message { Note(text: message, tone: Theme.Colors.textPrimary) }
                Panel {
                    switch model.state {
                    case .loading:
                        ProgressView().frame(maxWidth: .infinity, minHeight: 120)
                    case .failed(let message):
                        LoadErrorBlock(message: message) { await model.load() }
                    case .loaded(let figures):
                        VStack(alignment: .leading, spacing: Theme.Space.s4) {
                            Picker("", selection: $model.tab) {
                                Text(language.t("recurring:list.tabs.subscriptions")).tag("expense")
                                Text(language.t("recurring:list.tabs.income")).tag("income")
                            }
                            .pickerStyle(.segmented)
                            .accessibilityIdentifier("recurring.tab")
                            if model.tab == "income" { income(figures.income) } else { subscriptions(figures.groups) }
                        }
                    }
                }
            }
            .padding(Theme.Space.s4)
        }
        .refreshable { await model.load() }
        .background(Theme.Colors.canvas.ignoresSafeArea())
        .navigationTitle(language.t("recurring:list.title"))
        .navigationBarTitleDisplayMode(.inline)
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
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: Theme.Space.s1) {
                        ForEach(groups) { group in
                            Button(group.label) { model.group = group.key }
                                .font(Theme.Fonts.body(14, weight: .semibold, lang: language.current))
                                .foregroundStyle(group.key == shown.key ? Theme.Colors.accentFg : Theme.Colors.textMuted)
                                .padding(.horizontal, Theme.Space.s3)
                                .padding(.vertical, 6)
                                .background(group.key == shown.key ? Theme.Colors.accentSubtle : Color.clear)
                                .clipShape(Capsule())
                        }
                    }
                }
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
            Note(text: language.t("recurring:list.incomeIntro"))
            TotalBlock(total: income.total, label: language.t("recurring:list.recurringIncome"), positive: true)
            rows(income.rows)
        }
    }

    private func rows(_ rows: [RuleRow]) -> some View {
        VStack(spacing: 0) {
            ForEach(rows) { row in
                RuleRowView(row: row, onToggle: { on in Task { await model.setActive(row, on) } },
                            onRemove: { removing = row })
                    .contentShape(Rectangle())
                    .onTapGesture { if let rule = model.rule(id: row.id) { onOpen(rule) } }
                if row.id != rows.last?.id { Divider().overlay(Theme.Colors.border) }
            }
        }
    }

    private func empty(title: String, text: String, add: String, kind: String) -> some View {
        VStack(spacing: Theme.Space.s3) {
            Text(language.t(title))
                .font(Theme.Fonts.heading(17, weight: .semibold, lang: language.current))
                .foregroundStyle(Theme.Colors.textPrimary)
            Text(language.t(text))
                .font(Theme.Fonts.body(14, lang: language.current))
                .foregroundStyle(Theme.Colors.textMuted)
                .multilineTextAlignment(.center)
            Button { onAdd(kind) } label: { Label(language.t(add), systemImage: "plus") }
                .buttonStyle(PrimaryButtonStyle())
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, Theme.Space.s4)
    }
}

/// A total's headline (GroupTotal): the figure, about how much a month, the rates notes.
private struct TotalBlock: View {
    let total: RuleTotal
    var label: String? = nil
    let positive: Bool
    @Environment(AppLanguage.self) private var language

    var body: some View {
        VStack(alignment: .leading, spacing: Theme.Space.s1) {
            HStack(alignment: .lastTextBaseline) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(label ?? total.label ?? "")
                        .font(Theme.Fonts.body(13, weight: .semibold, lang: language.current))
                        .foregroundStyle(Theme.Colors.textMuted)
                    Text(total.value)
                        .font(Theme.Fonts.heading(22, weight: .bold, lang: language.current))
                        .foregroundStyle(positive ? Theme.Colors.positive : Theme.Colors.textPrimary)
                        .lineLimit(1)
                        .minimumScaleFactor(0.7)
                }
                Spacer(minLength: Theme.Space.s2)
                if let perMonth = total.perMonth { Note(text: perMonth) }
            }
            if let converted = total.converted { Note(text: converted) }
            if let missing = total.missing { Note(text: missing, tone: Theme.Colors.warning) }
        }
        .accessibilityElement(children: .combine)
    }
}

/// One rule (RuleRow): badge, name, the muted line with the reminder and
/// paused tags, the amount with its hint, the pause switch and a menu.
private struct RuleRowView: View {
    let row: RuleRow
    let onToggle: (Bool) -> Void
    let onRemove: () -> Void
    @Environment(AppLanguage.self) private var language

    var body: some View {
        HStack(alignment: .center, spacing: Theme.Space.s3) {
            HStack(alignment: .top, spacing: Theme.Space.s3) {
                CategoryBadge(look: row.look)
                VStack(alignment: .leading, spacing: 3) {
                    Text(row.title)
                        .font(Theme.Fonts.body(15, weight: .semibold, lang: language.current))
                        .foregroundStyle(Theme.Colors.textPrimary)
                    Text(row.meta.joined(separator: " · "))
                        .font(Theme.Fonts.body(13, lang: language.current))
                        .foregroundStyle(Theme.Colors.textMuted)
                        .fixedSize(horizontal: false, vertical: true)
                    HStack(spacing: Theme.Space.s1) {
                        if let remind = row.remind { tag(Label(remind, systemImage: "bell"), accent: true) }
                        if let paused = row.paused { tag(Text(paused), accent: false) }
                    }
                }
                Spacer(minLength: Theme.Space.s2)
                VStack(alignment: .trailing, spacing: 2) {
                    Text(row.amount)
                        .font(Theme.Fonts.body(15, weight: .bold, lang: language.current))
                        .foregroundStyle(row.tone == "positive" ? Theme.Colors.positive : Theme.Colors.textPrimary)
                    if let hint = row.hint { Note(text: hint) }
                }
            }
            .opacity(row.active ? 1 : 0.55)
            Toggle(language.t(row.active ? "recurring:row.pause" : "recurring:row.resume"),
                   isOn: Binding(get: { row.active }, set: onToggle))
                .labelsHidden()
                .tint(Theme.Colors.accentSolid)
            Menu {
                Button(role: .destructive, action: onRemove) {
                    Label(language.t("common:actions.delete"), systemImage: "trash")
                }
            } label: {
                Image(systemName: "ellipsis").foregroundStyle(Theme.Colors.textMuted).frame(width: 24, height: 44)
            }
            .accessibilityLabel(language.t("common:actions.moreActions"))
        }
        .padding(.vertical, Theme.Space.s2)
    }

    private func tag<Content: View>(_ content: Content, accent: Bool) -> some View {
        content
            .font(Theme.Fonts.body(11, weight: .semibold, lang: language.current))
            .foregroundStyle(accent ? Theme.Colors.accentFg : Theme.Colors.textMuted)
            .padding(.horizontal, 6)
            .padding(.vertical, 2)
            .background(accent ? Theme.Colors.accentSubtle : Theme.Colors.subtle)
            .clipShape(Capsule())
    }
}
