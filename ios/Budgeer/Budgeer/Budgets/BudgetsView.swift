// The Budgets tab, after the web's Budgets page: the month over the title,
// "Set a monthly cap" (a category and its cap), and "This month": where its
// caps were carried over from, "Copy last month's budgets" when offered, and
// each budget as a progress row ("€312.40 of €400.00", the percent, the bar
// in its tone, "Over budget"). With no caps yet the empty state leads. A
// row's menu changes its cap (in the form) or deletes it.
import SwiftUI

@MainActor
struct BudgetsView: View {
    @Bindable var model: BudgetsModel
    @Environment(AppLanguage.self) private var language
    @State private var confirmCopy = false
    @FocusState private var amountFocused: Bool

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: Theme.Space.s4) {
                    switch model.state {
                    case .loading:
                        Panel { ProgressView().frame(maxWidth: .infinity, minHeight: 120) }
                    case .failed(let message):
                        Panel { LoadErrorBlock(message: message) { await model.load() } }
                    case .loaded(let figures):
                        Text(figures.heading)
                            .font(Theme.Fonts.body(13, weight: .semibold, lang: language.current))
                            .foregroundStyle(Theme.Colors.textMuted)
                        if let message = model.message {
                            Note(text: message, tone: Theme.Colors.textPrimary)
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
                .padding(Theme.Space.s4)
            }
            .refreshable { await model.load() }
            .scrollDismissesKeyboard(.interactively)
            .background(Theme.Colors.canvas.ignoresSafeArea())
            .navigationTitle(language.t("budgets:title"))
            .navigationBarTitleDisplayMode(.inline)
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
            VStack(spacing: Theme.Space.s3) {
                IconTile(systemName: "target", size: 48, tone: Theme.Colors.accentFg)
                Text(language.t("budgets:empty.title"))
                    .font(Theme.Fonts.heading(18, weight: .semibold, lang: language.current))
                    .foregroundStyle(Theme.Colors.textPrimary)
                Text(language.t("budgets:empty.text"))
                    .font(Theme.Fonts.body(14, lang: language.current))
                    .foregroundStyle(Theme.Colors.textMuted)
                    .multilineTextAlignment(.center)
                Button {
                    amountFocused = true
                } label: {
                    Label(language.t("budgets:empty.first"), systemImage: "target")
                }
                .buttonStyle(PrimaryButtonStyle())
                if figures.canCopy {
                    Button {
                        Task { await model.copyPrevious() }
                    } label: {
                        Label(language.t("budgets:copy.button"), systemImage: "doc.on.doc")
                    }
                    .buttonStyle(OutlineButtonStyle())
                }
            }
            .frame(maxWidth: .infinity)
        }
    }

    /// "Set a monthly cap".
    private var form: some View {
        Panel(title: language.t("budgets:form.title"), icon: "target") {
            HStack(alignment: .bottom, spacing: Theme.Space.s3) {
                FormRow(label: language.t("budgets:form.category")) {
                    Menu {
                        Picker(language.t("budgets:form.category"), selection: $model.formCategory) {
                            ForEach(model.categoryOptions, id: \.id) { Text($0.name).tag($0.id) }
                        }
                    } label: {
                        HStack {
                            Text(model.categoryOptions.first { $0.id == model.formCategory }?.name ?? language.t("budgets:form.select"))
                                .lineLimit(1)
                            Spacer(minLength: 0)
                            Image(systemName: "chevron.up.chevron.down").font(.system(size: 11))
                        }
                        .fieldStyle()
                    }
                    .accessibilityIdentifier("budgets.category")
                }
                FormRow(label: language.t("budgets:form.cap")) {
                    TextField("", text: Binding(get: { model.formAmount }, set: { model.setAmount($0) }))
                        .keyboardType(.decimalPad)
                        .focused($amountFocused)
                        .fieldStyle()
                        .accessibilityIdentifier("budgets.cap")
                }
                .frame(width: 110)
                Button(language.t("budgets:form.submit")) { Task { await model.setCap() } }
                    .buttonStyle(PrimaryButtonStyle())
                    .frame(width: 64)
                    .disabled(!model.canSet)
                    .accessibilityIdentifier("budgets.set")
            }
        }
    }

    private func thisMonth(_ figures: BudgetFigures) -> some View {
        Panel {
            VStack(alignment: .leading, spacing: Theme.Space.s4) {
                HStack(alignment: .top, spacing: Theme.Space.s3) {
                    IconTile(systemName: "calendar", tone: Theme.Colors.accentFg)
                    VStack(alignment: .leading, spacing: 2) {
                        Text(language.t("budgets:thisMonth"))
                            .font(Theme.Fonts.heading(16, weight: .semibold, lang: language.current))
                            .foregroundStyle(Theme.Colors.textPrimary)
                        if let subtitle = figures.subtitle {
                            Text(subtitle)
                                .font(Theme.Fonts.body(13, lang: language.current))
                                .foregroundStyle(Theme.Colors.textMuted)
                                .accessibilityIdentifier("budgets.carried")
                        }
                    }
                }
                if figures.canCopy {
                    Button {
                        confirmCopy = true
                    } label: {
                        Label(language.t("budgets:copy.action"), systemImage: "doc.on.doc")
                            .font(Theme.Fonts.body(13, weight: .semibold, lang: language.current))
                    }
                    .tint(Theme.Colors.accentFg)
                }
                Note(text: language.t("budgets:hint") + (figures.subtitle == nil ? "" : " " + language.t("budgets:rollover")))
                ForEach(figures.items) { item in
                    HStack(spacing: Theme.Space.s2) {
                        ProgressRow(title: item.name, meta: item.meta, ratio: Double(item.percent) / 100,
                                    valueLabel: item.valueLabel, fill: fill(item.tone),
                                    valueTone: item.over ? Theme.Colors.negative : Theme.Colors.textMuted,
                                    pill: item.overLabel) {
                            CategoryBadge(look: item.look)
                        }
                        Menu {
                            Button {
                                model.edit(item)
                                amountFocused = true
                            } label: {
                                Label(language.t("common:actions.edit"), systemImage: "pencil")
                            }
                            Button(role: .destructive) {
                                Task { await model.delete(item) }
                            } label: {
                                Label(language.t("common:actions.delete"), systemImage: "trash")
                            }
                        } label: {
                            Image(systemName: "ellipsis")
                                .foregroundStyle(Theme.Colors.textMuted)
                                .frame(width: 32, height: 44)
                        }
                        .accessibilityLabel(language.t("common:actions.moreActions"))
                    }
                }
            }
        }
    }

    /// The bar's colour for a budget tone (kitMath FILL_TONE).
    private func fill(_ tone: String?) -> Color {
        switch tone {
        case "negative": return Theme.Palette.red400
        case "warning": return Theme.Colors.warning
        default: return Theme.Colors.fill
        }
    }
}
