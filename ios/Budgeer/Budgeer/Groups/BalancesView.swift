// A group's Balances, a pushed page: your balance up top, then everyone's
// as a card per person (their avatar, the amount in its tone, and a bar
// from the middle: right for what they get back, left for what they owe,
// sized against the biggest balance), then who pays whom to settle everyone
// up, each payment from one avatar to the other. Settle up floats at the
// foot. Every figure and word is GroupModel's (balancesParts, the core's).
import SwiftUI

@MainActor
struct BalancesView: View {
    let model: GroupModel
    let settle: () -> Void
    @Environment(AppLanguage.self) private var language

    var body: some View {
        ScrollView {
            if let parts = model.figures?.balances {
                VStack(alignment: .leading, spacing: 18) {
                    summary(parts)
                    if !parts.tiles.isEmpty { people(parts.tiles) }
                    if !parts.plan.isEmpty { plan(parts) }
                }
                .padding(.horizontal, 16)
                .padding(.top, 8)
                .padding(.bottom, 24)
            }
        }
        .background(NativeStyle.canvas)
        .safeAreaInset(edge: .bottom, spacing: 0) {
            if model.figures?.myMemberId != nil, model.figures?.balances.plan.isEmpty == false {
                Button(action: settle) {
                    Label(language.t("groups:balances.settleUp"), systemImage: "checkmark.circle.fill")
                        .frame(maxWidth: .infinity)
                }
                .nativeGlassButton(prominent: true)
                .padding(.horizontal, 16)
                .padding(.vertical, 10)
                .accessibilityIdentifier("balances.settle")
            }
        }
        .nativeTabBarRoom()
        .navigationTitle(language.t("groups:balances.title"))
        .navigationBarTitleDisplayMode(.large)
    }

    private func summary(_ parts: BalancesParts) -> some View {
        VStack(spacing: 4) {
            Text(language.t("groups:balances.yours")).font(.subheadline).foregroundStyle(.secondary)
            Text(parts.mine.text)
                .font(NativeStyle.money(40))
                .foregroundStyle(NativeStyle.tone(parts.mine.tone))
                .monospacedDigit()
                .lineLimit(1)
                .minimumScaleFactor(0.6)
            Text([parts.highlight.text, parts.highlight.amount].compactMap { $0 }.joined(separator: " "))
                .font(.footnote)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 18)
        .background {
            RoundedRectangle(cornerRadius: 24, style: .continuous)
                .fill(LinearGradient(colors: [Theme.Colors.accentSubtle, NativeStyle.card],
                                     startPoint: .top, endPoint: .bottom))
        }
        .accessibilityElement(children: .combine)
    }

    private func people(_ tiles: [BalanceTileParts]) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Text(language.t("ios:native.balances.everyone")).font(.title3.weight(.semibold))
                Spacer()
                legend(language.t("ios:native.balances.owes"), NativeStyle.negative)
                legend(language.t("ios:native.balances.getsBack"), NativeStyle.positive)
            }
            .padding(.horizontal, 4)
            VStack(spacing: 0) {
                ForEach(tiles) { tile in
                    PersonBalanceRow(tile: tile)
                    if tile.id != tiles.last?.id { Divider().padding(.leading, 58) }
                }
            }
            .padding(.horizontal, 14)
            .background(NativeStyle.card, in: RoundedRectangle(cornerRadius: 22, style: .continuous))
        }
    }

    private func legend(_ text: String, _ color: Color) -> some View {
        HStack(spacing: 4) {
            Circle().fill(color).frame(width: 8, height: 8)
            Text(text).font(.caption).foregroundStyle(.secondary)
        }
    }

    private func plan(_ parts: BalancesParts) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(parts.planSubtitle ?? language.t("groups:balances.whoOwes"))
                .font(.title3.weight(.semibold))
                .padding(.horizontal, 4)
            ForEach(parts.plan) { row in
                HStack(spacing: 10) {
                    person(row.from)
                    VStack(spacing: 3) {
                        Text(row.amount)
                            .font(.subheadline.weight(.bold))
                            .monospacedDigit()
                            .foregroundStyle(NativeStyle.tone(row.tone))
                            .lineLimit(1)
                            .minimumScaleFactor(0.7)
                        HStack(spacing: 0) {
                            Capsule().fill(NativeStyle.tone(row.tone).opacity(0.35)).frame(height: 2)
                            Image(systemName: "arrowtriangle.right.fill")
                                .font(.system(size: 8))
                                .foregroundStyle(NativeStyle.tone(row.tone).opacity(0.7))
                        }
                    }
                    .frame(maxWidth: .infinity)
                    person(row.to)
                }
                .padding(14)
                .background(NativeStyle.card, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
                .accessibilityElement(children: .combine)
            }
        }
    }

    private func person(_ avatar: Avatar) -> some View {
        VStack(spacing: 5) {
            NativeAvatar(avatar: avatar, size: 40)
            Text(avatar.name).font(.caption.weight(.semibold)).lineLimit(1)
        }
        .frame(width: 76)
    }
}

/// One person's balance: their avatar and name, the amount in its tone, and
/// a bar from the middle (right: gets back, left: owes).
struct PersonBalanceRow: View {
    let tile: BalanceTileParts

    var body: some View {
        HStack(spacing: 12) {
            NativeAvatar(avatar: tile.avatar, size: 40)
            VStack(alignment: .leading, spacing: 7) {
                HStack(alignment: .firstTextBaseline) {
                    Text(tile.label).font(.body.weight(.semibold)).lineLimit(1)
                    Spacer(minLength: 8)
                    Text(tile.text)
                        .font(.body.weight(.semibold))
                        .monospacedDigit()
                        .foregroundStyle(NativeStyle.tone(tile.tone))
                }
                GeometryReader { proxy in
                    let half = proxy.size.width / 2
                    let width = max(tile.bar > 0 ? 4 : 0, half * tile.bar)
                    ZStack(alignment: .leading) {
                        Capsule().fill(Color.primary.opacity(0.07))
                        Rectangle().fill(Color.primary.opacity(0.18)).frame(width: 1.5).offset(x: half - 0.75)
                        Capsule()
                            .fill(NativeStyle.tone(tile.tone))
                            .frame(width: width)
                            .offset(x: tile.tone == "negative" ? half - width : half)
                    }
                }
                .frame(height: 8)
                .accessibilityHidden(true)
            }
        }
        .padding(.vertical, 12)
        .accessibilityElement(children: .combine)
    }
}
