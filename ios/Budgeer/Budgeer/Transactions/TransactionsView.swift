// The Transactions tab, after the web's LedgerPage on a phone: the title
// with Add (of the type shown), Expenses | Income | All across the page,
// then one card: the search with the Filters button (category, amounts,
// dates in a panel that opens in place), the list's header (the receipt, or
// income's green wallet; "Expenses · This month · 13 entries", a search's
// net, Clear) and the rows, a page at a time. A row opens Edit; its menu
// edits or deletes; a group's share is read-only.
import SwiftUI

@MainActor
struct TransactionsView: View {
    let model: LedgerModel
    var onAdd: (String) -> Void = { _ in }
    var onOpen: (JSONValue) -> Void = { _ in }
    @Environment(AppLanguage.self) private var language
    @State private var filtersOpen = false

    private static let types = ["expense", "income", "all"]

    var body: some View {
        Page(refresh: { await model.reloadRows() }) {
            PageHeader(title: language.t("transactions:ledger.title")) {
                PageAction(icon: .plus, label: language.t("transactions:ledger.add.\(model.type)")) {
                    onAdd(model.type == "income" ? "income" : "expense")
                }
                .accessibilityIdentifier("add")
            }
            SegmentedControl(options: TransactionsView.types.map { ($0, language.t("transactions:ledger.types.\($0)")) },
                             value: model.type, size: .sm, fitted: true) { type in Task { await model.setType(type) } }
                .accessibilityLabel(language.t("transactions:ledger.typeLabel"))
                .accessibilityIdentifier("ledger.type")
            Panel {
                VStack(alignment: .leading, spacing: 0) {
                    search
                    if filtersOpen { FiltersPanel(model: model).padding(.top, Theme.Space.s4) }
                }
                .padding(.bottom, Theme.Space.s5)
                list
            }
        }
        .task(id: language.current) { await model.load() }
    }

    /// The search field and the Filters button (its dot while a filter is set).
    private var search: some View {
        HStack(spacing: Theme.Space.s2) {
            HStack(spacing: Theme.Space.s3) {
                LucideIcon(icon: .search, size: 16).foregroundStyle(Theme.Colors.textMuted)
                TextField(language.t("transactions:ledger.searchPlaceholder"),
                          text: Binding(get: { model.text }, set: { model.setText($0) }))
                    .submitLabel(.search)
                    .autocorrectionDisabled()
                    .accessibilityLabel(language.t("transactions:ledger.search"))
                if !model.text.isEmpty {
                    Button { model.setText("") } label: {
                        LucideIcon(icon: .x, size: 14).foregroundStyle(Theme.Colors.textMuted).frame(width: 24, height: 24)
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel(language.t("transactions:ledger.clearSearch"))
                }
            }
            .padding(.leading, -4)
            .fieldStyle()
            Button { filtersOpen.toggle() } label: {
                LucideIcon(icon: .slidersHorizontal, size: 16)
                    .foregroundStyle(filtersOpen ? Theme.Colors.onAccent : Theme.Colors.textPrimary)
                    .frame(width: 40, height: 40)
                    .background(filtersOpen ? Theme.Colors.accentSolid : Color.clear)
                    .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.lg, style: .continuous))
                    .overlay {
                        if !filtersOpen {
                            RoundedRectangle(cornerRadius: Theme.Radius.lg, style: .continuous).stroke(Theme.Colors.border, lineWidth: 1)
                        }
                    }
                    .overlay(alignment: .topTrailing) {
                        if model.hasFilters && !filtersOpen {
                            Circle().fill(Theme.Palette.brand500).frame(width: 10, height: 10)
                                .overlay(Circle().stroke(Theme.Colors.surface, lineWidth: 2))
                                .offset(x: 2, y: -2)
                        }
                    }
            }
            .buttonStyle(.plain)
            .accessibilityLabel(language.t(model.hasFilters ? "transactions:ledger.filtersActive" : "transactions:ledger.filters"))
            .accessibilityIdentifier("ledger.filters")
        }
    }

    @ViewBuilder private var list: some View {
        switch model.state {
        case .loading:
            CardHeader(title: language.t("transactions:heading.\(model.type)"),
                       icon: model.type == "income" ? .wallet : .receiptText, divider: true)
            SkeletonRows(count: 8)
        case .failed(let message):
            LoadErrorBlock(message: message) { await model.load() }
        case .loaded(let figures):
            CardHeader(title: figures.title, icon: model.type == "income" ? .wallet : .receiptText,
                       iconTone: model.type == "income" ? .positive : .accent, subtitle: figures.subtitle, divider: true) {
                if model.searching {
                    Button { Task { await model.clearAll() } } label: {
                        IconLabel(text: language.t("transactions:actions.clear"), icon: .x, size: 14)
                    }
                    .buttonStyle(.kit(.ghost, .xs))
                }
            }
            .accessibilityIdentifier("ledger.subtitle")
            if figures.firstRun {
                FirstEntryBlock { onAdd("expense") }
            } else if figures.rows.isEmpty {
                Text(language.t(model.searching ? "transactions:ledger.noMatch" : "transactions:ledger.empty.\(model.type)"))
                    .kitText(14, color: Theme.Colors.textMuted)
            } else {
                TransactionListView(rows: figures.rows, saved: { model.row(id: $0) }, open: onOpen) { row in
                    await model.delete(row)
                }
                if figures.pages > 1 {
                    Paginator(page: model.page, pages: figures.pages, position: figures.position) { model.showPage($0) }
                }
            }
        }
    }
}

