// Plan (More › Money), after the web's Plan page: a sandbox over the
// recurring payments and income. The header (what's left over a month or a
// year after the plan, the move as a chip, was struck through, what goes
// into savings, and behind the ⓘ how it adds up), the last apply with Undo,
// what changed under the plan, the ideas to save as cards you swipe through,
// the rows by group (tap one to edit it in place, its switch keeps or
// cancels it), "What if I add…", "Type a what-if" (when its helper is on),
// then Your changes with Apply (a sheet: the one real confirmation) and Clear
// plan (asks first). One editor is open at a time, in place under what opened
// it. Every figure and word is PlanModel's (the core's).
import SwiftUI

@MainActor
struct PlanView: View {
    let model: PlanModel
    /// Add, preset: a recurring entry of `kind` ('expense' or 'income').
    let add: (_ kind: String) -> Void
    /// A real rule, to edit (Your changes' "Open payment").
    let openRule: (JSONValue) -> Void
    @Environment(AppLanguage.self) private var language
    @State private var info = false
    @State private var confirmClear = false
    @State private var confirmUndo = false

    var body: some View {
        List {
            switch model.state {
            case .loading:
                Section { NativeLoading() }.listRowBackground(Color.clear)
            case .failed(let message):
                Section { NativeFailed(message: message) { await model.load() } }.listRowBackground(Color.clear)
            case .loaded(let page):
                if page.empty {
                    emptySection
                } else {
                    content(page)
                }
            }
        }
        .listStyle(.insetGrouped)
        .listSectionSpacing(20)
        .scrollContentBackground(.hidden)
        .background(NativeStyle.canvas)
        .scrollDismissesKeyboard(.interactively)
        .nativeTabBarRoom()
        .navigationTitle(language.t("plan:title"))
        .refreshable { await model.load() }
        .task(id: language.current) { await model.load() }
        .onDisappear { Task { await model.flush() } }
        .sheet(isPresented: Binding(get: { model.applySheet != nil }, set: { if !$0 { model.closeApply() } })) {
            PlanApplySheet(model: model).environment(language)
        }
        .confirmationDialog(language.t("plan:clear.title"), isPresented: $confirmClear, titleVisibility: .visible) {
            Button(language.t("plan:clear.confirm"), role: .destructive) { withAnimation(.snappy) { model.clear() } }
            Button(language.t("plan:clear.keep"), role: .cancel) {}
        } message: {
            Text(language.t("plan:clear.body"))
        }
        .confirmationDialog(model.undoTitle, isPresented: $confirmUndo, titleVisibility: .visible) {
            Button(language.t("plan:undo.confirm"), role: .destructive) { Task { await model.undoApply() } }
            Button(language.t("plan:undo.keep"), role: .cancel) {}
        } message: {
            Text([language.t("plan:undo.body"), language.t("plan:undo.entries")].joined(separator: "\n\n"))
        }
        .sensoryFeedback(.selection, trigger: model.open)
    }

    // MARK: Nothing to plan yet

    private var emptySection: some View {
        Section {
            VStack(spacing: 12) {
                Image(systemName: "slider.horizontal.3")
                    .font(.system(size: 34, weight: .semibold))
                    .foregroundStyle(NativeStyle.coral)
                    .accessibilityHidden(true)
                Text(language.t("plan:empty.title")).font(.title3.weight(.semibold)).multilineTextAlignment(.center)
                Text(language.t("plan:empty.text"))
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
                Button {
                    add("expense")
                } label: {
                    Label(language.t("plan:empty.add"), systemImage: "plus").frame(maxWidth: .infinity)
                }
                .nativeGlassButton(prominent: true)
                .accessibilityIdentifier("plan.emptyAdd")
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 12)
            NavigationLink(value: AppRoute.recurring) {
                Label(language.t("plan:empty.go"), systemImage: "arrow.triangle.2.circlepath")
            }
        } header: {
            Text(language.t("plan:empty.lead")).font(.subheadline).foregroundStyle(.secondary).textCase(nil)
        }
        .listRowBackground(NativeStyle.card)
    }

    // MARK: The page

