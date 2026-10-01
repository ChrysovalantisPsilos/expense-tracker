// A group's page, after the web's GroupDetail: the header (the picture, the
// name over the avatars and "4 members", which open Members, and the
// group's Total), the balances card (your balance with Settle up, everyone's
// tiles, the line that matters most), "Who owes whom", and the history in
// three tabs (expenses, settlements, activity). The back arrow, Add expense
// and the ⋮ menu (Share summary, Rename, Leave, Delete) open the page, as on
// the web. Its pages (an
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
    @Environment(\.dismiss) private var dismiss
    @State private var confirmLeave = false
    @State private var confirmDelete = false
    @State private var typedName = ""
    @State private var blocked = false
    @State private var path: GroupPage?

    var body: some View {
        Page(refresh: { await model.load() }) {
            topBar
            switch model.state {
            case .loading:
                Panel { SkeletonRows(count: 4) }
            case .failed(let message):
                Panel { LoadErrorBlock(message: message) { await model.load() } }
            case .loaded(let figures):
                if let message = model.message { Note(text: message, tone: Theme.Colors.textPrimary, size: 14) }
                header(figures)
                BalancesCard(parts: figures.balances, onSettle: figures.myMemberId == nil ? nil : { path = .settle })
                if !figures.balances.plan.isEmpty { whoOwes(figures.balances) }
                HistoryCard(model: model, figures: figures, open: { path = $0 })
            }
        }
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
                    .kitHeading(22, tracking: -0.02)
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
                Text(language.t("groups:total")).kitText(12, color: Theme.Colors.textMuted)
                Text(figures.total)
                    .kitHeading(24, tracking: 0)
                    .lineLimit(1)
                    .minimumScaleFactor(0.6)
            }
            .accessibilityElement(children: .combine)
        }
    }

    /// The page's first row (GroupHeader): back, then Add expense and the ⋮ menu.
    private var topBar: some View {
        HStack(spacing: 14) {
            Button { dismiss() } label: {
                LucideIcon(icon: .arrowLeft, size: 18)
                    .foregroundStyle(Theme.Colors.textMuted)
                    .frame(width: 44, height: 44)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .padding(.leading, -12)
            .accessibilityLabel(language.t("common:actions.back"))
            Spacer()
            if model.figures?.myMemberId != nil {
                PageAction(icon: .plus, label: language.t("groups:header.addExpense")) { path = .expense(nil) }
                    .accessibilityIdentifier("group.add")
            }
            Menu {
                if let text = model.figures?.shareText {
                    ShareLink(item: text, subject: Text(model.groupName)) {
                        Label { Text(language.t("groups:header.shareSummary")) } icon: { Image(Lucide.share2.rawValue) }
                    }
                }
                if model.figures?.isOwner == true {
                    Button { path = .rename } label: {
                        Label { Text(language.t("groups:header.rename")) } icon: { Image(Lucide.pencil.rawValue) }
                    }
                }
                if model.figures?.myMemberId != nil {
                    Button { confirmLeave = true } label: {
                        Label { Text(language.t("groups:header.leave")) } icon: { Image(Lucide.logOut.rawValue) }
                    }
                }
                if model.figures?.isOwner == true {
                    Button(role: .destructive) {
                        typedName = ""
                        if model.figures?.canDelete == true { confirmDelete = true } else { blocked = true }
                    } label: {
                        Label { Text(language.t("groups:header.delete")) } icon: { Image(Lucide.trash2.rawValue) }
                    }
                }
            } label: {
                LucideIcon(icon: .moreVertical, size: 18)
                    .foregroundStyle(Theme.Colors.textMuted)
                    .frame(width: 32, height: 32)
                    .frame(width: 44, height: 44)
                    .contentShape(Rectangle())
            }
            .padding(.trailing, -6)
            .accessibilityLabel(language.t("groups:header.options"))
        }
        .padding(.vertical, -6)
    }

    // MARK: Who owes whom

    private func whoOwes(_ parts: BalancesParts) -> some View {
        Panel(title: language.t("groups:balances.whoOwes"), icon: .arrowLeftRight, subtitle: parts.planSubtitle) {
            VStack(alignment: .leading, spacing: Theme.Space.s2) {
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
                SettleUpView(model: settle, onDone: {
                    path = nil
                    model.note(language.t("groups:settle.recorded"))
                    Task { await model.load() }
                }, groupName: model.groupName)
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
                    Figure(label: language.t("groups:balances.yours"), value: parts.mine.text,
                           tone: Tone(name: parts.mine.tone), size: .xl)
                        .accessibilityIdentifier("group.mine")
                    Spacer(minLength: Theme.Space.s2)
                    if let onSettle {
                        Button(action: onSettle) {
                            IconLabel(text: language.t("groups:balances.settleUp"), icon: .handCoins)
                        }
                        .buttonStyle(.kit(.outline, .sm))
                        .accessibilityIdentifier("group.settle")
                    }
                }
                if !parts.tiles.isEmpty {
                    SectionLabel(text: language.t("groups:balances.title")).padding(.top, Theme.Space.s1)
                    LazyVGrid(columns: [GridItem(.flexible(), spacing: Theme.Space.s2), GridItem(.flexible())],
                              spacing: Theme.Space.s2) {
                        ForEach(parts.tiles) { tile in
                            BalanceTile(label: tile.label, value: tile.text, tone: Tone(name: tile.tone))
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
                SegmentedControl(options: ["expenses", "settlements", "activity"].map { ($0, language.t("groups:history.tabs.\($0)")) },
                                 value: model.tab) { model.tab = $0 }
                    .accessibilityLabel(language.t("groups:history.label"))
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
            EmptyStateBlock(icon: .receipt, title: language.t("groups:history.empty.title"),
                            text: language.t("groups:history.empty.text")) {
                VStack(spacing: Theme.Space.s2) {
                    if figures.myMemberId != nil {
                        Button { open(.expense(nil)) } label: { IconLabel(text: language.t("groups:history.empty.add"), icon: .plus) }
                            .buttonStyle(.kit(.solid, .md))
                    }
                    if figures.memberRows.count < 2 {
                        Button { open(.members) } label: {
                            IconLabel(text: language.t("groups:history.empty.invite"), icon: .userPlus)
                        }
                        .buttonStyle(.kit(.outline, .md, scheme: .gray))
                    }
                }
            }
        } else {
            VStack(spacing: 0) {
                ForEach(figures.expenses) { row in
                    HStack(spacing: 0) {
                        Button { if row.canEdit { open(.expense(row.id)) } } label: {
                            // On a phone the line leaves out what goes without saying (`phone: false`).
                            GroupItemRow(icon: .receipt, title: row.title,
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
                        GroupItemRow(icon: .handCoins, title: row.title, meta: row.meta, amount: row.amount) { EmptyView() }
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
                            Text(row.text).kitText(14).fixedSize(horizontal: false, vertical: true)
                            Text(row.when).kitText(12, color: Theme.Colors.textMuted)
                        }
                        Spacer(minLength: Theme.Space.s2)
                        if let amount = row.amount {
                            Text(amount).kitText(14, .bold)
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
        Page {
            PageHeader(title: language.t("groups:edit.title"), eyebrow: model.groupName, back: onDone)
            if let message = model.message { Note(text: message, tone: Theme.Colors.negative, size: 14) }
            Panel {
                FormRow(label: language.t("groups:edit.name"), required: true) {
                    TextField("", text: $name).fieldStyle()
                }
            }
            Button {
                Task { if await model.rename(name) { onDone() } }
            } label: { Text(language.t("common:actions.save")) }
                .buttonStyle(PrimaryButtonStyle())
                .disabled(model.busy || name.trimmingCharacters(in: .whitespaces).isEmpty)
        }
        .onAppear { if name.isEmpty { name = model.groupName } }
    }
}
