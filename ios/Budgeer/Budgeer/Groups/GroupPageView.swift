// A group's page, after the web's GroupDetail: the header (the picture, the
// name over the avatars and "4 members", which open Members, and the
// group's Total), the balances card (your balance with Settle up, everyone's
// tiles, the line that matters most), "Who owes whom", and the history in
// three tabs (expenses, settlements, activity). Add expense and the ⋯ menu
// (Share summary, Rename, Leave, Delete) sit in the bar. Its pages (an
// expense, settle up, members, comments, rename) are pushed from here. Live:
// a change to the group's tables refreshes it.
import SwiftUI

/// A page a group's page pushes.
enum GroupPage: Hashable {
    case expense(String?)
    case settle
    case members
    case comments(String)
    case rename
}

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
                GroupPageView(model: model, live: live, onGone: onGone)
                    .liveRefresh(live, tables: LiveHub.shared) { await model.load() }
            } else {
                LoadingView()
            }
        }
        .onAppear {
            if model == nil {
                model = GroupModel(groupId: groupId, userId: userId, site: site, data: data)
            }
        }
    }
}

@MainActor
struct GroupPageView: View {
    @Bindable var model: GroupModel
    let live: LiveHub
    var onGone: () -> Void = {}
    @Environment(AppLanguage.self) private var language
    @State private var confirmLeave = false
    @State private var confirmDelete = false
    @State private var typedName = ""
    @State private var blocked = false
    @State private var path: GroupPage?

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: Theme.Space.s4) {
                switch model.state {
                case .loading:
                    Panel { ProgressView().frame(maxWidth: .infinity, minHeight: 160) }
                case .failed(let message):
                    Panel { LoadErrorBlock(message: message) { await model.load() } }
                case .loaded(let figures):
                    if let message = model.message { Note(text: message, tone: Theme.Colors.textPrimary) }
                    header(figures)
                    BalancesCard(parts: figures.balances, onSettle: figures.myMemberId == nil ? nil : { path = .settle })
                    if !figures.balances.plan.isEmpty { whoOwes(figures.balances) }
                    HistoryCard(model: model, figures: figures, open: { path = $0 })
                }
            }
            .padding(Theme.Space.s4)
        }
        .refreshable { await model.load() }
        .background(Theme.Colors.canvas.ignoresSafeArea())
        .navigationTitle(model.groupName)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar { toolbar }
        .navigationDestination(item: $path) { page in destination(page) }
        .task(id: language.current) { await model.load() }
        .confirmationDialog(language.t("groups:modals.leave.title", ["name": .string(model.groupName)]),
                            isPresented: $confirmLeave, titleVisibility: .visible) {
            Button(language.t("groups:modals.leave.confirm"), role: .destructive) { leave(silent: false) }
            Button(language.t("groups:modals.leave.silent"), role: .destructive) { leave(silent: true) }
            Button(language.t("common:actions.cancel"), role: .cancel) {}
        } message: {
            Text(language.t(model.figures?.isOwner == true ? "groups:modals.leave.bodyOwner" : "groups:modals.leave.body"))
        }
        .alert(language.t("groups:modals.delete.title", ["name": .string(model.groupName)]), isPresented: $confirmDelete) {
            TextField(model.groupName, text: $typedName)
            Button(language.t("groups:header.delete"), role: .destructive) {
                Task { if await model.delete() { onGone() } }
            }
            .disabled(!model.deleteConfirmed(typedName))
            Button(language.t("common:actions.cancel"), role: .cancel) {}
        } message: {
            RichText.text(model.rich(language.t("groups:modals.delete.body")))
                + Text("\n\n" + language.t("groups:modals.delete.confirm"))
        }
        .alert(language.t("groups:modals.deleteBlocked.title", ["name": .string(model.groupName)]), isPresented: $blocked) {
            Button(language.t("groups:modals.deleteBlocked.manage")) { path = .members }
            Button(language.t("common:actions.close"), role: .cancel) {}
        } message: {
            Text(language.t("groups:modals.deleteBlocked.body")) + Text("\n\n")
                + RichText.text(model.rich(language.t("groups:modals.deleteBlocked.stillIn",
                                                      ["names": .string(model.figures?.stillIn ?? "")])))
        }
    }

    // MARK: Header

    private func header(_ figures: GroupPageFigures) -> some View {
        HStack(spacing: Theme.Space.s3) {
            GroupMark(imageUrl: figures.imageUrl, size: 48)
            VStack(alignment: .leading, spacing: Theme.Space.s1) {
                Text(figures.name)
                    .font(Theme.Fonts.heading(22, weight: .bold, lang: language.current))
                    .kerning(-0.44)
                    .foregroundStyle(Theme.Colors.textPrimary)
                    .lineLimit(2)
                    .minimumScaleFactor(0.8)
                Button { path = .members } label: {
                    HStack(spacing: Theme.Space.s2) {
                        AvatarStackView(stack: figures.avatars, ring: Theme.Colors.canvas)
                        Text(figures.members)
                            .font(Theme.Fonts.body(14, weight: .semibold, lang: language.current))
                            .foregroundStyle(Theme.Colors.textMuted)
                            .lineLimit(1)
                            .fixedSize()
                    }
                }
                .buttonStyle(.plain)
                .accessibilityLabel(language.t("groups:header.showMembers", ["members": .string(figures.members)]))
                .accessibilityIdentifier("group.members")
            }
            Spacer(minLength: Theme.Space.s2)
            VStack(alignment: .trailing, spacing: 2) {
                Text(language.t("groups:total"))
                    .font(Theme.Fonts.body(12, lang: language.current))
                    .foregroundStyle(Theme.Colors.textMuted)
                Text(figures.total)
                    .font(Theme.Fonts.heading(22, weight: .bold, lang: language.current))
                    .foregroundStyle(Theme.Colors.textPrimary)
                    .lineLimit(1)
                    .minimumScaleFactor(0.6)
            }
            .accessibilityElement(children: .combine)
        }
    }

    @ToolbarContentBuilder private var toolbar: some ToolbarContent {
        ToolbarItem(placement: .primaryAction) {
            HStack(spacing: Theme.Space.s3) {
                if model.figures?.myMemberId != nil {
                    AddButton(label: language.t("groups:header.addExpense")) { path = .expense(nil) }
                }
                Menu {
                    if let text = model.figures?.shareText {
                        ShareLink(item: text, subject: Text(model.groupName)) {
                            Label(language.t("groups:header.shareSummary"), systemImage: "square.and.arrow.up")
                        }
                    }
                    if model.figures?.isOwner == true {
                        Button { path = .rename } label: { Label(language.t("groups:header.rename"), systemImage: "pencil") }
                    }
                    if model.figures?.myMemberId != nil {
                        Button { confirmLeave = true } label: {
                            Label(language.t("groups:header.leave"), systemImage: "rectangle.portrait.and.arrow.right")
                        }
                    }
                    if model.figures?.isOwner == true {
                        Button(role: .destructive) {
                            typedName = ""
                            if model.figures?.canDelete == true { confirmDelete = true } else { blocked = true }
                        } label: { Label(language.t("groups:header.delete"), systemImage: "trash") }
                    }
                } label: {
                    Image(systemName: "ellipsis")
                        .font(.system(size: 16, weight: .semibold))
                        .foregroundStyle(Theme.Colors.textPrimary)
                        .frame(width: 32, height: 32)
                }
                .accessibilityLabel(language.t("groups:header.options"))
            }
        }
    }

    // MARK: Who owes whom

    private func whoOwes(_ parts: BalancesParts) -> some View {
        Panel {
            VStack(alignment: .leading, spacing: Theme.Space.s3) {
                CardHeader(title: language.t("groups:balances.whoOwes"), icon: "arrow.left.arrow.right",
                           subtitle: parts.planSubtitle)
                ForEach(parts.plan) { row in TransferRowView(row: row) }
            }
        }
    }

    // MARK: Pages

    @ViewBuilder private func destination(_ page: GroupPage) -> some View {
        switch page {
        case .expense(let id):
            ModelHost(make: { model.expenseForm(expenseId: id) }) { form in
                GroupExpenseView(model: form) { toast in
                    path = nil
                    model.note(toast?.title)
                    Task { await model.load() }
                }
            } missing: { EmptyView() }
        case .settle:
            ModelHost(make: { model.settleUp() }) { settle in
                SettleUpView(model: settle) {
                    path = nil
                    model.note(language.t("groups:settle.recorded"))
                    Task { await model.load() }
                }
            } missing: {
                Panel { Note(text: language.t("groups:settle.onlyMembers")) }.padding(Theme.Space.s4)
            }
        case .members:
            MembersView(model: model)
        case .comments(let id):
            ModelHost(make: { model.comments(itemId: id) }) { comments in
                CommentsView(model: comments)
                    .liveRefresh(live, tables: ["group_comments"]) { await comments.load() }
            } missing: {
                Panel { Note(text: language.t("groups:comments.gone")) }.padding(Theme.Space.s4)
            }
        case .rename:
            RenameGroupView(model: model) { path = nil }
        }
    }

    private func leave(silent: Bool) {
        Task { if await model.leave(silent: silent) { onGone() } }
    }
}

