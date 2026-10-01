// The Groups tab, after the web's Groups page: "New group" in the bar, the
// invites waiting for an answer (Accept / Decline), then a card per group
// (its picture, name, the avatar stack, "4 members · EUR", and your balance
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
    @Environment(AppLanguage.self) private var language
    @State private var path: [GroupsRoute] = []

    var body: some View {
        NavigationStack(path: $path) {
            ScrollView {
                VStack(alignment: .leading, spacing: Theme.Space.s4) {
                    if let message = model.message {
                        Note(text: message, tone: Theme.Colors.negative)
                    }
                    switch model.state {
                    case .loading:
                        Panel { ProgressView().frame(maxWidth: .infinity, minHeight: 120) }
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
                .padding(Theme.Space.s4)
            }
            .refreshable { await model.load() }
            .background(Theme.Colors.canvas.ignoresSafeArea())
            .navigationTitle(language.t("groups:title"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .primaryAction) {
                    AddButton(label: language.t("groups:list.newGroup")) { path.append(.newGroup) }
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
                    VStack(alignment: .leading, spacing: 2) {
                        Text(invite.name)
                            .font(Theme.Fonts.body(15, weight: .semibold, lang: language.current))
                            .foregroundStyle(Theme.Colors.textPrimary)
                        Text(invite.text)
                            .font(Theme.Fonts.body(12, lang: language.current))
                            .foregroundStyle(Theme.Colors.textMuted)
                    }
                }
                HStack(spacing: Theme.Space.s2) {
                    Spacer()
                    Button {
                        Task { if let id = await model.respond(invite, accept: true) { path.append(.group(id)) } }
                    } label: {
                        Label(language.t("groups:actions.accept"), systemImage: "checkmark")
                            .padding(.horizontal, Theme.Space.s3)
                    }
                    .buttonStyle(PrimaryButtonStyle())
                    .fixedSize()
                    Button {
                        Task { _ = await model.respond(invite, accept: false) }
                    } label: {
                        Label(language.t("groups:actions.decline"), systemImage: "xmark")
                            .font(Theme.Fonts.body(15, weight: .semibold, lang: language.current))
                            .foregroundStyle(Theme.Colors.textPrimary)
                            .padding(.horizontal, Theme.Space.s3)
                            .frame(minHeight: 44)
                    }
                    .disabled(model.busy)
                }
            }
        }
        .overlay(RoundedRectangle(cornerRadius: Theme.Radius.xxl, style: .continuous)
            .stroke(Theme.Palette.brand100, lineWidth: 1))
    }

    private var empty: some View {
        Panel {
            VStack(spacing: Theme.Space.s3) {
                IconTile(systemName: "person.2", size: 48, tone: Theme.Colors.accentFg)
                Text(language.t("groups:list.empty.title"))
                    .font(Theme.Fonts.heading(18, weight: .semibold, lang: language.current))
                    .foregroundStyle(Theme.Colors.textPrimary)
                Text(language.t("groups:list.empty.text"))
                    .font(Theme.Fonts.body(14, lang: language.current))
                    .foregroundStyle(Theme.Colors.textMuted)
                    .multilineTextAlignment(.center)
                Button { path.append(.newGroup) } label: {
                    Label(language.t("groups:list.empty.action"), systemImage: "plus")
                }
                .buttonStyle(PrimaryButtonStyle())
            }
            .frame(maxWidth: .infinity)
        }
    }
}

/// A group's card on the list (Groups.jsx): picture, name, the avatars and
/// "4 members · EUR", your balance in its tone, a chevron.
struct GroupCardView: View {
    let card: GroupCard
    @Environment(AppLanguage.self) private var language

    var body: some View {
        Panel {
            HStack(spacing: Theme.Space.s3) {
                GroupMark(imageUrl: card.imageUrl, size: 44)
                VStack(alignment: .leading, spacing: Theme.Space.s1) {
                    Text(card.name)
                        .font(Theme.Fonts.heading(16, weight: .bold, lang: language.current))
                        .foregroundStyle(Theme.Colors.textPrimary)
                        .multilineTextAlignment(.leading)
                    HStack(spacing: Theme.Space.s2) {
                        if let avatars = card.avatars { AvatarStackView(stack: avatars) }
                        // As on a phone: the currency only when there's no avatar stack.
                        Text(card.avatars == nil ? "\(card.members) · \(card.currency)" : card.members)
                            .font(Theme.Fonts.body(12, lang: language.current))
                            .foregroundStyle(Theme.Colors.textMuted)
                            .lineLimit(1)
                            .fixedSize()
                    }
                }
                Spacer(minLength: Theme.Space.s2)
                if let balance = card.balance {
                    VStack(alignment: .trailing, spacing: 1) {
                        Text(balance.label)
                            .font(Theme.Fonts.body(12, weight: .semibold, lang: language.current))
                        if let amount = balance.amount {
                            Text(amount).font(Theme.Fonts.body(14, weight: .bold, lang: language.current))
                        }
                    }
                    .foregroundStyle(toneColor(balance.tone))
                    .lineLimit(1)
                }
                Image(systemName: "chevron.right")
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(Theme.Colors.textMuted)
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
    @State private var name = ""
    @State private var currency = ""

    var body: some View {
        ScrollView {
            VStack(spacing: Theme.Space.s4) {
                if let message = model.message { Note(text: message, tone: Theme.Colors.negative) }
                Panel {
                    VStack(alignment: .leading, spacing: Theme.Space.s4) {
                        FormRow(label: language.t("groups:create.name") + " *") {
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
            .padding(Theme.Space.s4)
        }
        .background(Theme.Colors.canvas.ignoresSafeArea())
        .navigationTitle(language.t("groups:create.title"))
        .navigationBarTitleDisplayMode(.inline)
    }
}

/// A currency dropdown (CurrencySelect) in the field's look.
struct CurrencyMenu: View {
    let label: String
    let options: [String]
    let value: String
    let onPick: (String) -> Void

    var body: some View {
        Menu {
            Picker(label, selection: Binding(get: { value }, set: onPick)) {
                ForEach(options, id: \.self) { Text($0).tag($0) }
            }
        } label: {
            HStack {
                Text(value)
                Spacer(minLength: 0)
                Image(systemName: "chevron.up.chevron.down").font(.system(size: 11))
            }
            .fieldStyle()
        }
        .accessibilityLabel(label)
    }
}
