// Beside the sidebar, Groups is a list beside the group picked in it: the
// invites waiting for an answer (InviteBanner), then a row per group (its
// picture, name, members and your balance as its chip, as the tab's cards
// show them), the picked one lit; New group and Join with a link under
// them. A row picks its group (its page opens beside the list); New group
// and Join open their pages there. Every word is GroupsModel's (the core's).
import SwiftUI

@MainActor
struct GroupListColumn: View {
    let model: GroupsModel
    /// The group shown beside the list, nil for none.
    let picked: String?
    let pick: (String) -> Void
    /// New group or Join with a link, beside the list.
    let open: (AppRoute) -> Void
    @Environment(AppLanguage.self) private var language

    var body: some View {
        List {
            if let message = model.message {
                NativeNotice(text: message, warning: true).listRowBackground(Color.clear)
            }
            switch model.state {
            case .loading:
                NativeLoading().listRowBackground(Color.clear).listRowSeparator(.hidden)
            case .failed(let message):
                NativeFailed(message: message) { await model.load() }
                    .listRowBackground(Color.clear)
                    .listRowSeparator(.hidden)
            case .loaded(let figures):
                ForEach(figures.invites) { invite in
                    InviteBanner(invite: invite, model: model)
                        .listRowInsets(EdgeInsets(top: 6, leading: 0, bottom: 6, trailing: 0))
                        .listRowBackground(Color.clear)
                        .listRowSeparator(.hidden)
                }
                Section {
                    ForEach(figures.cards) { card in
                        Button { pick(card.id) } label: { GroupListRow(card: card) }
                            .buttonStyle(.plain)
                            .listRowBackground(picked == card.id ? Theme.Colors.accentSubtle : NativeStyle.card)
                            .accessibilityAddTraits(picked == card.id ? .isSelected : [])
                            .accessibilityIdentifier("groups.row.\(card.id)")
                    }
                }
                Section {
                    Button { open(.newGroup) } label: {
                        Label(language.t("groups:list.newGroup"), systemImage: "plus.circle.fill")
                    }
                    .accessibilityIdentifier("groups.new")
                    Button { open(.join(nil)) } label: {
                        Label(language.t("ios:native.join.entry"), systemImage: "link")
                    }
                    .accessibilityIdentifier("groups.join")
                }
                .foregroundStyle(NativeStyle.tint)
                .listRowBackground(NativeStyle.card)
            }
        }
        .listStyle(.insetGrouped)
        .scrollContentBackground(.hidden)
        .background(NativeStyle.canvas)
        .navigationTitle(language.t("groups:title"))
        .refreshable { await model.load() }
        .task(id: language.current) { await model.load() }
    }
}

/// A group in the list: its picture, name and members, your balance's chip.
struct GroupListRow: View {
    let card: GroupCard

    var body: some View {
        HStack(spacing: 12) {
            GroupCover(card: card, letters: 18, lift: 0)
                .frame(width: 50, height: 50)
                .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
            VStack(alignment: .leading, spacing: 3) {
                Text(card.name).font(.body.weight(.semibold)).lineLimit(2)
                Text(card.members).font(.footnote).foregroundStyle(.secondary).lineLimit(1)
            }
            Spacer(minLength: 8)
            if let balance = card.balance { BalanceChip(balance: balance) }
        }
        .padding(.vertical, 4)
        .contentShape(Rectangle())
        .accessibilityElement(children: .combine)
    }
}
