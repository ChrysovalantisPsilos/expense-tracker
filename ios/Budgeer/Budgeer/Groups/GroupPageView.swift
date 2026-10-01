// A group's page: its picture and name as a proper title with the members
// under it, a balance card (your balance, the line that matters most,
// Settle up in prominent glass and Balances beside it), then one chat-like
// timeline of expenses (each with the badge its description suggests),
// settlements and comments, newest at the bottom like Messages, with the
// comment field floating over its foot. The floating Add adds an expense
// to this group (the page lends it, AddSlot); the … menu holds Members,
// Share summary (the group-report PDF to the share sheet), Edit group,
// Leave and Delete. The owner renames the group in place (tap its name)
// and changes its picture any time (tap the picture: Edit group). Deleting
// asks for the name on a small sheet. Who owes whom is the Balances page.
// Settling the group up bursts confetti behind the cards. Everything it
// shows is GroupModel's (the core's).
import SwiftUI

/// Holds one group's model while its page is in the stack.
@MainActor
struct GroupPageHost: View {
    let groupId: String
    let userId: String
    let data: DataLayer
    let live: LiveHub
    let site: String
    /// The group is gone for the user (left or deleted): back to the list.
    let onGone: () -> Void
    @State private var model: GroupModel?

    var body: some View {
        Group {
            if let model {
                GroupPageView(model: model, onGone: onGone)
                    .liveRefresh(live, tables: LiveHub.shared) { await model.load() }
            } else {
                NativeLoading()
            }
        }
        .onAppear {
            if model == nil { model = GroupModel(groupId: groupId, userId: userId, site: site, data: data) }
        }
    }
}

/// An expense form or settle-up sheet over the group's page.
struct GroupSheet: Identifiable {
    enum Kind {
        case expense(GroupExpenseModel)
        case settle(SettleUpModel)
    }
    let id = UUID()
    let kind: Kind
}

@MainActor
struct GroupPageView: View {
    @Bindable var model: GroupModel
    var onGone: () -> Void = {}
    @Environment(AppLanguage.self) private var language
    @State private var sheet: GroupSheet?
    @State private var showMembers = false
    @State private var showBalances = false
    @State private var confirmLeave = false
    @State private var confirmDelete = false
    @State private var editing = false
    @State private var sharing = false
    @State private var blocked = false
    @State private var typed = ""
    /// The name being edited in place (the owner), nil when not renaming.
    @State private var renaming: String?
    @FocusState private var naming: Bool
    @State private var comment = ""
    @State private var replyTo: String?
    @State private var celebrating: Bool
    @FocusState private var composing: Bool

    init(model: GroupModel, onGone: @escaping () -> Void = {}, celebrating: Bool = false) {
        self.model = model
        self.onGone = onGone
        _celebrating = State(initialValue: celebrating)
    }

