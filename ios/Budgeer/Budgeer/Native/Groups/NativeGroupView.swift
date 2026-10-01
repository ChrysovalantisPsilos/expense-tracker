// A group, redesigned: a balance hero at the top ("You're owed €162.75",
// the members' circles, Settle up in prominent glass and Balances beside
// it), and under it one chat-like timeline of expenses, settlements and
// comments, newest at the bottom like Messages, with the comment field
// floating over its foot. Who owes whom sits behind Balances. Settling the
// group bursts confetti and taps a success haptic.
import SwiftUI

/// The Groups tab: your groups, with the trip opened when `open`.
struct NativeGroupsView: View {
    let sample: NativeSample
    var settled = false
    @Environment(AppLanguage.self) private var language
    @State private var path: [String]

    init(sample: NativeSample, open: Bool = false, settled: Bool = false) {
        self.sample = sample
        self.settled = settled
        _path = State(initialValue: open ? ["trip"] : [])
    }

    var body: some View {
        NavigationStack(path: $path) {
            List {
                Section {
                    NavigationLink(value: "trip") {
                        HStack(spacing: 12) {
                            NativeIconTile(symbol: "airplane", color: NativeStyle.coral, size: 44)
                            VStack(alignment: .leading, spacing: 3) {
                                Text(sample.trip.name).font(.body.weight(.semibold))
                                Text(sample.trip.membersLabel).font(.footnote).foregroundStyle(.secondary)
                            }
                            Spacer(minLength: 8)
                            VStack(alignment: .trailing, spacing: 2) {
                                Text(sample.trip.balanceLabel).font(.caption).foregroundStyle(.secondary)
                                Text(sample.trip.balance).font(.body.weight(.semibold))
                                    .foregroundStyle(NativeStyle.positive).monospacedDigit()
                            }
                        }
                        .padding(.vertical, 4)
                    }
                }
                .listRowBackground(NativeStyle.card)
            }
            .listStyle(.insetGrouped)
            .scrollContentBackground(.hidden)
            .background(NativeStyle.canvas)
            .nativeTabBarRoom()
            .navigationTitle(language.t("shell:nav.groups"))
            .toolbar {
                NativeAccountItems(me: sample.me, unread: true, bellLabel: language.t("notifications:bell.title"),
                                   profileLabel: language.t("ios:native.home.profile"))
            }
            .navigationDestination(for: String.self) { _ in
                NativeGroupPage(sample: sample, settled: settled)
            }
        }
    }
}

struct NativeGroupPage: View {
    let sample: NativeSample
    var settled = false
    @Environment(AppLanguage.self) private var language
    @State private var comment = ""
    @State private var showBalances = false
    @State private var settles = 0

    private var trip: NativeSample.Trip { sample.trip }

    var body: some View {
        VStack(spacing: 0) {
            hero
                .padding(.horizontal, 16)
                .padding(.top, 4)
                .padding(.bottom, 10)
            ScrollView {
                LazyVStack(spacing: 10) {
                    ForEach(trip.timeline) { moment in
                        NativeMomentView(moment: moment)
                    }
                }
                .padding(.horizontal, 12)
                .padding(.vertical, 12)
            }
            .defaultScrollAnchor(.bottom)
            .scrollDismissesKeyboard(.interactively)
            .safeAreaInset(edge: .bottom, spacing: 0) { composer }
        }
        .nativeTabBarRoom()
        .background(NativeStyle.canvas)
        .navigationTitle(trip.name)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Menu {
                    Button {} label: { Label(language.t("groups:members.title"), systemImage: "person.2") }
                    Button {} label: { Label(language.t("groups:balances.title"), systemImage: "scalemass") }
                } label: {
                    Image(systemName: "ellipsis")
                }
                .accessibilityLabel(language.t("common:actions.moreActions"))
            }
        }
        .overlay {
            if settled { NativeConfetti() }
        }
        .sheet(isPresented: $showBalances) { balances }
        .sensoryFeedback(.success, trigger: settles)
    }

    // MARK: The hero

    private var hero: some View {
        VStack(spacing: 6) {
            NativeAvatarStack(avatars: trip.members, size: 32)
            if settled {
                Text(language.t("ios:native.group.allSettled"))
                    .font(NativeStyle.title(26, lang: sample.lang))
                    .padding(.top, 4)
                Text(language.t("ios:native.group.allSettledNote"))
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            } else {
                Text(trip.balanceLabel)
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                    .padding(.top, 2)
                NativeMoney(text: trip.balance, value: trip.balanceMinor, font: NativeStyle.money(42),
                            color: NativeStyle.positive)
            }
            HStack(spacing: 10) {
                if !settled {
                    Button { settles += 1 } label: {
                        Label(language.t("groups:balances.settleUp"), systemImage: "checkmark.circle.fill")
                            .lineLimit(1)
                    }
                    .nativeGlassButton(prominent: true)
                }
                Button { showBalances = true } label: {
                    Label(language.t("ios:native.group.seeBalances"), systemImage: "list.bullet")
                        .lineLimit(1)
                }
                .nativeGlassButton()
            }
            .padding(.top, 8)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 16)
        .background(NativeStyle.card, in: RoundedRectangle(cornerRadius: 22, style: .continuous))
    }

    // MARK: The comment field

    private var composer: some View {
        HStack(spacing: 8) {
            TextField(language.t("ios:native.group.writeComment"), text: $comment)
                .padding(.horizontal, 16)
                .frame(minHeight: 44)
                .nativeGlass(Capsule(), interactive: true)
            Button {} label: {
                Image(systemName: "arrow.up")
                    .font(.system(size: 17, weight: .bold))
                    .foregroundStyle(Color.white)
                    .frame(width: 44, height: 44)
                    .nativeGlass(Circle(), tint: NativeStyle.solid, interactive: true)
            }
            .buttonStyle(.plain)
            .accessibilityLabel(language.t("ios:native.group.send"))
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 8)
    }

    // MARK: Balances (behind a tap)

    private var balances: some View {
        NavigationStack {
            List {
                ForEach(trip.owers, id: \.name) { ower in
                    HStack {
                        Text(ower.name)
                        Spacer()
                        Text(ower.amount).font(.body.weight(.semibold)).foregroundStyle(NativeStyle.positive)
                    }
                }
            }
            .navigationTitle(language.t("groups:balances.title"))
            .navigationBarTitleDisplayMode(.inline)
        }
        .presentationDetents([.medium])
    }
}

