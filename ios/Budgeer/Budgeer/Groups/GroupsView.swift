// The Groups tab, after the web's Groups page, as a gallery: the invites
// waiting for an answer first, as a banner card each (Accept / Decline),
// then the groups as a grid of square cards (the picture, or the brand's
// gradient with the group's letters; the name, the avatars, and your
// balance as a chip in the corner), New group last, then Join with a link.
// A card opens the group's page; New group and Join open their flows.
// Every word is GroupsModel's (the core's).
import SwiftUI

@MainActor
struct GroupsView: View {
    let model: GroupsModel
    let chrome: PageChrome
    @Environment(AppLanguage.self) private var language

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                if let message = model.message {
                    NativeNotice(text: message, warning: true)
                }
                switch model.state {
                case .loading:
                    NativeLoading()
                case .failed(let message):
                    NativeFailed(message: message) { await model.load() }
                case .loaded(let figures):
                    ForEach(figures.invites) { invite in InviteBanner(invite: invite, model: model) }
                    if figures.cards.isEmpty {
                        empty
                    } else {
                        grid(figures.cards)
                        joinRow
                    }
                }
            }
            .padding(.horizontal, 16)
            .padding(.top, 4)
            .padding(.bottom, NativeFoot.room)
        }
        .background(NativeStyle.canvas)
        .nativeTabBarRoom()
        .navigationTitle(language.t("groups:title"))
        .pageChrome(chrome)
        .refreshable { await model.load() }
        .task(id: language.current) { await model.load() }
    }

    private var empty: some View {
        ContentUnavailableView {
            Label(language.t("groups:list.empty.title"), systemImage: "person.2")
        } description: {
            Text(language.t("groups:list.empty.text"))
        } actions: {
            NavigationLink(value: AppRoute.newGroup) {
                Text(language.t("groups:list.empty.action"))
            }
            .nativeGlassButton(prominent: true)
            NavigationLink(value: AppRoute.join(nil)) {
                Label(language.t("ios:native.join.entry"), systemImage: "link")
            }
            .nativeGlassButton()
            .accessibilityIdentifier("groups.join")
        }
        .padding(.top, 40)
    }

    /// Join with a link: under the grid, as a row.
    private var joinRow: some View {
        NavigationLink(value: AppRoute.join(nil)) {
            HStack(spacing: 12) {
                NativeIconTile(symbol: "link", color: NativeStyle.coral, size: 30)
                Text(language.t("ios:native.join.entry")).font(.subheadline.weight(.semibold))
                Spacer(minLength: 0)
                Image(systemName: "chevron.right").font(.footnote.weight(.bold)).foregroundStyle(.tertiary)
            }
            .padding(.horizontal, 14)
            .frame(minHeight: 52)
            .background(NativeStyle.card, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
        }
        .buttonStyle(.plain)
        .accessibilityIdentifier("groups.join")
    }

    // MARK: The grid

    private func grid(_ cards: [GroupCard]) -> some View {
        LazyVGrid(columns: [GridItem(.flexible(), spacing: 12), GridItem(.flexible(), spacing: 12)], spacing: 12) {
            ForEach(cards) { card in
                NavigationLink(value: AppRoute.group(card.id)) { GroupSquareCard(card: card) }
                    .buttonStyle(.plain)
                    .accessibilityIdentifier("groups.card.\(card.id)")
            }
            NavigationLink(value: AppRoute.newGroup) { NewGroupTile() }
                .buttonStyle(.plain)
                .accessibilityIdentifier("groups.new")
        }
    }

}

/// An invite as a banner card: who asked you into which group, Decline and
/// Accept in glass.
@MainActor
struct InviteBanner: View {
    let invite: InviteRow
    let model: GroupsModel
    @Environment(AppLanguage.self) private var language

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 12) {
                Image(systemName: "envelope.open.fill")
                    .font(.system(size: 20, weight: .semibold))
                    .foregroundStyle(Color.white)
                    .frame(width: 46, height: 46)
                    .background(GroupCoverArt.brand, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                VStack(alignment: .leading, spacing: 2) {
                    Text(invite.name).font(.headline)
                    Text(invite.text).font(.subheadline).foregroundStyle(.secondary)
                }
                Spacer(minLength: 0)
            }
            HStack(spacing: 10) {
                Button {
                    Task { _ = await model.respond(invite, accept: false) }
                } label: {
                    Text(language.t("groups:actions.decline")).frame(maxWidth: .infinity)
                }
                .nativeGlassButton()
                Button {
                    Task { _ = await model.respond(invite, accept: true) }
                } label: {
                    Text(language.t("groups:actions.accept")).frame(maxWidth: .infinity)
                }
                .nativeGlassButton(prominent: true)
            }
            .disabled(model.busy)
        }
        .padding(16)
        .background {
            RoundedRectangle(cornerRadius: 24, style: .continuous)
                .fill(LinearGradient(colors: [Theme.Colors.accentSubtle, NativeStyle.card],
                                     startPoint: .topLeading, endPoint: .bottomTrailing))
        }
        .overlay { RoundedRectangle(cornerRadius: 24, style: .continuous).stroke(NativeStyle.tint.opacity(0.25)) }
        .accessibilityIdentifier("groups.invite.\(invite.id)")
    }
}

