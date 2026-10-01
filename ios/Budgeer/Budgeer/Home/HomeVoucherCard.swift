// Home's Meal vouchers: the card itself, in the brand's coral, with what's
// on it, opening the vouchers' page; the next top-up apart from it, as a
// line beneath ("Next top-up" · "+€160.00 on 5 Oct", then why). Every word
// and figure is the core's (voucherCardParts) or vouchers' strings.
import SwiftUI

/// "Next top-up" with "+€160.00 on 5 Oct" across from it, why under it.
struct VoucherNextTopUp: View {
    let card: VoucherCardFigures
    @Environment(AppLanguage.self) private var language

    var body: some View {
        VStack(alignment: .leading, spacing: 3) {
            HStack(alignment: .firstTextBaseline) {
                Text(language.t("vouchers:next.title")).font(.subheadline).foregroundStyle(.secondary)
                Spacer(minLength: 8)
                Text(card.nextAmount)
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(NativeStyle.positive)
                    .monospacedDigit()
                    .lineLimit(1)
            }
            Text(card.nextWhy).font(.footnote).foregroundStyle(.secondary).lineLimit(2)
        }
        .accessibilityElement(children: .combine)
    }
}

/// The card, opening the vouchers' page, then the next top-up.
struct VoucherWallet: View {
    let card: VoucherCardFigures
    @Environment(AppLanguage.self) private var language

    private static let shape = RoundedRectangle(cornerRadius: 22, style: .continuous)

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            NavigationLink(value: AppRoute.vouchers) {
                ZStack(alignment: .bottomTrailing) {
                    Image(systemName: "ticket.fill")
                        .font(.system(size: 110))
                        .foregroundStyle(Color.white.opacity(0.12))
                        .rotationEffect(.degrees(-14))
                        .offset(x: 22, y: 26)
                        .accessibilityHidden(true)
                    VStack(alignment: .leading, spacing: 2) {
                        HStack(spacing: 6) {
                            Image(systemName: "ticket.fill")
                            Text(language.t("vouchers:title"))
                            Spacer(minLength: 8)
                            Image(systemName: "chevron.right").font(.footnote.weight(.semibold)).opacity(0.8)
                        }
                        .font(.subheadline.weight(.semibold))
                        Spacer(minLength: 18)
                        Text(language.t("vouchers:balance")).font(.footnote).opacity(0.85)
                        Text(card.balance)
                            .font(NativeStyle.money(32))
                            .monospacedDigit()
                            .lineLimit(1)
                            .minimumScaleFactor(0.7)
                            .contentTransition(.numericText())
                    }
                    .foregroundStyle(Color.white)
                    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
                    .padding(18)
                }
                .frame(height: 150)
                .background(LinearGradient(colors: [Theme.Colors.accentSolid, NativeStyle.coral],
                                           startPoint: .topLeading, endPoint: .bottomTrailing), in: VoucherWallet.shape)
                .clipShape(VoucherWallet.shape)
                .shadow(color: NativeStyle.coral.opacity(0.22), radius: 16, x: 0, y: 8)
            }
            .buttonStyle(.plain)
            .accessibilityLabel(Text(verbatim: "\(language.t("vouchers:title")), \(language.t("vouchers:balance")) \(card.balance)"))
            VoucherNextTopUp(card: card).padding(.horizontal, 6)
        }
    }
}