/// The balances card (GroupBalances): your balance with Settle up,
/// everyone's net in sand tiles, and the line that matters most.
struct BalancesCard: View {
    let parts: BalancesParts
    /// Settle up (nil for someone who isn't in the group).
    let onSettle: (() -> Void)?
    @Environment(AppLanguage.self) private var language

    var body: some View {
        Panel {
            VStack(alignment: .leading, spacing: Theme.Space.s3) {
                HStack(alignment: .center, spacing: Theme.Space.s3) {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(language.t("groups:balances.yours"))
                            .font(Theme.Fonts.body(12, lang: language.current))
                            .foregroundStyle(Theme.Colors.textMuted)
                        Text(parts.mine.text)
                            .font(Theme.Fonts.heading(30, weight: .bold, lang: language.current))
                            .kerning(-0.6)
                            .foregroundStyle(toneColor(parts.mine.tone))
                            .lineLimit(1)
                            .minimumScaleFactor(0.6)
                            .accessibilityIdentifier("group.mine")
                    }
                    Spacer(minLength: Theme.Space.s2)
                    if let onSettle {
                        Button(action: onSettle) {
                            Label(language.t("groups:balances.settleUp"), systemImage: "banknote")
                                .font(Theme.Fonts.body(14, weight: .semibold, lang: language.current))
                                .foregroundStyle(Theme.Colors.textPrimary)
                                .padding(.horizontal, Theme.Space.s3)
                                .frame(minHeight: 36)
                                .overlay(RoundedRectangle(cornerRadius: Theme.Radius.lg, style: .continuous)
                                    .stroke(Theme.Colors.border, lineWidth: 1))
                        }
                        .buttonStyle(.plain)
                        .accessibilityIdentifier("group.settle")
                    }
                }
                if !parts.tiles.isEmpty {
                    SectionLabel(text: language.t("groups:balances.title")).padding(.top, Theme.Space.s1)
                    LazyVGrid(columns: [GridItem(.flexible(), spacing: Theme.Space.s2), GridItem(.flexible())],
                              spacing: Theme.Space.s2) {
                        ForEach(parts.tiles) { tile in
                            VStack(alignment: .leading, spacing: 2) {
                                Text(tile.label)
                                    .font(Theme.Fonts.body(12, lang: language.current))
                                    .foregroundStyle(Theme.Colors.textMuted)
                                    .lineLimit(1)
                                Text(tile.text)
                                    .font(Theme.Fonts.body(14, weight: .bold, lang: language.current))
                                    .foregroundStyle(toneColor(tile.tone))
                                    .lineLimit(1)
                            }
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .padding(.horizontal, Theme.Space.s3)
                            .padding(.vertical, Theme.Space.s2)
                            .background(Theme.Colors.subtle)
                            .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.lg, style: .continuous))
                            .accessibilityElement(children: .combine)
                        }
                    }
                }
                HighlightPill(text: parts.highlight.text, amount: parts.highlight.amount, tone: parts.highlight.tone)
            }
        }
    }
}

