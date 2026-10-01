// The Groups tab, after the web's Groups page: the invites waiting for an
// answer (Accept / Decline), then a row per group (its picture, name, the
// avatars and "4 members", and your balance in it), New group, or the empty
// state. A row opens the group's page; New group opens its form (a name and
// a currency), which lands in the new group. Every word is GroupsModel's.
import SwiftUI

@MainActor
struct GroupsView: View {
    let model: GroupsModel
    let chrome: PageChrome
    @Environment(AppLanguage.self) private var language

    var body: some View {
        List {
            if let message = model.message {
                Section { NativeNotice(text: message, warning: true) }
            }
            switch model.state {
            case .loading:
                Section { NativeLoading() }.listRowBackground(Color.clear)
            case .failed(let message):
                Section { NativeFailed(message: message) { await model.load() } }.listRowBackground(Color.clear)
            case .loaded(let figures):
                if !figures.invites.isEmpty {
                    Section {
                        ForEach(figures.invites) { invite in inviteRow(invite) }
                    }
                    .listRowBackground(NativeStyle.card)
                }
                if figures.cards.isEmpty {
                    Section {
                        ContentUnavailableView {
                            Label(language.t("groups:list.empty.title"), systemImage: "person.2")
                        } description: {
                            Text(language.t("groups:list.empty.text"))
                        } actions: {
                            NavigationLink(value: AppRoute.newGroup) {
                                Text(language.t("groups:list.empty.action"))
                            }
                            .nativeGlassButton(prominent: true)
                        }
                    }
                    .listRowBackground(Color.clear)
                } else {
                    Section {
                        ForEach(figures.cards) { card in
                            NavigationLink(value: AppRoute.group(card.id)) { GroupRow(card: card) }
                                .accessibilityIdentifier("groups.card.\(card.id)")
                        }
                    }
                    .listRowBackground(NativeStyle.card)
                    Section {
                        NavigationLink(value: AppRoute.newGroup) {
                            Label(language.t("groups:list.newGroup"), systemImage: "plus.circle.fill")
                                .foregroundStyle(NativeStyle.tint)
                        }
                        .accessibilityIdentifier("groups.new")
                    }
                    .listRowBackground(NativeStyle.card)
                }
            }
        }
        .listStyle(.insetGrouped)
        .scrollContentBackground(.hidden)
        .background(NativeStyle.canvas)
        .nativeTabBarRoom()
        .navigationTitle(language.t("groups:title"))
        .pageChrome(chrome)
        .refreshable { await model.load() }
        .task(id: language.current) { await model.load() }
    }

    private func inviteRow(_ invite: InviteRow) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 12) {
                NativeIconTile(symbol: "envelope.open.fill", color: NativeStyle.coral, size: 40)
                VStack(alignment: .leading, spacing: 2) {
                    Text(invite.name).font(.body.weight(.semibold))
                    Text(invite.text).font(.footnote).foregroundStyle(.secondary)
                }
            }
            HStack(spacing: 10) {
                Button(language.t("groups:actions.decline")) {
                    Task { _ = await model.respond(invite, accept: false) }
                }
                .nativeGlassButton()
                Button(language.t("groups:actions.accept")) {
                    Task { _ = await model.respond(invite, accept: true) }
                }
                .nativeGlassButton(prominent: true)
            }
            .disabled(model.busy)
            .frame(maxWidth: .infinity, alignment: .trailing)
        }
        .padding(.vertical, 6)
    }
}

/// A group's row: its picture, name, the avatars and "4 members", your balance in its tone.
struct GroupRow: View {
    let card: GroupCard

    var body: some View {
        HStack(spacing: 12) {
            GroupPicture(imageUrl: card.imageUrl, size: 44)
            VStack(alignment: .leading, spacing: 4) {
                Text(card.name).font(.body.weight(.semibold)).lineLimit(2)
                HStack(spacing: 6) {
                    if let avatars = card.avatars { NativeAvatarStack(stack: avatars, size: 22) }
                    Text(card.avatars == nil ? "\(card.members) · \(card.currency)" : card.members)
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                }
            }
            Spacer(minLength: 8)
            if let balance = card.balance {
                VStack(alignment: .trailing, spacing: 1) {
                    Text(balance.label).font(.caption.weight(.semibold))
                    if let amount = balance.amount {
                        Text(amount).font(.subheadline.weight(.semibold)).monospacedDigit()
                    }
                }
                .foregroundStyle(NativeStyle.tone(balance.tone))
                .lineLimit(1)
                .fixedSize()
            }
        }
        .padding(.vertical, 4)
        .accessibilityElement(children: .combine)
    }
}

/// A group's picture: the owner's photo, or people on the coral tile.
struct GroupPicture: View {
    var imageUrl: String? = nil
    var size: CGFloat = 40

    var body: some View {
        ZStack {
            NativeIconTile(symbol: "person.2.fill", color: NativeStyle.coral, size: size)
            if let imageUrl, let url = URL(string: imageUrl) {
                AsyncImage(url: url) { image in
                    image.resizable().scaledToFill()
                } placeholder: {
                    Color.clear
                }
                .clipShape(RoundedRectangle(cornerRadius: size * 0.24, style: .continuous))
            }
        }
        .frame(width: size, height: size)
        .accessibilityHidden(true)
    }
}

/// /groups/new: a name and the group's currency (the base currency to start).
@MainActor
struct NewGroupView: View {
    let model: GroupsModel
    let onCreated: (String) -> Void
    @Environment(AppLanguage.self) private var language
    @State private var name = ""
    @State private var currency = ""

    var body: some View {
        Form {
            if let message = model.message {
                Section { NativeNotice(text: message, warning: true) }
            }
            Section {
                TextField(language.t("groups:create.nameHint"), text: $name)
                    .accessibilityIdentifier("groups.newName")
                Picker(language.t("groups:create.currency"), selection: Binding(
                    get: { currency.isEmpty ? model.baseCurrency : currency }, set: { currency = $0 })) {
                    ForEach(model.currencyOptions, id: \.self) { Text($0).tag($0) }
                }
            } header: {
                NativeCapsHeader(title: language.t("groups:create.name"))
            }
            Section {
                Button {
                    Task {
                        if let id = await model.create(name: name, currency: currency.isEmpty ? model.baseCurrency : currency) {
                            NativeHaptics.success()
                            onCreated(id)
                        }
                    }
                } label: {
                    Text(language.t("groups:create.submit")).frame(maxWidth: .infinity)
                }
                .disabled(model.busy || name.trimmingCharacters(in: .whitespaces).isEmpty)
            }
        }
        .scrollContentBackground(.hidden)
        .background(NativeStyle.canvas)
        .nativeTabBarRoom()
        .navigationTitle(language.t("groups:create.title"))
        .navigationBarTitleDisplayMode(.inline)
    }
}