/// A group's picture filling its shape: the photo, or the group's own colour
/// (groupCover.groupColour) with its letters, raised by `lift`.
struct GroupCover: View {
    let card: GroupCard
    let letters: CGFloat
    let lift: CGFloat

    var body: some View {
        ZStack {
            card.colour.gradient
            Text(verbatim: card.initials)
                .font(.custom("Poppins-Bold", size: letters))
                .foregroundStyle(Color.white.opacity(0.95))
                .offset(y: -lift)
            if let imageUrl = card.imageUrl, let url = URL(string: imageUrl) {
                AsyncImage(url: url) { image in
                    image.resizable().scaledToFill()
                } placeholder: {
                    Color.clear
                }
            }
        }
        .accessibilityHidden(true)
    }
}

/// Your balance in a group as a small chip: the amount in its tone, or
/// "Settled up".
struct BalanceChip: View {
    let balance: GroupCard.Balance

    var body: some View {
        Text(balance.amount ?? balance.label)
            .font(.caption.weight(.bold))
            .monospacedDigit()
            .foregroundStyle(NativeStyle.tone(balance.tone))
            .lineLimit(1)
            .padding(.horizontal, 9)
            .padding(.vertical, 5)
            .background(NativeStyle.card, in: Capsule())
            .accessibilityLabel([balance.label, balance.amount].compactMap { $0 }.joined(separator: " "))
    }
}

/// A group's card: the picture filling a square, the name, avatars and
/// your balance over a shade at its foot.
struct GroupSquareCard: View {
    let card: GroupCard

    var body: some View {
        Color.clear
            .aspectRatio(1, contentMode: .fit)
            .overlay { GroupCover(card: card, letters: 44, lift: 20) }
            .overlay(alignment: .topTrailing) {
                if let balance = card.balance { BalanceChip(balance: balance).padding(10) }
            }
            .overlay(alignment: .bottomLeading) {
                VStack(alignment: .leading, spacing: 8) {
                    Text(card.name)
                        .font(.headline)
                        .foregroundStyle(Color.white)
                        .lineLimit(2)
                        .multilineTextAlignment(.leading)
                    HStack(spacing: 6) {
                        if let avatars = card.avatars {
                            NativeAvatarStack(stack: avatars, size: 22, ring: Color.white.opacity(0.9))
                        }
                        Text(card.members)
                            .font(.caption.weight(.semibold))
                            .foregroundStyle(Color.white.opacity(0.9))
                            .lineLimit(1)
                            .minimumScaleFactor(0.8)
                    }
                }
                .padding(12)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background {
                    LinearGradient(colors: [Color.black.opacity(0), Color.black.opacity(0.5)], startPoint: .top,
                                   endPoint: .bottom)
                }
            }
            .clipShape(RoundedRectangle(cornerRadius: 24, style: .continuous))
            .shadow(color: Color.black.opacity(0.08), radius: 10, x: 0, y: 6)
            .accessibilityElement(children: .combine)
            .accessibilityLabel(card.name)
    }
}

/// The grid's last tile: New group, in a dashed outline.
struct NewGroupTile: View {
    @Environment(AppLanguage.self) private var language

    var body: some View {
        Color.clear
            .aspectRatio(1, contentMode: .fit)
            .overlay {
                VStack(spacing: 10) {
                    Image(systemName: "plus")
                        .font(.system(size: 22, weight: .bold))
                        .foregroundStyle(Color.white)
                        .frame(width: 48, height: 48)
                        .nativeGlass(Circle(), tint: NativeStyle.solid)
                    Text(language.t("groups:list.newGroup"))
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(NativeStyle.tint)
                }
            }
            .background {
                RoundedRectangle(cornerRadius: 24, style: .continuous)
                    .strokeBorder(NativeStyle.tint.opacity(0.45), style: StrokeStyle(lineWidth: 1.5, dash: [6, 5]))
            }
    }
}

/// A group's picture as a tile: the owner's photo, or people on the group's
/// own colour.
struct GroupPicture: View {
    let imageUrl: String?
    let colour: CoverColour
    let size: CGFloat

    var body: some View {
        ZStack {
            colour.gradient
            Image(systemName: "person.2.fill")
                .font(.system(size: size * 0.4, weight: .semibold))
                .foregroundStyle(Color.white)
            if let imageUrl, let url = URL(string: imageUrl) {
                AsyncImage(url: url) { image in
                    image.resizable().scaledToFill()
                } placeholder: {
                    Color.clear
                }
            }
        }
        .frame(width: size, height: size)
        .clipShape(RoundedRectangle(cornerRadius: size * 0.28, style: .continuous))
        .accessibilityHidden(true)
    }
}