    @ViewBuilder
    private func content(_ page: PlanPage) -> some View {
        if let message = model.message {
            Section { NativeNotice(text: message, warning: model.warning) }.listRowBackground(NativeStyle.card)
        }
        if let applied = page.applied { appliedSection(applied) }
        if let reality = page.reality { realitySection(reality) }
        headerSection(page)
        if !page.ideas.cards.isEmpty { ideasSection(page.ideas) }
        if let pick = model.pick { PlanPickSection(model: model, pick: pick) }
        ForEach(page.groups) { group in groupSection(group) }
        whatIfAddSection
        if model.whatIfOn { PlanWhatIfSection(model: model) }
        if let changes = page.changes {
            changesSection(changes)
        } else {
            Section {
                Label(language.t("plan:hint"), systemImage: "info.circle")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                    .frame(maxWidth: .infinity)
            }
            .listRowBackground(Color.clear)
        }
    }

    // MARK: The header

    private func headerSection(_ page: PlanPage) -> some View {
        let header = page.header
        return Section {
            VStack(alignment: .leading, spacing: 8) {
                HStack(alignment: .center, spacing: 8) {
                    HStack(spacing: 4) {
                        Text(header.label).font(.subheadline.weight(.semibold)).foregroundStyle(.secondary)
                        if header.hasInfo {
                            Button {
                                withAnimation(.snappy) { info.toggle() }
                            } label: {
                                Image(systemName: info ? "info.circle.fill" : "info.circle")
                            }
                            .buttonStyle(.borderless)
                            .foregroundStyle(NativeStyle.tint)
                            .accessibilityLabel(Text(language.t("common:info")))
                            .accessibilityIdentifier("plan.info")
                        }
                    }
                    Spacer(minLength: 8)
                    Picker(language.t("plan:view.label"), selection: Binding(get: { model.view }, set: { model.setView($0) })) {
                        Text(language.t("plan:view.month")).tag("month")
                        Text(language.t("plan:view.year")).tag("year")
                    }
                    .pickerStyle(.segmented)
                    .fixedSize()
                    .accessibilityIdentifier("plan.view")
                }
                HStack(alignment: .center, spacing: 10) {
                    Text(header.figure)
                        .font(NativeStyle.money(34))
                        .monospacedDigit()
                        .lineLimit(1)
                        .minimumScaleFactor(0.6)
                        .contentTransition(.numericText())
                        .animation(.snappy, value: header.figure)
                        .accessibilityIdentifier("plan.figure")
                    Spacer(minLength: 4)
                    PlanDeltaChip(chip: header.delta)
                }
                if let was = header.was {
                    NativeRich.text(model.rich(was)).font(.subheadline).foregroundStyle(.secondary)
                }
                if let saved = header.saved {
                    Label(saved, systemImage: "banknote")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                }
                if info {
                    VStack(alignment: .leading, spacing: 6) {
                        if let steps = header.steps { PlanSumSteps(steps: steps) }
                        if let converted = header.converted {
                            Text(converted).font(.footnote).foregroundStyle(.secondary)
                        }
                    }
                    .padding(12)
                    .background(Theme.Colors.subtle, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                    .transition(.opacity.combined(with: .move(edge: .top)))
                }
                if let missing = header.missing {
                    Text(missing).font(.footnote).foregroundStyle(.secondary)
                }
                if header.incomeHint {
                    VStack(alignment: .leading, spacing: 8) {
                        Label(language.t("plan:impact.addIncome"), systemImage: "info.circle")
                            .font(.subheadline)
                        Button {
                            add("income")
                        } label: {
                            Label(language.t("plan:impact.addIncomeButton"), systemImage: "plus")
                        }
                        .buttonStyle(.bordered)
                        .tint(NativeStyle.tint)
                        .accessibilityIdentifier("plan.addIncome")
                    }
                    .padding(12)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(Theme.Colors.subtle, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                }
            }
            .padding(.vertical, 6)
        } header: {
            if page.saved || model.saveStatus == .error { savedNote }
        }
        .listRowBackground(NativeStyle.card)
    }

    /// Under the title: the plan is kept by itself, and nothing real changes yet (or Try again).
    @ViewBuilder private var savedNote: some View {
        if model.saveStatus == .error {
            HStack(spacing: 8) {
                Text(language.t("plan:saved.error")).foregroundStyle(NativeStyle.negative)
                Button(language.t("plan:saved.retry")) { Task { await model.save() } }
                    .buttonStyle(.borderless)
                    .foregroundStyle(NativeStyle.tint)
            }
            .font(.footnote)
            .textCase(nil)
        } else {
            Label {
                Text(language.t(model.saveStatus == .saving ? "plan:saved.saving" : "plan:saved.saved"))
            } icon: {
                Image(systemName: "checkmark").foregroundStyle(NativeStyle.positive)
            }
            .font(.footnote)
            .foregroundStyle(.secondary)
            .textCase(nil)
        }
    }

    // MARK: Notices

    private func appliedSection(_ applied: PlanApplied) -> some View {
        Section {
            if applied.canUndo {
                HStack(alignment: .top, spacing: 12) {
                    NativeIconTile(symbol: "checkmark", color: NativeStyle.positive, size: 36)
                    VStack(alignment: .leading, spacing: 6) {
                        Text(applied.title ?? "").font(.headline)
                        Text(applied.body ?? "").font(.subheadline).foregroundStyle(.secondary)
                        Button(language.t("plan:applied.undo")) { confirmUndo = true }
                            .buttonStyle(.bordered)
                            .tint(NativeStyle.tint)
                            .controlSize(.small)
                            .disabled(model.busy)
                            .accessibilityIdentifier("plan.undo")
                        Text(applied.until ?? "").font(.footnote).foregroundStyle(.secondary)
                    }
                }
                .padding(.vertical, 4)
                NavigationLink(value: AppRoute.recurring) { Text(language.t("plan:applied.view")) }
            } else {
                NavigationLink(value: AppRoute.recurring) {
                    Label(applied.note ?? "", systemImage: "checkmark")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                }
            }
        }
        .listRowBackground(NativeStyle.card)
    }

    private func realitySection(_ reality: PlanReality) -> some View {
        Section {
            VStack(alignment: .leading, spacing: 6) {
                Label(language.t("plan:reality.title"), systemImage: "arrow.counterclockwise")
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(NativeStyle.warning)
                Text(language.t("plan:reality.lead")).font(.footnote)
                ForEach(reality.lines) { line in
                    Text(verbatim: "• " + line.text).font(.footnote)
                }
                Button(language.t("plan:reality.ok")) { withAnimation(.snappy) { model.acknowledge() } }
                    .buttonStyle(.bordered)
                    .tint(NativeStyle.tint)
                    .controlSize(.small)
                    .accessibilityIdentifier("plan.realityOk")
            }
            .padding(.vertical, 4)
        }
        .listRowBackground(NativeStyle.warning.opacity(0.12))
    }

    // MARK: Ideas

    private func ideasSection(_ ideas: PlanIdeas) -> some View {
        Section {
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(alignment: .top, spacing: 12) {
                    ForEach(ideas.cards) { card in
                        PlanIdeaCardView(card: card, picking: model.open == card.id,
                                         onTry: { withAnimation(.snappy) { model.tryIdea(card) } },
                                         onDismiss: { withAnimation(.snappy) { model.dismiss(card) } })
                    }
                }
                .padding(.horizontal, 20)
                .padding(.vertical, 4)
                .scrollTargetLayout()
            }
            .scrollTargetBehavior(.viewAligned)
            .listRowInsets(EdgeInsets(top: 0, leading: 0, bottom: 0, trailing: 0))
            .listRowBackground(Color.clear)
        } header: {
            HStack(alignment: .firstTextBaseline) {
                Text(language.t("plan:ideas.title")).font(.title3.weight(.semibold)).foregroundStyle(Color.primary)
                Spacer(minLength: 8)
                if let count = ideas.count { Text(count).font(.footnote).foregroundStyle(.secondary) }
            }
            .textCase(nil)
            .padding(.horizontal, -4)
        }
    }

    // MARK: Rows

    private func groupSection(_ group: PlanGroup) -> some View {
        Section {
            ForEach(group.rows) { row in
                PlanRowView(row: row, open: model.open == row.id,
                            onOpen: { withAnimation(.snappy) { model.toggleOpen(row.id) } },
                            onToggle: { withAnimation(.snappy) { model.toggle(row.id) } })
                if let stale = row.stale {
                    NativeRich.text(model.rich(stale))
                        .font(.footnote)
                        .padding(10)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .background(NativeStyle.warning.opacity(0.12), in: RoundedRectangle(cornerRadius: 10, style: .continuous))
                }
                if model.open == row.id { editor(for: row.id) }
            }
        } header: {
            HStack(alignment: .firstTextBaseline) {
                Text(group.title).font(.headline).foregroundStyle(Color.primary)
                Spacer(minLength: 8)
                Text(group.total)
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(.secondary)
                    .monospacedDigit()
                    .contentTransition(.numericText())
            }
            .textCase(nil)
            .padding(.horizontal, -4)
        }
        .listRowBackground(NativeStyle.card)
    }

    /// The open editor under a row or a change: a row's, or an added one's form.
    @ViewBuilder
    private func editor(for id: String) -> some View {
        if let form = model.addForm {
            PlanAddFormView(model: model, form: form)
        } else if let editor = model.editor {
            PlanEditorView(model: model, editor: editor)
        }
    }

    private var whatIfAddSection: some View {
        Section {
            Button {
                withAnimation(.snappy) { model.toggleOpen("new") }
            } label: {
                HStack(spacing: 12) {
                    Image(systemName: "plus.circle.fill")
                        .font(.title2)
                        .foregroundStyle(NativeStyle.tint)
                        .accessibilityHidden(true)
                    VStack(alignment: .leading, spacing: 2) {
                        Text(language.t("plan:whatIf.title")).font(.body.weight(.semibold)).foregroundStyle(NativeStyle.tint)
                        Text(language.t("plan:whatIf.text")).font(.footnote).foregroundStyle(.secondary)
                    }
                    Spacer(minLength: 4)
                    Image(systemName: model.open == "new" ? "chevron.up" : "chevron.down")
                        .font(.footnote.weight(.semibold))
                        .foregroundStyle(.tertiary)
                }
            }
            .foregroundStyle(Color.primary)
            .accessibilityIdentifier("plan.whatIf")
            if model.open == "new", let form = model.addForm { PlanAddFormView(model: model, form: form) }
        }
        .listRowBackground(NativeStyle.card)
    }

    // MARK: Your changes

    private func changesSection(_ changes: PlanChanges) -> some View {
        Section {
            ForEach(changes.rows) { row in
                VStack(alignment: .leading, spacing: 6) {
                    Button {
                        withAnimation(.snappy) { model.toggleOpen("changes-\(row.id)") }
                    } label: {
                        HStack(alignment: .top, spacing: 12) {
                            CategoryBadge(look: row.look, size: 32)
                            VStack(alignment: .leading, spacing: 2) {
                                Text(row.name).font(.body.weight(.semibold)).lineLimit(1)
                                Text(row.line).font(.footnote).foregroundStyle(.secondary)
                                if let note = row.note { Text(note).font(.footnote).foregroundStyle(.secondary) }
                            }
                            Spacer(minLength: 8)
                            VStack(alignment: .trailing, spacing: 2) {
                                Text(row.perMonth.text)
                                    .font(.subheadline.weight(.semibold))
                                    .foregroundStyle(SavingsView.color(row.perMonth.tone))
                                    .monospacedDigit()
                                Text(row.perYear).font(.caption).foregroundStyle(.secondary).monospacedDigit()
                            }
                        }
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel(Text(row.editLabel))
                    HStack(spacing: 16) {
                        Button {
                            withAnimation(.snappy) { model.drop(row.id) }
                        } label: {
                            Label(row.drop, systemImage: row.remove ? "xmark" : "arrow.uturn.backward")
                        }
                        .buttonStyle(.borderless)
                        .foregroundStyle(NativeStyle.tint)
                        .accessibilityLabel(Text(row.dropLabel))
                        if let id = row.rule, let rule = model.rule(id) {
                            Button {
                                openRule(rule)
                            } label: {
                                Label(language.t("plan:changes.open"), systemImage: "arrow.up.forward.square")
                            }
                            .buttonStyle(.borderless)
                            .foregroundStyle(.secondary)
                        }
                    }
                    .font(.footnote.weight(.semibold))
                    .padding(.leading, 44)
                }
                .padding(.vertical, 2)
                if model.open == "changes-\(row.id)" { editor(for: row.id) }
            }
            HStack(alignment: .firstTextBaseline) {
                Text(changes.total.label).font(.subheadline.weight(.semibold))
                Spacer(minLength: 8)
                VStack(alignment: .trailing, spacing: 2) {
                    Text(changes.total.perMonth)
                        .font(NativeStyle.money(20, relativeTo: .title3))
                        .foregroundStyle(SavingsView.color(changes.total.tone))
                        .monospacedDigit()
                    Text(changes.total.perYear).font(.caption.weight(.semibold)).foregroundStyle(.secondary)
                }
            }
            VStack(spacing: 10) {
                if changes.canApply {
                    Button {
                        model.openApply()
                    } label: {
                        Text(language.t("plan:changes.apply")).frame(maxWidth: .infinity)
                    }
                    .nativeGlassButton(prominent: true)
                    .accessibilityIdentifier("plan.apply")
                }
                Button {
                    confirmClear = true
                } label: {
                    Label(language.t("plan:changes.clear"), systemImage: "arrow.counterclockwise").frame(maxWidth: .infinity)
                }
                .nativeGlassButton()
                .accessibilityIdentifier("plan.clear")
            }
            .padding(.vertical, 6)
            .listRowBackground(Color.clear)
            .listRowInsets(EdgeInsets(top: 4, leading: 0, bottom: 4, trailing: 0))
        } header: {
            Text(changes.title).font(.title3.weight(.semibold)).foregroundStyle(Color.primary).textCase(nil)
                .padding(.horizontal, -4)
        }
        .listRowBackground(NativeStyle.card)
    }
}

// MARK: - Pieces

/// The move in the header's figure: green when it leaves more, red when less.
struct PlanDeltaChip: View {
    let chip: PlanHeader.Chip

    var body: some View {
        let tone = chip.good > 0 ? "positive" : chip.good < 0 ? "negative" : "muted"
        Text(chip.text)
            .font(.subheadline.weight(.bold))
            .foregroundStyle(SavingsView.color(tone))
            .lineLimit(1)
            .minimumScaleFactor(0.8)
            .padding(.horizontal, 12)
            .padding(.vertical, 6)
            .background(tone == "muted" ? Theme.Colors.subtle : SavingsView.color(tone).opacity(0.12), in: Capsule())
            .accessibilityIdentifier("plan.delta")
    }
}

/// "How it adds up": each step with today's figure struck through where it moves, then the total.
struct PlanSumSteps: View {
    let steps: PlanSteps

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(steps.title).font(.subheadline.weight(.bold))
            ForEach(steps.steps, id: \.key) { step in
                line(step.label, step.value, step.was, bold: false, tone: "default")
            }
            Divider()
            line(steps.total.label, steps.total.value, steps.total.was, bold: true, tone: steps.total.tone)
        }
        .font(.subheadline)
        .accessibilityElement(children: .combine)
    }

