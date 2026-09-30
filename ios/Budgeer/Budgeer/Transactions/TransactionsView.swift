// The Transactions tab, after the web's LedgerPage: Expenses | Income | All,
// the search (all history) and the period picker, then the list in a card
// headed by what it holds ("Expenses · September 2026 · 13 entries"), a
// page at a time with the web's Paginator. A row opens the entry form; a
// group's share is read-only. "+" adds one of the tab's kind.
import SwiftUI

@MainActor
struct TransactionsView: View {
    let model: LedgerModel
    var onAdd: (String) -> Void = { _ in }
    var onOpen: (JSONValue) -> Void = { _ in }
    @Environment(AppLanguage.self) private var language

    private static let types = ["expense", "income", "all"]

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: Theme.Space.s4) {
                    Picker(language.t("transactions:ledger.typeLabel"), selection: Binding(
                        get: { model.type }, set: { type in Task { await model.setType(type) } })) {
                        ForEach(TransactionsView.types, id: \.self) { Text(language.t("transactions:ledger.types.\($0)")).tag($0) }
                    }
                    .pickerStyle(.segmented)
                    .accessibilityIdentifier("ledger.type")
                    controls
                    Panel { list }
                }
                .padding(Theme.Space.s4)
            }
            .refreshable { await model.reloadRows() }
            .scrollDismissesKeyboard(.interactively)
            .background(Theme.Colors.canvas.ignoresSafeArea())
            .navigationTitle(language.t("transactions:ledger.title"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .primaryAction) {
                    AddButton(label: language.t("transactions:ledger.add.\(model.type)")) {
                        onAdd(model.type == "income" ? "income" : "expense")
                    }
                }
            }
        }
        .task(id: language.current) { await model.load() }
    }

    /// The search field and the period picker (a search spans all history).
    private var controls: some View {
        HStack(spacing: Theme.Space.s2) {
            HStack(spacing: Theme.Space.s2) {
                Image(systemName: "magnifyingglass").foregroundStyle(Theme.Colors.textMuted)
                TextField(language.t("transactions:ledger.searchPlaceholder"),
                          text: Binding(get: { model.text }, set: { model.setText($0) }))
                    .submitLabel(.search)
                    .autocorrectionDisabled()
                    .accessibilityLabel(language.t("transactions:ledger.search"))
                if !model.text.isEmpty {
                    Button {
                        model.setText("")
                    } label: {
                        Image(systemName: "xmark.circle.fill").foregroundStyle(Theme.Colors.textMuted)
                    }
                    .accessibilityLabel(language.t("transactions:ledger.clearSearch"))
                }
            }
            .fieldStyle()
            if !model.searching, !model.periods.isEmpty {
                PeriodMenu(periods: model.periods, value: model.periodValue) { value in
                    Task { await model.setPeriod(value) }
                }
            }
        }
    }

    @ViewBuilder private var list: some View {
        switch model.state {
        case .loading:
            ProgressView().frame(maxWidth: .infinity, minHeight: 120)
        case .failed(let message):
            LoadErrorBlock(message: message) { await model.load() }
        case .loaded(let figures):
            VStack(alignment: .leading, spacing: Theme.Space.s3) {
                HStack(spacing: Theme.Space.s3) {
                    IconTile(systemName: model.type == "income" ? "wallet.pass" : "doc.plaintext",
                             tone: model.type == "income" ? Theme.Colors.positive : Theme.Colors.accentFg)
                    VStack(alignment: .leading, spacing: 2) {
                        Text(figures.title)
                            .font(Theme.Fonts.heading(16, weight: .semibold, lang: language.current))
                            .foregroundStyle(Theme.Colors.textPrimary)
                        Text(figures.subtitle)
                            .font(Theme.Fonts.body(13, lang: language.current))
                            .foregroundStyle(Theme.Colors.textMuted)
                            .accessibilityIdentifier("ledger.subtitle")
                    }
                }
                Divider().overlay(Theme.Colors.border)
                if figures.firstRun {
                    FirstEntryBlock { onAdd("expense") }
                } else if figures.rows.isEmpty {
                    Text(language.t(model.searching ? "transactions:ledger.noMatch" : "transactions:ledger.empty.\(model.type)"))
                        .font(Theme.Fonts.body(14, lang: language.current))
                        .foregroundStyle(Theme.Colors.textMuted)
                } else {
                    LazyVStack(spacing: 0) {
                        ForEach(figures.rows) { row in
                            Button {
                                if let saved = model.row(id: row.id) { onOpen(saved) }
                            } label: {
                                EntryRowView(row: row)
                            }
                            .buttonStyle(.plain)
                            .disabled(row.shared)
                            if row.id != figures.rows.last?.id { Divider().overlay(Theme.Colors.border) }
                        }
                    }
                    if figures.pages > 1 {
                        Paginator(page: model.page, pages: figures.pages, position: figures.position) { model.showPage($0) }
                    }
                }
            }
        }
    }
}

