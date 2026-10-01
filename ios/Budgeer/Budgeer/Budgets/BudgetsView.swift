// The Budgets tab, after the web's Budgets page: the month over the title,
// "Set a monthly cap" (a category, its cap and Set on one line), and "This
// month": where its caps were carried over from, "Copy last month's
// budgets" when offered, the hint (its ⓘ explains the rollover), and each
// budget as a progress row ("€312.40 of €400.00", the percent, the bar in
// its tone, "Over budget") with its ⋮ menu (Edit loads it into the form,
// Delete). With no caps yet the empty state leads.
import SwiftUI

@MainActor
struct BudgetsView: View {
    @Bindable var model: BudgetsModel
    @Environment(AppLanguage.self) private var language
    @State private var confirmCopy = false
    @State private var rolloverInfo = false
    @FocusState private var amountFocused: Bool

    var body: some View {
        Page(fab: true, refresh: { await model.load() }) {
            switch model.state {
            case .loading:
                PageHeader(title: language.t("budgets:title"))
                Panel { SkeletonRows(count: 4, progress: true) }
            case .failed(let message):
                PageHeader(title: language.t("budgets:title"))
                Panel { LoadErrorBlock(message: message) { await model.load() } }
            case .loaded(let figures):
                PageHeader(title: language.t("budgets:title"), eyebrow: figures.heading)
                if let message = model.message {
                    Note(text: message, tone: Theme.Colors.textPrimary, size: 14)
                        .accessibilityIdentifier("budgets.message")
                }
                if figures.items.isEmpty {
                    emptyState(figures)
                    form
                } else {
                    form
                    thisMonth(figures)
                }
            }
        }
        .task(id: language.current) { await model.load() }
        .confirmationDialog(language.t("budgets:copy.title"), isPresented: $confirmCopy, titleVisibility: .visible) {
            Button(language.t("budgets:copy.confirm")) { Task { await model.copyPrevious() } }
            Button(language.t("common:actions.cancel"), role: .cancel) {}
        } message: {
            Text(model.copyBody)
        }
    }

    private func emptyState(_ figures: BudgetFigures) -> some View {
        Panel {
            EmptyStateBlock(icon: .target, title: language.t("budgets:empty.title"), text: language.t("budgets:empty.text")) {
                VStack(spacing: Theme.Space.s2) {
                    Button { amountFocused = true } label: {
                        IconLabel(text: language.t("budgets:empty.first"), icon: .target, size: 18)
                    }
                    .buttonStyle(.kit(.solid, .md))
                    if figures.canCopy {
                        Button { Task { await model.copyPrevious() } } label: {
                            IconLabel(text: language.t("budgets:copy.button"), icon: .copy, size: 18)
                        }
                        .buttonStyle(.kit(.outline, .md, scheme: .gray))
                    }
                }
            }
        }
    }

    /// "Set a monthly cap": Category, Monthly cap and Set on one line.
    private var form: some View {
        Panel(title: language.t("budgets:form.title"), icon: .target) {
            HStack(alignment: .bottom, spacing: Theme.Space.s3) {
                FormRow(label: language.t("budgets:form.category")) {
                    SelectMenu(options: model.categoryOptions.map { ($0.id, $0.name) }, value: model.formCategory,
                               placeholder: language.t("budgets:form.select"), label: language.t("budgets:form.category")) {
                        model.formCategory = $0
                    }
                    .accessibilityIdentifier("budgets.category")
                }
                FormRow(label: language.t("budgets:form.cap")) {
                    TextField(model.amountPlaceholder, text: Binding(get: { model.formAmount }, set: { model.setAmount($0) }))
                        .keyboardType(.decimalPad)
                        .focused($amountFocused)
                        .fieldStyle()
                        .accessibilityIdentifier("budgets.cap")
                }
                .frame(maxWidth: 120)
                Button(language.t("budgets:form.submit")) { Task { await model.setCap() } }
                    .buttonStyle(.kit(.solid, .md))
                    .disabled(!model.canSet)
                    .accessibilityIdentifier("budgets.set")
            }
        }
    }

    private func thisMonth(_ figures: BudgetFigures) -> some View {
        Panel(title: language.t("budgets:thisMonth"), icon: .calendarDays, subtitle: figures.subtitle) {
            VStack(alignment: .leading, spacing: Theme.Space.s5) {
                if figures.canCopy {
                    Button { confirmCopy = true } label: {
                        IconLabel(text: language.t("budgets:copy.action"), icon: .copy, size: 14)
                    }
                    .buttonStyle(.kit(.ghost, .xs))
                }
                VStack(alignment: .leading, spacing: 0) {
                    HStack(spacing: 4) {
                        Text(language.t("budgets:hint")).kitText(14, color: Theme.Colors.textMuted)
                        if figures.subtitle != nil {
                            InfoButton(open: $rolloverInfo, label: language.t("common:moreInfo"))
                        }
                    }
                    if rolloverInfo { InfoBox(lines: [language.t("budgets:rollover")]) }
                }
                ForEach(figures.items) { item in
                    ProgressRow(title: item.name, meta: item.meta, ratio: Double(item.percent) / 100,
                                valueLabel: item.valueLabel, fill: Tone(name: item.tone).fill,
                                over: item.over, overLabel: item.overLabel) {
                        CategoryBadge(look: item.look)
                    } trailing: {
                        RowActionsMenu(actions: [
                            RowAction(label: language.t("budgets:edit", ["name": .string(item.name)]), icon: .pencil) {
                                model.edit(item)
                                amountFocused = true
                            },
                            RowAction(label: language.t("budgets:delete", ["name": .string(item.name)]), icon: .trash2,
                                      danger: true) {
                                Task { await model.delete(item) }
                            },
                        ])
                    }
                    .accessibilityIdentifier("budgets.row.\(item.categoryId)")
                }
            }
            .accessibilityIdentifier("budgets.carried")
        }
    }
}