    private func line(_ label: String, _ value: String, _ was: String?, bold: Bool, tone: String) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: 6) {
            Text(label).fontWeight(bold ? .bold : .regular)
            Spacer(minLength: 8)
            if let was {
                Text(was).font(.caption).strikethrough().foregroundStyle(.secondary).monospacedDigit()
            }
            Text(value)
                .fontWeight(bold ? .bold : .semibold)
                .foregroundStyle(SavingsView.color(tone))
                .monospacedDigit()
        }
    }
}

/// A signal's tag: price up, overlap, over budget, biggest saver.
struct PlanTagView: View {
    let tag: PlanTag

    var body: some View {
        Text(tag.text)
            .font(.caption2.weight(.bold))
            .foregroundStyle(color)
            .lineLimit(1)
            .padding(.horizontal, 8)
            .padding(.vertical, 3)
            .overlay(Capsule().stroke(color.opacity(0.6), lineWidth: 1))
    }

    private var color: Color {
        switch tag.kind {
        case "overlap": return SettingsRow.purple
        case "overBudget": return NativeStyle.negative
        default: return NativeStyle.warning
        }
    }
}

/// One plan row: its badge, name and state, the line under it, its tag, the
/// amount (today's struck through when it changed); tap to edit in place, the
/// switch keeps it or cancels it in the plan.
struct PlanRowView: View {
    let row: PlanRowParts
    let open: Bool
    let onOpen: () -> Void
    let onToggle: () -> Void