/// A period picker (buildPeriods' options) as a menu showing the picked label.
struct PeriodMenu: View {
    let periods: [HomePeriod]
    let value: String
    let pick: (String) -> Void
    @Environment(AppLanguage.self) private var language

    var body: some View {
        Menu {
            ForEach(periods, id: \.value) { period in
                Button {
                    pick(period.value)
                } label: {
                    if period.value == value { Label(period.label, systemImage: "checkmark") } else { Text(period.label) }
                }
            }
        } label: {
            HStack(spacing: Theme.Space.s1) {
                Text(periods.first { $0.value == value }?.label ?? "")
                    .lineLimit(1)
                Image(systemName: "chevron.down").font(.system(size: 11, weight: .semibold))
            }
            .font(Theme.Fonts.body(14, weight: .semibold, lang: language.current))
            .foregroundStyle(Theme.Colors.textPrimary)
            .padding(.horizontal, Theme.Space.s3)
            .frame(minHeight: 44)
            .background(Theme.Colors.surface)
            .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.lg, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: Theme.Radius.lg, style: .continuous).stroke(Theme.Colors.border, lineWidth: 1))
        }
        .accessibilityLabel(language.t("dashboard:period"))
        .accessibilityIdentifier("period")
    }
}

/// The web's Paginator: previous, "Page 2 of 5", next.
struct Paginator: View {
    let page: Int
    let pages: Int
    let position: String
    let go: (Int) -> Void
    @Environment(AppLanguage.self) private var language

    var body: some View {
        HStack(spacing: Theme.Space.s2) {
            Spacer()
            Button { go(page - 1) } label: { Image(systemName: "chevron.left") }
                .disabled(page <= 1)
                .accessibilityLabel(language.t("common:paginator.previous"))
            Text(position)
                .font(Theme.Fonts.body(12, lang: language.current))
                .foregroundStyle(Theme.Colors.textMuted)
            Button { go(page + 1) } label: { Image(systemName: "chevron.right") }
                .disabled(page >= pages)
                .accessibilityLabel(language.t("common:paginator.next"))
        }
        .tint(Theme.Colors.textPrimary)
        .padding(.top, Theme.Space.s2)
    }
}

/// Nothing logged yet (the web's FirstEntry): what to do first.
struct FirstEntryBlock: View {
    let add: () -> Void
    @Environment(AppLanguage.self) private var language

    var body: some View {
        VStack(spacing: Theme.Space.s3) {
            Text(language.t("transactions:firstEntry.title"))
                .font(Theme.Fonts.heading(17, weight: .semibold, lang: language.current))
                .foregroundStyle(Theme.Colors.textPrimary)
            Text(language.t("transactions:firstEntry.text"))
                .font(Theme.Fonts.body(14, lang: language.current))
                .foregroundStyle(Theme.Colors.textMuted)
                .multilineTextAlignment(.center)
            Button(action: add) {
                Label(language.t("transactions:firstEntry.add"), systemImage: "plus")
            }
            .buttonStyle(PrimaryButtonStyle())
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, Theme.Space.s4)
    }
}