    var body: some View {
        content
            .background {
                ZStack {
                    NativeStyle.canvas
                    if celebrating { NativeConfetti() }
                }
                .ignoresSafeArea()
            }
            // The name is the hero's title; the bar keeps it for Back and the app switcher.
            .navigationTitle(model.groupName)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .principal) { Color.clear.frame(width: 1, height: 1) }
                toolbar
            }
            .task(id: language.current) { await model.load() }
            .lendsAdd(.run { addExpense() })
            .onChange(of: model.figures?.balances.plan.isEmpty) { was, now in
                if was == false, now == true {
                    celebrating = true
                    NativeHaptics.success()
                }
            }
            .sheet(item: $sheet) { sheet in sheetContent(sheet).environment(language) }
            .navigationDestination(isPresented: $showMembers) { MembersView(model: model) }
            .navigationDestination(isPresented: $showBalances) {
                BalancesView(model: model) {
                    showBalances = false
                    openSettle()
                }
            }
            .confirmationDialog(language.t("groups:modals.leave.title", ["name": .string(model.groupName)]),
                                isPresented: $confirmLeave, titleVisibility: .visible) {
                Button(language.t("groups:modals.leave.confirm"), role: .destructive) { leave(silent: false) }
                Button(language.t("groups:modals.leave.silent"), role: .destructive) { leave(silent: true) }
                Button(language.t("common:actions.cancel"), role: .cancel) {}
            } message: {
                Text(language.t(model.figures?.isOwner == true ? "groups:modals.leave.bodyOwner" : "groups:modals.leave.body"))
            }
            .sheet(isPresented: $confirmDelete) {
                DeleteGroupSheet(model: model, typed: $typed) { onGone() }.environment(language)
            }
            .alert(language.t("groups:modals.deleteBlocked.title", ["name": .string(model.groupName)]), isPresented: $blocked) {
                Button(language.t("groups:modals.deleteBlocked.manage")) { showMembers = true }
                Button(language.t("common:actions.close"), role: .cancel) {}
            } message: {
                Text(language.t("groups:modals.deleteBlocked.body")) + Text("\n\n")
                    + NativeRich.text(model.rich(language.t("groups:modals.deleteBlocked.stillIn",
                                                            ["names": .string(model.figures?.stillIn ?? "")])))
            }
            .navigationDestination(isPresented: $editing) { EditGroupView(model: model) }
            .sheet(isPresented: $sharing) {
                if let file = model.statementFile { ShareSheet(items: [file]) }
            }
    }

    @ViewBuilder private var content: some View {
        switch model.state {
        case .loading:
            NativeLoading()
        case .failed(let message):
            NativeFailed(message: message) { await model.load() }
        case .loaded(let figures):
            VStack(spacing: 0) {
                if let message = model.message {
                    NativeNotice(text: message).padding(.horizontal, 16).padding(.top, 6)
                }
                hero(figures)
                    .padding(.horizontal, 16)
                    .padding(.top, 4)
                    .padding(.bottom, 10)
                timeline(figures)
            }
            .nativeTabBarRoom()
        }
    }

    // MARK: The hero

    /// The group's picture and its name as the page's title, the members
    /// beneath (a tap shows them), then your balance on its card: the line
    /// that matters most, Settle up in prominent glass and Balances beside it.
    private func hero(_ figures: GroupPageFigures) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .center, spacing: 14) {
                picture(figures)
                VStack(alignment: .leading, spacing: 5) {
                    title(figures)
                    Button { showMembers = true } label: {
                        HStack(spacing: 6) {
                            NativeAvatarStack(stack: figures.avatars, size: 22, ring: NativeStyle.canvas)
                            Text(figures.members).font(.footnote.weight(.semibold)).foregroundStyle(.secondary)
                            Image(systemName: "chevron.right").font(.caption2.weight(.bold)).foregroundStyle(.tertiary)
                        }
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel(language.t("groups:header.showMembers", ["members": .string(figures.members)]))
                    .accessibilityIdentifier("group.members")
                }
                Spacer(minLength: 0)
            }
            VStack(spacing: 4) {
                Text(language.t("groups:balances.yours"))
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                Text(figures.balances.mine.text)
                    .font(NativeStyle.money(38))
                    .foregroundStyle(NativeStyle.tone(figures.balances.mine.tone))
                    .monospacedDigit()
                    .lineLimit(1)
                    .minimumScaleFactor(0.6)
                    .nativeFigure(figures.balances.mine.text)
                    .accessibilityIdentifier("group.mine")
                Text(highlight(figures.balances.highlight))
                    .font(.footnote)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
                HStack(spacing: 10) {
                    if figures.myMemberId != nil, !figures.balances.plan.isEmpty {
                        Button { openSettle() } label: {
                            Label(language.t("groups:balances.settleUp"), systemImage: "checkmark.circle.fill").lineLimit(1)
                        }
                        .nativeGlassButton(prominent: true)
                        .accessibilityIdentifier("group.settle")
                    }
                    Button { showBalances = true } label: {
                        Label(language.t("groups:balances.title"), systemImage: "chart.bar.xaxis").lineLimit(1)
                    }
                    .nativeGlassButton()
                    .accessibilityIdentifier("group.balances")
                }
                .padding(.top, 8)
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 14)
            .background(NativeStyle.card, in: RoundedRectangle(cornerRadius: 22, style: .continuous))
        }
    }

    /// The group's picture; the owner taps it (or its camera) to change it on Edit group.
    @ViewBuilder private func picture(_ figures: GroupPageFigures) -> some View {
        let tile = GroupPicture(imageUrl: figures.imageUrl, colour: figures.colour, size: 58)
        if figures.isOwner {
            Button { editing = true } label: {
                tile.overlay(alignment: .bottomTrailing) {
                    Image(systemName: "camera.fill")
                        .font(.system(size: 11, weight: .bold))
                        .foregroundStyle(NativeStyle.tint)
                        .frame(width: 26, height: 26)
                        .nativeGlass(Circle())
                        .offset(x: 6, y: 6)
                }
            }
            .buttonStyle(.plain)
            .accessibilityLabel(language.t("groups:header.changePhoto"))
            .accessibilityIdentifier("group.photo")
        } else {
            tile
        }
    }

    /// The name as the page's title; the owner taps it to rename the group in
    /// place (the field, then Save or Cancel beside it).
    @ViewBuilder private func title(_ figures: GroupPageFigures) -> some View {
        let font = NativeStyle.title(28, lang: language.current, relativeTo: .largeTitle)
        if let draft = renaming {
            HStack(spacing: 8) {
                TextField(language.t("groups:edit.name"), text: Binding(get: { draft }, set: { renaming = $0 }))
                    .font(font)
                    .focused($naming)
                    .submitLabel(.done)
                    .onSubmit { rename() }
                    .padding(.horizontal, 12)
                    .padding(.vertical, 4)
                    .background(NativeStyle.card, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                    .accessibilityIdentifier("group.name")
                Button { rename() } label: {
                    Image(systemName: "checkmark")
                        .font(.system(size: 15, weight: .bold))
                        .foregroundStyle(Color.white)
                        .frame(width: 36, height: 36)
                        .background(NativeStyle.solid, in: Circle())
                }
                .buttonStyle(.plain)
                .disabled(model.busy || draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                .accessibilityLabel(language.t("common:actions.save"))
                Button {
                    withAnimation(NativeMotion.expand) { renaming = nil }
                } label: {
                    Image(systemName: "xmark")
                        .font(.system(size: 13, weight: .bold))
                        .foregroundStyle(.secondary)
                        .frame(width: 36, height: 36)
                        .background(Theme.Colors.subtle, in: Circle())
                }
                .buttonStyle(.plain)
                .accessibilityLabel(language.t("common:actions.cancel"))
            }
            .transition(.opacity)
        } else {
            Text(figures.name)
                .font(font)
                .lineLimit(2)
                .minimumScaleFactor(0.75)
                .accessibilityAddTraits(figures.isOwner ? [.isHeader, .isButton] : .isHeader)
                .accessibilityIdentifier("group.title")
                .onTapGesture {
                    guard figures.isOwner else { return }
                    withAnimation(NativeMotion.expand) { renaming = figures.name }
                    naming = true
                }
                .transition(.opacity)
        }
    }

    /// Save the name typed in place (GroupModel.saveEdit, the name only).
    private func rename() {
        guard let draft = renaming else { return }
        Task {
            if await model.saveEdit(name: draft, cover: nil) {
                NativeHaptics.success()
                withAnimation(NativeMotion.expand) { renaming = nil }
            }
        }
    }

    /// A new expense in this group (the floating Add, while the page is on top).
    private func addExpense() {
        guard model.figures?.myMemberId != nil else { return }
        sheet = GroupSheet(kind: .expense(model.expenseForm(expenseId: nil)))
    }

    /// The line that matters most: its words, then the amount.
    private func highlight(_ line: BalancesParts.Highlight) -> String {
        [line.text, line.amount].compactMap { $0 }.joined(separator: " ")
    }

    // MARK: The timeline

    private func timeline(_ figures: GroupPageFigures) -> some View {
        ScrollView {
            LazyVStack(spacing: 10) {
                if model.timeline.isEmpty {
                    ContentUnavailableView(language.t("groups:history.empty.title"), systemImage: "doc.text",
                                           description: Text(language.t("groups:history.empty.text")))
                }
                ForEach(model.timeline) { item in
                    TimelineRow(item: item, selected: item.itemId == target && item.itemId != nil) {
                        if case .expense(let row) = item, row.canEdit {
                            sheet = GroupSheet(kind: .expense(model.expenseForm(expenseId: row.id)))
                        }
                    } reply: {
                        replyTo = item.itemId
                        composing = true
                    } delete: { commentId in
                        Task { await deleteComment(commentId, on: item.itemId) }
                    }
                }
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 12)
            .animation(NativeMotion.expand, value: model.timeline)
        }
        .defaultScrollAnchor(.bottom)
        .scrollDismissesKeyboard(.interactively)
        .safeAreaInset(edge: .bottom, spacing: 0) {
            if figures.myMemberId != nil, target != nil { composer }
        }
    }

    /// The item a new comment goes on: the one picked, else the newest.
    private var target: String? {
        replyTo ?? model.timeline.last { $0.itemId != nil }?.itemId
    }

    private var targetName: String {
        for item in model.timeline {
            switch item {
            case .expense(let row) where row.id == target: return row.title
            case .settlement(let row) where row.id == target: return row.title
            default: continue
            }
        }
        return ""
    }

    private var composer: some View {
        HStack(spacing: 8) {
            TextField(language.t("ios:native.group.commentOn", ["name": .string(targetName)]), text: $comment, axis: .vertical)
                .lineLimit(1...4)
                .focused($composing)
                .padding(.horizontal, 16)
                .padding(.vertical, 11)
                .nativeGlass(RoundedRectangle(cornerRadius: 22, style: .continuous), interactive: true)
                .accessibilityIdentifier("group.comment")
            Button { Task { await send() } } label: {
                Image(systemName: "arrow.up")
                    .font(.system(size: 17, weight: .bold))
                    .foregroundStyle(Color.white)
                    .frame(width: 44, height: 44)
                    .nativeGlass(Circle(), tint: NativeStyle.solid, interactive: true)
            }
            .buttonStyle(.plain)
            .disabled(comment.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
            .accessibilityLabel(language.t("groups:comments.send"))
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 8)
    }

    // MARK: The bar

    @ToolbarContentBuilder private var toolbar: some ToolbarContent {
        ToolbarItem(placement: .topBarTrailing) {
            Menu {
                Button { showMembers = true } label: {
                    Label(language.t("groups:members.title"), systemImage: "person.2")
                }
                // Share summary: the group's PDF report (group-report), as the statement is.
                Button {
                    Task {
                        await model.makeStatement()
                        if model.statementFile != nil { sharing = true }
                    }
                } label: {
                    Label(language.t("groups:header.shareSummary"), systemImage: "square.and.arrow.up")
                }
                .disabled(model.busy)
                .accessibilityIdentifier("group.share")
                if model.figures?.isOwner == true {
                    Button { editing = true } label: {
                        Label(language.t("groups:edit.title"), systemImage: "pencil")
                    }
                }
                if model.figures?.myMemberId != nil {
                    Button { confirmLeave = true } label: {
                        Label(language.t("groups:header.leave"), systemImage: "rectangle.portrait.and.arrow.right")
                    }
                }
                if model.figures?.isOwner == true {
                    Button(role: .destructive) {
                        typed = ""
                        if model.figures?.canDelete == true { confirmDelete = true } else { blocked = true }
                    } label: {
                        Label(language.t("groups:header.delete"), systemImage: "trash")
                    }
                }
            } label: {
                Image(systemName: "ellipsis")
            }
            .accessibilityLabel(language.t("groups:header.options"))
        }
    }

    // MARK: Sheets

    @ViewBuilder private func sheetContent(_ sheet: GroupSheet) -> some View {
        switch sheet.kind {
        case .expense(let form):
            GroupExpenseSheet(model: form) { toast in
                model.note(toast?.title)
                Task { await model.load() }
            }
        case .settle(let settle):
            SettleUpView(model: settle) {
                model.note(language.t("groups:settle.recorded"))
                Task { await model.load() }
            }
        }
    }

    private func openSettle() {
        if let settle = model.settleUp() { sheet = GroupSheet(kind: .settle(settle)) }
    }

    // MARK: Actions

    private func send() async {
        guard let target, let thread = model.comments(itemId: target) else { return }
        thread.draft = comment
        await thread.send()
        if thread.message == nil {
            comment = ""
            replyTo = nil
            await model.load()
        } else {
            model.note(thread.message)
        }
    }

    private func deleteComment(_ id: String, on item: String?) async {
        guard let item, let thread = model.comments(itemId: item) else { return }
        await thread.delete(id)
        await model.load()
    }

    private func leave(silent: Bool) {
        Task { if await model.leave(silent: silent) { onGone() } }
    }
}

/// One moment of the timeline: a day, an expense bubble (yours on the right,
/// in the accent's tint), a settlement in the middle, or a comment.
struct TimelineRow: View {
    let item: TimelineItem
    /// The item a new comment goes on.
    let selected: Bool
    let open: () -> Void
    let reply: () -> Void
    let delete: (String) -> Void
    @Environment(AppLanguage.self) private var language

    var body: some View {
        switch item {
        case .day(_, let title):
            Text(title)
                .font(.caption.weight(.semibold))
                .foregroundStyle(.secondary)
                .padding(.top, 8)
        case .expense(let row):
            HStack(alignment: .bottom, spacing: 8) {
                if row.mine {
                    Spacer(minLength: 40)
                } else if let payer = row.payer {
                    NativeAvatar(avatar: payer, size: 28)
                }
                Button(action: open) {
                    HStack(alignment: .top, spacing: 10) {
                        if let look = row.look {
                            CategoryBadge(look: look, size: 34)
                        }
                        VStack(alignment: .leading, spacing: 2) {
                            HStack(alignment: .firstTextBaseline, spacing: 8) {
                                Text(row.title).font(.subheadline.weight(.semibold)).lineLimit(2)
                                Spacer(minLength: 4)
                                Text(row.amount).font(.subheadline.weight(.semibold)).monospacedDigit()
                            }
                            Text(row.meta.map(\.text).joined(separator: " · "))
                                .font(.caption).foregroundStyle(.secondary).lineLimit(2)
                            if let share = row.share {
                                Text(share).font(.caption.weight(.medium)).foregroundStyle(NativeStyle.tint)
                            }
                            if let amountMeta = row.amountMeta {
                                Text(amountMeta).font(.caption).foregroundStyle(.secondary)
                            }
                        }
                    }
                    .padding(12)
                    .frame(maxWidth: 310, alignment: .leading)
                    .background(row.mine ? Theme.Colors.accentSubtle : NativeStyle.card,
                                in: RoundedRectangle(cornerRadius: 20, style: .continuous))
                    .overlay {
                        if selected {
                            RoundedRectangle(cornerRadius: 20, style: .continuous).stroke(NativeStyle.tint, lineWidth: 1.5)
                        }
                    }
                }
                .buttonStyle(.plain)
                .accessibilityIdentifier("group.expense.\(row.id)")
                replyButton(count: row.comments)
                if !row.mine { Spacer(minLength: 0) }
            }
        case .settlement(let row):
            HStack(spacing: 6) {
                Image(systemName: "checkmark.circle.fill").foregroundStyle(NativeStyle.positive)
                Text(row.title).lineLimit(1)
                Text(verbatim: "·")
                Text(row.amount).fontWeight(.semibold).monospacedDigit()
            }
            .font(.footnote)
            .padding(.horizontal, 14)
            .padding(.vertical, 8)
            .background(NativeStyle.positive.opacity(0.12), in: Capsule())
            .overlay { if selected { Capsule().stroke(NativeStyle.tint, lineWidth: 1.5) } }
            .onTapGesture(perform: reply)
        case .comment(let row):
            HStack(alignment: .bottom, spacing: 8) {
                if row.mine { Spacer(minLength: 64) } else { NativeAvatar(avatar: row.avatar, size: 28) }
                VStack(alignment: .leading, spacing: 2) {
                    if !row.mine {
                        Text(row.author).font(.caption2.weight(.semibold)).foregroundStyle(.secondary)
                    }
                    Text(row.body).font(.subheadline)
                    Text(row.when).font(.caption2).foregroundStyle(row.mine ? Color.white.opacity(0.8) : Color.secondary)
                }
                .padding(.horizontal, 14)
                .padding(.vertical, 9)
                .foregroundStyle(row.mine ? Color.white : Color.primary)
                .background(row.mine ? NativeStyle.solid : NativeStyle.card,
                            in: RoundedRectangle(cornerRadius: 18, style: .continuous))
                .contextMenu {
                    if row.canDelete {
                        Button(role: .destructive) { delete(row.avatar.id ?? "") } label: {
                            Label(language.t("common:actions.delete"), systemImage: "trash")
                        }
                    }
                }
                if !row.mine { Spacer(minLength: 64) }
            }
        }
    }

    /// Comment on this item (with its count).
    private func replyButton(count: Int) -> some View {
        Button(action: reply) {
            HStack(spacing: 2) {
                Image(systemName: "bubble.right")
                if count > 0 { Text(verbatim: "\(count)").font(.caption2) }
            }
            .font(.footnote)
            .foregroundStyle(.secondary)
            .frame(minWidth: 32, minHeight: 44)
        }
        .buttonStyle(.plain)
        .accessibilityLabel(language.t("groups:history.comments"))
    }
}

/// Delete a group (the owner, once everyone else has left): the web's
/// words, the name typed to confirm in a proper field, Delete or Cancel.
@MainActor
struct DeleteGroupSheet: View {
    let model: GroupModel
    @Binding var typed: String
    let onGone: () -> Void
    @Environment(AppLanguage.self) private var language
    @Environment(\.dismiss) private var dismiss
    @FocusState private var focused: Bool

    var body: some View {
        NavigationStack {
            VStack(alignment: .leading, spacing: 14) {
                NativeRich.text(model.rich(language.t("groups:modals.delete.body"))).font(.subheadline)
                Text(language.t("groups:modals.delete.confirm")).font(.subheadline).foregroundStyle(.secondary)
                TextField(model.groupName, text: $typed)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                    .focused($focused)
                    .padding(.horizontal, 14)
                    .frame(minHeight: 46)
                    .background(Theme.Colors.subtle, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                    .accessibilityIdentifier("group.deleteName")
                Button(role: .destructive) {
                    Task {
                        if await model.delete() {
                            dismiss()
                            onGone()
                        }
                    }
                } label: {
                    Text(language.t("groups:header.delete")).frame(maxWidth: .infinity)
                }
                .buttonStyle(.borderedProminent)
                .tint(NativeStyle.negative)
                .controlSize(.large)
                .disabled(model.busy || !model.deleteConfirmed(typed))
                .accessibilityIdentifier("group.deleteConfirm")
                Spacer(minLength: 0)
            }
            .padding(20)
            .navigationTitle(language.t("groups:modals.delete.title", ["name": .string(model.groupName)]))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(language.t("common:actions.cancel")) { dismiss() }
                }
            }
        }
        .presentationDetents([.medium])
        .onAppear { focused = true }
    }
}