/// The history (GroupHistory): Expenses | Settlements | Activity.
struct HistoryCard: View {
    @Bindable var model: GroupModel
    let figures: GroupPageFigures
    let open: (GroupPage) -> Void
    @Environment(AppLanguage.self) private var language

    var body: some View {
        Panel {
            VStack(alignment: .leading, spacing: Theme.Space.s3) {
                Picker(language.t("groups:history.label"), selection: $model.tab) {
                    ForEach(["expenses", "settlements", "activity"], id: \.self) { tab in
                        Text(language.t("groups:history.tabs.\(tab)")).tag(tab)
                    }
                }
                .pickerStyle(.segmented)
                .accessibilityIdentifier("group.tabs")
                switch model.tab {
                case "settlements": settlements
                case "activity": activity
                default: expenses
                }
            }
        }
    }

    @ViewBuilder private var expenses: some View {
        if figures.expenses.isEmpty {
            VStack(spacing: Theme.Space.s3) {
                IconTile(systemName: "doc.text", size: 48, tone: Theme.Colors.accentFg)
                Text(language.t("groups:history.empty.title"))
                    .font(Theme.Fonts.heading(17, weight: .semibold, lang: language.current))
                    .foregroundStyle(Theme.Colors.textPrimary)
                Text(language.t("groups:history.empty.text"))
                    .font(Theme.Fonts.body(14, lang: language.current))
                    .foregroundStyle(Theme.Colors.textMuted)
                    .multilineTextAlignment(.center)
                if figures.myMemberId != nil {
                    Button { open(.expense(nil)) } label: { Label(language.t("groups:history.empty.add"), systemImage: "plus") }
                        .buttonStyle(PrimaryButtonStyle())
                }
                if figures.memberRows.count < 2 {
                    Button { open(.members) } label: {
                        Label(language.t("groups:history.empty.invite"), systemImage: "person.badge.plus")
                    }
                    .buttonStyle(OutlineButtonStyle())
                }
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, Theme.Space.s2)
        } else {
            VStack(spacing: 0) {
                ForEach(figures.expenses) { row in
                    HStack(spacing: 0) {
                        Button { if row.canEdit { open(.expense(row.id)) } } label: {
                            // On a phone the line leaves out what goes without saying (`phone: false`).
                            GroupItemRow(icon: "doc.text", title: row.title,
                                         meta: row.meta.filter(\.phone).map(\.text).joined(separator: " · "),
                                         amount: row.amount, amountMeta: row.amountMeta) { EmptyView() }
                        }
                        .buttonStyle(.plain)
                        .disabled(!row.canEdit)
                        CommentCount(count: row.comments, label: language.t("groups:history.comments")) {
                            open(.comments(row.id))
                        }
                    }
                    .accessibilityIdentifier("group.expense.\(row.id)")
                }
            }
        }
    }

