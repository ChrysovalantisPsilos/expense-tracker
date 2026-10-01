// The Groups tab, after the web's Groups page, as a gallery: the invites
// waiting for an answer first, as a banner card each (Accept / Decline),
// then the groups. Two designs are on trial (DesignOptions.groups): A is a
// grid of square cards (the picture, or the brand's gradient with the
// group's letters; the name, the avatars and your balance as a chip); B
// pages sideways through large cards with your balance up front (the
// groups where money is open, galleryParts) and lists the rest compactly
// under them. A card opens the group's page; New group opens its flow.
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
                    } else if DesignOptions.groups == .a {
                        grid(figures.cards)
                    } else {
                        carousel(figures.gallery)
                    }
                }
            }
            .padding(.horizontal, 16)
            .padding(.top, 4)
            .padding(.bottom, 24)
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
        }
        .padding(.top, 40)
    }

    // MARK: A: the grid

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

    // MARK: B: the paging cards, then the rest

    private func carousel(_ gallery: GroupGallery) -> some View {
        VStack(alignment: .leading, spacing: 18) {
            GroupCarousel(cards: gallery.featured)
            if !gallery.rest.isEmpty {
                VStack(alignment: .leading, spacing: 8) {
                    Text(language.t("ios:native.groups.more"))
                        .font(.title3.weight(.semibold))
                        .padding(.horizontal, 4)
                    VStack(spacing: 0) {
                        ForEach(gallery.rest) { card in
                            NavigationLink(value: AppRoute.group(card.id)) { GroupRow(card: card) }
                                .buttonStyle(.plain)
                                .accessibilityIdentifier("groups.card.\(card.id)")
                            if card.id != gallery.rest.last?.id { Divider().padding(.leading, 70) }
                        }
                    }
                    .padding(.horizontal, 14)
                    .background(NativeStyle.card, in: RoundedRectangle(cornerRadius: 22, style: .continuous))
                }
            }
            NavigationLink(value: AppRoute.newGroup) {
                Label(language.t("groups:list.newGroup"), systemImage: "plus.circle.fill")
                    .font(.body.weight(.semibold))
                    .foregroundStyle(NativeStyle.tint)
                    .frame(maxWidth: .infinity, minHeight: 52)
                    .background(NativeStyle.card, in: RoundedRectangle(cornerRadius: 22, style: .continuous))
            }
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
                    .background(GroupCoverArt.gradient(0), in: RoundedRectangle(cornerRadius: 14, style: .continuous))
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

/// A group's picture filling its shape: the photo, or the brand's gradient
/// with the group's letters (none at size 0), raised by `lift`.
struct GroupCover: View {
    let card: GroupCard
    var letters: CGFloat = 40
    var lift: CGFloat = 0

    var body: some View {
        ZStack {
            GroupCoverArt.gradient(0)
            if letters > 0 {
                Text(verbatim: card.initials)
                    .font(.custom("Poppins-Bold", size: letters))
                    .foregroundStyle(Color.white.opacity(0.95))
                    .offset(y: -lift)
            }
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

/// Design A's card: the picture filling a square, the name, avatars and
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

/// Design B's paging cards: one large card per featured group, the next
/// one peeking, dots under them.
struct GroupCarousel: View {
    let cards: [GroupCard]
    @State private var shown: String?

    var body: some View {
        VStack(spacing: 10) {
            ScrollView(.horizontal, showsIndicators: false) {
                LazyHStack(spacing: 12) {
                    ForEach(cards) { card in
                        NavigationLink(value: AppRoute.group(card.id)) { GroupWalletCard(card: card) }
                            .buttonStyle(.plain)
                            .containerRelativeFrame(.horizontal) { width, _ in cards.count > 1 ? width - 44 : width }
                            .id(card.id)
                            .accessibilityIdentifier("groups.card.\(card.id)")
                    }
                }
                .scrollTargetLayout()
            }
            .scrollTargetBehavior(.viewAligned)
            .scrollPosition(id: $shown)
            .scrollClipDisabled()
            if cards.count > 1 {
                HStack(spacing: 7) {
                    ForEach(cards) { card in
                        Circle()
                            .fill(card.id == (shown ?? cards.first?.id) ? NativeStyle.tint : Color.primary.opacity(0.18))
                            .frame(width: 7, height: 7)
                    }
                }
                .frame(maxWidth: .infinity)
                .accessibilityHidden(true)
            }
        }
    }
}

/// A large card: the picture behind, the name and the avatars on top, and
/// your balance up front in big figures on a glass panel.
struct GroupWalletCard: View {
    let card: GroupCard

    var body: some View {
        ZStack(alignment: .topLeading) {
            GroupCover(card: card, letters: 0)
                .overlay {
                    LinearGradient(colors: [Color.black.opacity(0), Color.black.opacity(0.28)], startPoint: .top,
                                   endPoint: .bottom)
                }
            VStack(alignment: .leading, spacing: 0) {
                HStack(alignment: .top) {
                    VStack(alignment: .leading, spacing: 6) {
                        Text(card.name)
                            .font(.title2.weight(.bold))
                            .foregroundStyle(Color.white)
                            .lineLimit(2)
                        HStack(spacing: 6) {
                            if let avatars = card.avatars {
                                NativeAvatarStack(stack: avatars, size: 24, ring: Color.white.opacity(0.9))
                            }
                            Text(card.members).font(.footnote.weight(.semibold)).foregroundStyle(Color.white.opacity(0.9))
                        }
                    }
                    Spacer(minLength: 8)
                    Text(verbatim: card.currency)
                        .font(.caption.weight(.bold))
                        .foregroundStyle(Color.white)
                        .padding(.horizontal, 8)
                        .padding(.vertical, 4)
                        .background(Color.white.opacity(0.22), in: Capsule())
                }
                Spacer(minLength: 12)
                if let balance = card.balance {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(balance.label).font(.subheadline.weight(.semibold)).foregroundStyle(.secondary)
                        if let amount = balance.amount {
                            Text(amount)
                                .font(NativeStyle.money(30))
                                .foregroundStyle(NativeStyle.tone(balance.tone))
                                .monospacedDigit()
                                .lineLimit(1)
                                .minimumScaleFactor(0.6)
                        }
                    }
                    .padding(.horizontal, 16)
                    .padding(.vertical, 12)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .nativeGlass(RoundedRectangle(cornerRadius: 20, style: .continuous))
                }
            }
            .padding(16)
        }
        .frame(height: 230)
        .clipShape(RoundedRectangle(cornerRadius: 30, style: .continuous))
        .shadow(color: Color.black.opacity(0.12), radius: 16, x: 0, y: 10)
        .accessibilityElement(children: .combine)
    }
}

/// A group's row (design B's rest): its picture, name, the avatars and
/// "4 members", your balance in its tone.
struct GroupRow: View {
    let card: GroupCard

    var body: some View {
        HStack(spacing: 12) {
            GroupCover(card: card, letters: 18)
                .frame(width: 46, height: 46)
                .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
            VStack(alignment: .leading, spacing: 4) {
                Text(card.name).font(.body.weight(.semibold)).lineLimit(2)
                HStack(spacing: 6) {
                    if let avatars = card.avatars { NativeAvatarStack(stack: avatars, size: 20) }
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
            Image(systemName: "chevron.right").font(.footnote.weight(.semibold)).foregroundStyle(.tertiary)
        }
        .padding(.vertical, 10)
        .contentShape(Rectangle())
        .accessibilityElement(children: .combine)
    }
}

/// A group's picture as a tile: the owner's photo, or the brand's gradient
/// with people.
struct GroupPicture: View {
    var imageUrl: String? = nil
    var size: CGFloat = 40

    var body: some View {
        ZStack {
            GroupCoverArt.gradient(0)
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
