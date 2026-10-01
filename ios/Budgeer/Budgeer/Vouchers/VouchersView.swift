// Meal vouchers (from Home's card, More › Money once set up), after the web's
// Vouchers page: what's on the card with this month's top-ups and spending,
// the next top-up with "Edit days" opening in place (a stepper, the new
// amount, Save or Cancel), and the card's history month by month (tap an
// expense to edit it; Show older). The gear opens Settings › Meal vouchers;
// without a setup the page offers to set it up. Every figure and word is
// VouchersModel's (the core's).
import SwiftUI

@MainActor
struct VouchersView: View {
    let model: VouchersModel
    /// An expense paid with vouchers, to edit.
    let open: (JSONValue) -> Void
    @Environment(AppLanguage.self) private var language

    var body: some View {
        List {
            switch model.state {
            case .loading:
                Section { NativeLoading() }.listRowBackground(Color.clear)
            case .failed(let message):
                Section { NativeFailed(message: message) { await model.load() } }.listRowBackground(Color.clear)
            case .none:
                setUp
            case .loaded(let figures):
                if let message = model.message {
                    Section { NativeNotice(text: message, warning: true) }.listRowBackground(NativeStyle.card)
                }
                cardSection(figures.card)
                nextSection(figures)
                historySections(figures.history)
            }
        }
        .listStyle(.insetGrouped)
        .listSectionSpacing(20)
        .scrollContentBackground(.hidden)
        .background(NativeStyle.canvas)
        .nativeTabBarRoom()
        .navigationTitle(language.t("vouchers:title"))
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                NavigationLink(value: AppRoute.voucherSetup) {
                    Image(systemName: "gearshape")
                }
                .accessibilityLabel(Text(language.t("vouchers:settingsLink")))
                .accessibilityIdentifier("vouchers.settings")
            }
        }
        .refreshable { await model.load() }
        .task(id: language.current) { await model.load() }
    }

    // MARK: No setup

    private var setUp: some View {
        Section {
            VStack(spacing: 12) {
                Image(systemName: "ticket.fill")
                    .font(.system(size: 34, weight: .semibold))
                    .foregroundStyle(NativeStyle.amber)
                    .accessibilityHidden(true)
                Text(language.t("vouchers:title")).font(.title3.weight(.semibold))
                Text(language.t("vouchers:setup.lead"))
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
                NavigationLink(value: AppRoute.voucherSetup) {
                    Text(language.t("vouchers:setup.start")).frame(maxWidth: .infinity)
                }
                .nativeGlassButton(prominent: true)
                .accessibilityIdentifier("vouchers.start")
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 12)
        }
        .listRowBackground(NativeStyle.card)
    }

    // MARK: The card

    private func cardSection(_ card: VoucherFigures.Card) -> some View {
        Section {
            VStack(alignment: .leading, spacing: 12) {
                VStack(alignment: .leading, spacing: 4) {
                    Text(language.t("vouchers:balance")).font(.subheadline).foregroundStyle(.secondary)
                    Text(card.balance)
                        .font(NativeStyle.money(42))
                        .foregroundStyle(SavingsView.color(card.tone))
                        .monospacedDigit()
                        .lineLimit(1)
                        .minimumScaleFactor(0.6)
                        .accessibilityIdentifier("vouchers.balance")
                }
                HStack(spacing: 8) {
                    tile(language.t("vouchers:month.topUps"), card.topUps)
                    tile(language.t("vouchers:month.spent"), card.spent)
                }
            }
            .padding(.vertical, 8)
        }
        .listRowBackground(NativeStyle.card)
    }

    private func tile(_ label: String, _ figure: SignedFigure) -> some View {
        VStack(spacing: 3) {
            Text(label).font(.caption).foregroundStyle(.secondary).lineLimit(1)
            Text(figure.text)
                .font(.headline)
                .foregroundStyle(SavingsView.color(figure.tone))
                .monospacedDigit()
                .lineLimit(1)
                .minimumScaleFactor(0.7)
        }
        .frame(maxWidth: .infinity, minHeight: 58)
        .background(Theme.Colors.subtle, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
        .accessibilityElement(children: .combine)
    }

    // MARK: The next top-up

    private func nextSection(_ figures: VoucherFigures) -> some View {
        Section {
            HStack(alignment: .center, spacing: 12) {
                NativeIconTile(symbol: "ticket.fill", color: NativeStyle.amber, size: 34)
                VStack(alignment: .leading, spacing: 2) {
                    Text(figures.next.amount)
                        .font(.headline)
                        .foregroundStyle(NativeStyle.positive)
                        .monospacedDigit()
                    Text(figures.next.why).font(.footnote).foregroundStyle(.secondary)
                }
                Spacer(minLength: 8)
                if model.fixing == nil {
                    Button {
                        withAnimation(.snappy) { model.startFix() }
                    } label: {
                        Label(language.t("vouchers:fix.button"), systemImage: "pencil")
                    }
                    .buttonStyle(.bordered)
                    .controlSize(.small)
                    .tint(NativeStyle.tint)
                    .accessibilityIdentifier("vouchers.fix")
                }
            }
            .padding(.vertical, 4)
            if let fix = model.fixing { fixRows(fix) }
        } header: {
            NativeSectionHeader(title: language.t("vouchers:next.title"))
        }
        .listRowBackground(NativeStyle.card)
    }

    /// Edit days in place: the month's days worked, a stepper, what the top-up comes to, Save or Cancel.
    @ViewBuilder
    private func fixRows(_ fix: DaysFix) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(fix.label).font(.subheadline.weight(.semibold))
            HStack(spacing: 14) {
                stepButton("minus", label: language.t("vouchers:fix.fewer"), enabled: fix.fewer) { model.step(-1) }
                Text(verbatim: "\(model.fixDays)")
                    .font(NativeStyle.money(26))
                    .monospacedDigit()
                    .frame(minWidth: 36)
                    .contentTransition(.numericText(value: Double(model.fixDays)))
                    .animation(.snappy, value: model.fixDays)
                stepButton("plus", label: language.t("vouchers:fix.more"), enabled: fix.more) { model.step(1) }
                NativeRich.text(model.fixTotal)
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
                    .minimumScaleFactor(0.8)
            }
            Text(fix.hint).font(.footnote).foregroundStyle(.secondary)
            HStack(spacing: 10) {
                Button(language.t("vouchers:fix.save")) { Task { await model.saveFix() } }
                    .buttonStyle(.borderedProminent)
                    .tint(NativeStyle.solid)
                    .disabled(model.busy)
                    .accessibilityIdentifier("vouchers.fixSave")
                Button(language.t("vouchers:fix.cancel")) { withAnimation(.snappy) { model.cancelFix() } }
                    .buttonStyle(.borderless)
                    .disabled(model.busy)
            }
            .controlSize(.regular)
        }
        .padding(.vertical, 6)
        .sensoryFeedback(.selection, trigger: model.fixDays)
    }

    private func stepButton(_ symbol: String, label: String, enabled: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: symbol)
                .font(.body.weight(.semibold))
                .frame(width: 36, height: 36)
        }
        .buttonStyle(.bordered)
        .buttonBorderShape(.circle)
        .tint(NativeStyle.tint)
        .disabled(!enabled)
        .accessibilityLabel(Text(label))
    }

    // MARK: The history

    @ViewBuilder
    private func historySections(_ months: [VoucherMonth]) -> some View {
        let window = model.window
        ForEach(Array(months.prefix(window.shown).enumerated()), id: \.element.id) { index, month in
            Section {
                ForEach(month.items) { line in lineRow(line) }
            } header: {
                VStack(alignment: .leading, spacing: 6) {
                    if index == 0 {
                        Text(language.t("vouchers:history.title")).font(.title3.weight(.semibold)).foregroundStyle(Color.primary)
                    }
                    HStack(alignment: .firstTextBaseline) {
                        Text(month.heading).font(.headline).foregroundStyle(Color.primary)
                        Spacer()
                        Text(month.net.text)
                            .font(.subheadline.weight(.semibold))
                            .foregroundStyle(month.net.tone == "positive" ? NativeStyle.positive : Theme.Colors.textMuted)
                            .monospacedDigit()
                    }
                }
                .textCase(nil)
                .padding(.horizontal, -4)
            }
            .listRowBackground(NativeStyle.card)
        }
        if window.more {
            Section {
                Button(language.t("savings:history.older")) { model.showOlder() }
                    .frame(maxWidth: .infinity)
                    .accessibilityIdentifier("vouchers.older")
            }
            .listRowBackground(NativeStyle.card)
        }
    }

    @ViewBuilder
    private func lineRow(_ line: VoucherLine) -> some View {
        if let row = line.row, line.type == "spend" {
            Button {
                open(row)
            } label: {
                lineFace(line)
            }
            .foregroundStyle(Color.primary)
        } else {
            lineFace(line)
        }
    }

    private func lineFace(_ line: VoucherLine) -> some View {
        HStack(spacing: 12) {
            if let look = line.look {
                CategoryBadge(look: look, size: 36)
            } else {
                NativeIconTile(symbol: line.type == "topup" ? "ticket.fill" : "wallet.pass.fill",
                               color: line.type == "topup" ? NativeStyle.amber : SettingsRow.slate, size: 36)
            }
            VStack(alignment: .leading, spacing: 2) {
                Text(line.title).font(.body.weight(.medium)).lineLimit(1)
                Text(line.meta).font(.footnote).foregroundStyle(.secondary).lineLimit(2)
            }
            Spacer(minLength: 8)
            Text(line.amount)
                .font(.body.weight(.semibold))
                .foregroundStyle(SavingsView.color(line.tone))
                .monospacedDigit()
        }
        .accessibilityElement(children: .combine)
    }
}