    @ViewBuilder private var settlements: some View {
        if figures.settlements.isEmpty {
            Note(text: language.t("groups:history.noSettlements"))
        } else {
            VStack(spacing: 0) {
                ForEach(figures.settlements) { row in
                    HStack(spacing: 0) {
                        GroupItemRow(icon: "banknote", title: row.title, meta: row.meta, amount: row.amount) { EmptyView() }
                        CommentCount(count: row.comments, label: language.t("groups:history.comments")) {
                            open(.comments(row.id))
                        }
                    }
                }
            }
        }
    }

    @ViewBuilder private var activity: some View {
        if figures.activity.isEmpty {
            Note(text: language.t("groups:history.noActivity"))
        } else {
            VStack(spacing: 0) {
                ForEach(figures.activity) { row in
                    HStack(alignment: .top, spacing: Theme.Space.s3) {
                        VStack(alignment: .leading, spacing: 2) {
                            Text(row.text)
                                .font(Theme.Fonts.body(14, lang: language.current))
                                .foregroundStyle(Theme.Colors.textPrimary)
                                .fixedSize(horizontal: false, vertical: true)
                            Text(row.when)
                                .font(Theme.Fonts.body(12, lang: language.current))
                                .foregroundStyle(Theme.Colors.textMuted)
                        }
                        Spacer(minLength: Theme.Space.s2)
                        if let amount = row.amount {
                            Text(amount)
                                .font(Theme.Fonts.body(14, weight: .bold, lang: language.current))
                                .foregroundStyle(Theme.Colors.textPrimary)
                        }
                    }
                    .padding(.vertical, Theme.Space.s2)
                }
            }
        }
    }
}

/// /groups/:id/edit: the owner renames the group.
struct RenameGroupView: View {
    let model: GroupModel
    let onDone: () -> Void
    @Environment(AppLanguage.self) private var language
    @State private var name = ""

    var body: some View {
        ScrollView {
            VStack(spacing: Theme.Space.s4) {
                if let message = model.message { Note(text: message, tone: Theme.Colors.negative) }
                Panel {
                    FormRow(label: language.t("groups:edit.name") + " *") {
                        TextField("", text: $name).fieldStyle()
                    }
                }
                Button {
                    Task { if await model.rename(name) { onDone() } }
                } label: { Text(language.t("common:actions.save")) }
                    .buttonStyle(PrimaryButtonStyle())
                    .disabled(model.busy || name.trimmingCharacters(in: .whitespaces).isEmpty)
            }
            .padding(Theme.Space.s4)
        }
        .background(Theme.Colors.canvas.ignoresSafeArea())
        .navigationTitle(language.t("groups:edit.title"))
        .navigationBarTitleDisplayMode(.inline)
        .onAppear { if name.isEmpty { name = model.groupName } }
    }
}