    var body: some View {
        HStack(spacing: 10) {
            Button(action: onOpen) {
                HStack(alignment: .center, spacing: 12) {
                    CategoryBadge(look: row.look, size: 34).opacity(row.cancelled ? 0.5 : 1)
                    VStack(alignment: .leading, spacing: 3) {
                        HStack(spacing: 6) {
                            Text(row.name)
                                .font(.body.weight(.semibold))
                                .foregroundStyle(row.cancelled ? Color.secondary : Color.primary)
                                .lineLimit(1)
                            if let state = row.state {
                                Text(state.text)
                                    .font(.caption2.weight(.bold))
                                    .foregroundStyle(Color.white)
                                    .padding(.horizontal, 7)
                                    .padding(.vertical, 2)
                                    .background(stateColor(state.tone), in: Capsule())
                            }
                        }
                        Text(row.meta).font(.footnote).foregroundStyle(.secondary).lineLimit(2)
                        if let tag = row.tag { PlanTagView(tag: tag) }
                    }
                    Spacer(minLength: 6)
                    VStack(alignment: .trailing, spacing: 2) {
                        Text(row.amount.text)
                            .font(.subheadline.weight(.semibold))
                            .strikethrough(row.amount.struck)
                            .foregroundStyle(SavingsView.color(row.amount.tone))
                            .monospacedDigit()
                        if let was = row.was {
                            Text(was).font(.caption).strikethrough().foregroundStyle(.secondary).monospacedDigit()
                        }
                    }
                }
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel(Text(row.openLabel))
            .accessibilityAddTraits(open ? .isSelected : [])
            .accessibilityIdentifier("plan.row.\(row.name)")
            Toggle(isOn: Binding(get: { !row.cancelled }, set: { _ in onToggle() })) { EmptyView() }
                .labelsHidden()
                .tint(NativeStyle.positive)
                .accessibilityLabel(Text(row.toggleLabel))
        }
        .padding(.vertical, 2)
    }

    private func stateColor(_ tone: String) -> Color {
        switch tone {
        case "positive": return NativeStyle.positive
        case "negative": return NativeStyle.negative
        default: return NativeStyle.solid
        }
    }
}

/// An idea to save: its tag and ×, the headline and line, what it saves (or
/// what a rise costs), Try it.
struct PlanIdeaCardView: View {
    let card: PlanIdeaCard
    let picking: Bool
    let onTry: () -> Void
    let onDismiss: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(alignment: .top) {
                PlanTagView(tag: card.tag)
                Spacer(minLength: 4)
                Button(action: onDismiss) {
                    Image(systemName: "xmark")
                        .font(.footnote.weight(.semibold))
                        .foregroundStyle(.secondary)
                        .frame(width: 28, height: 28)
                }
                .buttonStyle(.borderless)
                .accessibilityLabel(Text(card.dismissLabel))
            }
            Text(card.title).font(.headline).lineLimit(3).fixedSize(horizontal: false, vertical: true)
            Text(card.body).font(.footnote).foregroundStyle(.secondary).lineLimit(4)
                .fixedSize(horizontal: false, vertical: true)
            Spacer(minLength: 0)
            HStack(alignment: .center) {
                Text(card.figure.text)
                    .font(.subheadline.weight(.bold))
                    .foregroundStyle(SavingsView.color(card.figure.tone))
                    .lineLimit(1)
                    .minimumScaleFactor(0.8)
                Spacer(minLength: 6)
                Button(card.tryLabel, action: onTry)
                    .buttonStyle(.borderedProminent)
                    .tint(NativeStyle.solid)
                    .controlSize(.small)
                    .accessibilityAddTraits(picking ? .isSelected : [])
                    .accessibilityIdentifier("plan.try.\(card.kind)")
            }
        }
        .padding(16)
        .frame(width: 272, alignment: .leading)
        .frame(minHeight: 190, alignment: .top)
        .background(NativeStyle.card, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: 20, style: .continuous)
                .stroke(picking ? NativeStyle.tint : Color.primary.opacity(0.06), lineWidth: picking ? 2 : 1)
        }
    }
}
