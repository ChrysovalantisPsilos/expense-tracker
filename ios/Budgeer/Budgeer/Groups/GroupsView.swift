// The Groups tab, after the web's Groups page: "Groups" with New group,
// the invites waiting for an answer (Accept / Decline), then a card per
// group (its picture, name, the avatar stack, "4 members", and your balance
// in it), or the empty state. A card opens the group's page; New group opens
// its form (a name and a currency), which lands in the new group.
import SwiftUI

/// A page the Groups tab pushes.
enum GroupsRoute: Hashable {
    case group(String)
    case newGroup
}

@MainActor
struct GroupsView: View {
    @Bindable var model: GroupsModel
    /// What a group's page needs: the data layer, live refresh, the site its invite links open on.
    let data: DataLayer
    let live: LiveHub
    let site: String
    /// The tab's stack (the frame's: a notification can open a group).
    @Binding var path: [GroupsRoute]
    @Environment(AppLanguage.self) private var language

    var body: some View {
        NavigationStack(path: $path) {
            Page(refresh: { await model.load() }) {
                PageHeader(title: language.t("groups:title")) {
                    PageAction(icon: .plus, label: language.t("groups:list.newGroup")) { path.append(.newGroup) }
                        .accessibilityIdentifier("groups.new")
                }
                if let message = model.message {
                    Note(text: message, tone: Theme.Colors.negative, size: 14)
                }
                switch model.state {
                case .loading:
                    Panel { SkeletonRows(count: 3) }
                case .failed(let message):
                    Panel { LoadErrorBlock(message: message) { await model.load() } }
                case .loaded(let figures):
                    ForEach(figures.invites) { invite in inviteCard(invite) }
                    if figures.cards.isEmpty {
                        empty
                    } else {
                        ForEach(figures.cards) { card in
                            NavigationLink(value: GroupsRoute.group(card.id)) { GroupCardView(card: card) }
                                .buttonStyle(.plain)
                                .accessibilityIdentifier("groups.card.\(card.id)")
                        }
                    }
                }
            }
            .navigationDestination(for: GroupsRoute.self) { route in
                switch route {
                case .group(let id):
                    GroupPageHost(groupId: id, userId: model.userId, data: data, live: live, site: site) {
                        path.removeAll()
                        Task { await model.load() }
                    }
                case .newGroup:
                    NewGroupView(model: model) { id in path = [.group(id)] }
                }
            }
        }
        .task(id: language.current) { await model.load() }
    }

    private func inviteCard(_ invite: InviteRow) -> some View {
        Panel {
            VStack(alignment: .leading, spacing: Theme.Space.s3) {
                HStack(spacing: Theme.Space.s3) {
                    GroupMark(size: 40)
                    VStack(alignment: .leading, spacing: 0) {
                        Text(invite.name).kitText(16, .semibold)
                        Text(invite.text).kitText(12, color: Theme.Colors.textMuted)
                    }
                }
                HStack(spacing: Theme.Space.s2) {
                    Spacer()
                    Button {
                        Task { if let id = await model.respond(invite, accept: true) { path.append(.group(id)) } }
                    } label: {
                        IconLabel(text: language.t("groups:actions.accept"), icon: .check)
                    }
                    .buttonStyle(.kit(.solid, .sm))
                    Button {
                        Task { _ = await model.respond(invite, accept: false) }
                    } label: {
                        IconLabel(text: language.t("groups:actions.decline"), icon: .x)
                    }
                    .buttonStyle(.kit(.ghost, .sm))
                    .disabled(model.busy)
                }
            }
        }
        .overlay(RoundedRectangle(cornerRadius: Theme.Radius.xxl, style: .continuous)
            .stroke(Theme.Palette.brand100, lineWidth: 1))
    }

    private var empty: some View {
        Panel {
            EmptyStateBlock(icon: .users, title: language.t("groups:list.empty.title"), text: language.t("groups:list.empty.text")) {
                Button { path.append(.newGroup) } label: {
                    IconLabel(text: language.t("groups:list.empty.action"), icon: .plus)
                }
                .buttonStyle(.kit(.solid, .md))
            }
        }
    }
}

/// A group's card on the list (Groups.jsx): picture, name, the avatars and
/// "4 members", your balance in its tone, a chevron.
struct GroupCardView: View {
    let card: GroupCard

    var body: some View {
        Panel {
            HStack(spacing: Theme.Space.s3) {
                GroupMark(imageUrl: card.imageUrl, size: 44)
                VStack(alignment: .leading, spacing: Theme.Space.s1) {
                    Text(card.name)
                        .kitHeading(18)
                        .multilineTextAlignment(.leading)
                    HStack(spacing: Theme.Space.s2) {
                        if let avatars = card.avatars { AvatarStackView(stack: avatars) }
                        // As on a phone: the currency only when there's no avatar stack.
                        Text(card.avatars == nil ? "\(card.members) · \(card.currency)" : card.members)
                            .kitText(12, color: Theme.Colors.textMuted)
                            .lineLimit(1)
                            .fixedSize()
                    }
                }
                Spacer(minLength: Theme.Space.s2)
                if let balance = card.balance {
                    VStack(alignment: .trailing, spacing: 1) {
                        Text(balance.label).kitText(12, .semibold, color: toneColor(balance.tone))
                        if let amount = balance.amount {
                            Text(amount).kitText(14, .bold, color: toneColor(balance.tone))
                        }
                    }
                    .lineLimit(1)
                }
                LucideIcon(icon: .chevronRight, size: 18).foregroundStyle(Theme.Colors.textMuted)
            }
        }
        .accessibilityElement(children: .combine)
    }
}

/// /groups/new: a name and the group's currency (the base currency to start).
struct NewGroupView: View {
    let model: GroupsModel
    let onCreated: (String) -> Void
    @Environment(AppLanguage.self) private var language
    @Environment(\.dismiss) private var dismiss
    @State private var name = ""
    @State private var currency = ""

    var body: some View {
        Page {
            PageHeader(title: language.t("groups:create.title"), eyebrow: language.t("groups:title"), back: { dismiss() })
            if let message = model.message { Note(text: message, tone: Theme.Colors.negative, size: 14) }
            Panel {
                VStack(alignment: .leading, spacing: Theme.Space.s5) {
                    FormRow(label: language.t("groups:create.name"), required: true) {
                        TextField(language.t("groups:create.nameHint"), text: $name)
                            .fieldStyle()
                            .accessibilityIdentifier("groups.newName")
                    }
                    FormRow(label: language.t("groups:create.currency")) {
                        CurrencyMenu(label: language.t("groups:create.currency"), options: model.currencyOptions,
                                     value: currency.isEmpty ? model.baseCurrency : currency) { currency = $0 }
                    }
                }
            }
            Button {
                Task {
                    if let id = await model.create(name: name, currency: currency.isEmpty ? model.baseCurrency : currency) {
                        onCreated(id)
                    }
                }
            } label: {
                if model.busy { ProgressView().tint(Theme.Colors.onAccent) } else { Text(language.t("groups:create.submit")) }
            }
            .buttonStyle(PrimaryButtonStyle())
            .disabled(model.busy || name.trimmingCharacters(in: .whitespaces).isEmpty)
        }
    }
}

/// A currency dropdown (CurrencySelect): the Select with the codes.
struct CurrencyMenu: View {
    let label: String
    let options: [String]
    let value: String
    let onPick: (String) -> Void

    var body: some View {
        SelectMenu(options: options.map { ($0, $0) }, value: value, label: label, pick: onPick)
    }
}