/// One moment of the timeline: a day, an expense bubble (yours on the right,
/// in the accent's tint), a settlement in the middle, or a comment.
struct NativeMomentView: View {
    let moment: NativeSample.Moment

    var body: some View {
        switch moment {
        case .day(_, let title):
            Text(title)
                .font(.caption.weight(.semibold))
                .foregroundStyle(.secondary)
                .padding(.top, 8)
        case .expense(_, let title, let mine, let author, let paidBy, let amount, let share, let look):
            HStack(alignment: .bottom, spacing: 8) {
                if mine { Spacer(minLength: 48) } else { NativeAvatar(avatar: author, size: 28) }
                HStack(alignment: .top, spacing: 10) {
                    CategoryBadge(look: look, size: 34)
                    VStack(alignment: .leading, spacing: 2) {
                        HStack(alignment: .firstTextBaseline, spacing: 8) {
                            Text(title).font(.subheadline.weight(.semibold)).lineLimit(2)
                            Spacer(minLength: 4)
                            Text(amount).font(.subheadline.weight(.semibold)).monospacedDigit()
                        }
                        Text(paidBy).font(.caption).foregroundStyle(.secondary).lineLimit(1)
                        if let share {
                            Text(share).font(.caption.weight(.medium)).foregroundStyle(NativeStyle.tint).lineLimit(1)
                        }
                    }
                }
                .padding(12)
                .frame(maxWidth: 300)
                .background(mine ? Theme.Colors.accentSubtle : NativeStyle.card,
                            in: RoundedRectangle(cornerRadius: 20, style: .continuous))
                if !mine { Spacer(minLength: 24) }
            }
        case .settlement(_, let label, let amount):
            HStack(spacing: 6) {
                Image(systemName: "checkmark.circle.fill").foregroundStyle(NativeStyle.positive)
                Text(label).lineLimit(1)
                Text(verbatim: "·")
                Text(amount).fontWeight(.semibold).monospacedDigit()
            }
            .font(.footnote)
            .padding(.horizontal, 14)
            .padding(.vertical, 8)
            .background(NativeStyle.positive.opacity(0.12), in: Capsule())
        case .comment(_, let author, let text, let mine):
            HStack(alignment: .bottom, spacing: 8) {
                if mine { Spacer(minLength: 64) } else { NativeAvatar(avatar: author, size: 28) }
                VStack(alignment: .leading, spacing: 2) {
                    if !mine {
                        Text(author.name).font(.caption2.weight(.semibold)).foregroundStyle(.secondary)
                    }
                    Text(text).font(.subheadline)
                }
                .padding(.horizontal, 14)
                .padding(.vertical, 9)
                .foregroundStyle(mine ? Color.white : Color.primary)
                .background(mine ? NativeStyle.solid : NativeStyle.card,
                            in: RoundedRectangle(cornerRadius: 18, style: .continuous))
                if !mine { Spacer(minLength: 64) }
            }
        }
    }
}