/// The Filters panel (opened in place): Category (any, the type's, or none),
/// Min and Max in the base currency, From and To each behind a switch.
private struct FiltersPanel: View {
    let model: LedgerModel
    @Environment(AppLanguage.self) private var language
    @State private var fromOn = false
    @State private var toOn = false

    var body: some View {
        VStack(alignment: .leading, spacing: Theme.Space.s3) {
            label(language.t("transactions:ledger.category"))
            SelectMenu(options: [("", language.t("transactions:ledger.anyCategory"))]
                       + model.categoryOptions.map { ($0.id, $0.name) }
                       + [("none", language.t("transactions:uncategorized"))],
                       value: model.filter("categoryId"), label: language.t("transactions:ledger.category")) { value in
                Task { await model.setFilter("categoryId", value) }
            }
            HStack(alignment: .top, spacing: Theme.Space.s3) {
                amount("min", placeholder: "0")
                amount("max", placeholder: "∞")
            }
            HStack(alignment: .top, spacing: Theme.Space.s3) {
                date("from", on: $fromOn)
                date("to", on: $toOn)
            }
        }
        .onAppear {
            fromOn = !model.filter("from").isEmpty
            toOn = !model.filter("to").isEmpty
        }
    }

    private func label(_ text: String) -> some View {
        Text(text).kitText(12, .semibold, color: Theme.Colors.textMuted)
    }

    private func amount(_ key: String, placeholder: String) -> some View {
        let currency = model.baseCurrency
        return VStack(alignment: .leading, spacing: Theme.Space.s2) {
            label(language.t("transactions:ledger.\(key)", ["currency": .string(currency)]))
            TextField(placeholder, text: Binding(get: { model.filter(key) }, set: { value in
                Task { await model.setFilter(key, value) }
            }))
            .keyboardType(.decimalPad)
            .fieldStyle()
        }
        .frame(maxWidth: .infinity)
    }

    private func date(_ key: String, on: Binding<Bool>) -> some View {
        VStack(alignment: .leading, spacing: Theme.Space.s2) {
            HStack(spacing: Theme.Space.s2) {
                KitSwitch(isOn: Binding(get: { on.wrappedValue }, set: { next in
                    on.wrappedValue = next
                    if !next { Task { await model.setFilter(key, "") } }
                }), label: language.t("transactions:ledger.\(key)"))
                .padding(.vertical, -12)
                label(language.t("transactions:ledger.\(key)"))
            }
            if on.wrappedValue {
                DayField(label: language.t("transactions:ledger.\(key)"), iso: Binding(
                    get: { model.filter(key) }, set: { value in Task { await model.setFilter(key, value) } }))
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

/// Nothing logged yet (the web's FirstEntry): what to do first.
struct FirstEntryBlock: View {
    let add: () -> Void
    @Environment(AppLanguage.self) private var language

    var body: some View {
        EmptyStateBlock(icon: .receiptText, title: language.t("transactions:firstEntry.title"),
                        text: language.t("transactions:firstEntry.text")) {
            Button(action: add) {
                IconLabel(text: language.t("transactions:firstEntry.add"), icon: .plus)
            }
            .buttonStyle(.kit(.solid, .md))
        }
    }
}
