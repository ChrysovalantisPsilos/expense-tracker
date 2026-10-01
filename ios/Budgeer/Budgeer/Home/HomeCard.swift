// Home's cards: rounded, on the surface colour, the rows spaced apart with
// no hairlines between them. A card's title sits inside it (Home A) or on
// the canvas above it (Home B), "See all ›" beside it; a bare card leaves
// its content to draw its own background (Home B's strip of charges). And a
// charge as one of that strip's tiles.
import SwiftUI

enum HomeCardStyle {
    static let shape = RoundedRectangle(cornerRadius: 24, style: .continuous)
    /// How Home's cards come, go and change.
    static let spring = Animation.spring(response: 0.45, dampingFraction: 0.88)
    static let transition = AnyTransition.opacity.combined(with: .scale(scale: 0.97, anchor: .top))
}

struct HomeCard<Content: View>: View {
    let title: String
    var seeAll: String? = nil
    var route: AppRoute? = nil
    var titleOutside = false
    var bare = false
    @ViewBuilder let content: Content

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            if titleOutside { header.padding(.horizontal, 4) }
            VStack(alignment: .leading, spacing: 16) {
                if !titleOutside { header }
                content
            }
            .padding(bare ? 0 : 16)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background {
                if !bare { HomeCardStyle.shape.fill(NativeStyle.card) }
            }
        }
        .transition(HomeCardStyle.transition)
    }

    private var header: some View {
        HStack(alignment: .firstTextBaseline) {
            Text(title)
                .font(.title3.weight(.semibold))
                .foregroundStyle(Color.primary)
                .accessibilityAddTraits(.isHeader)
            Spacer(minLength: 8)
            if let seeAll, let route {
                NavigationLink(value: route) {
                    HStack(spacing: 3) {
                        Text(seeAll)
                        Image(systemName: "chevron.right").font(.caption.weight(.semibold))
                    }
                    .font(.subheadline.weight(.medium))
                }
                .foregroundStyle(NativeStyle.tint)
            }
        }
    }
}

/// A charge as a tile in Home B's strip: its badge, its name over when and
/// how often, the amount.
struct ChargeTile: View {
    let row: ChargeRow

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            CategoryBadge(look: row.look, size: 36)
            VStack(alignment: .leading, spacing: 2) {
                Text(row.title).font(.subheadline.weight(.semibold)).lineLimit(1)
                Text(row.meta).font(.caption).foregroundStyle(.secondary).lineLimit(2, reservesSpace: true)
            }
            Text(row.amount).font(.headline).monospacedDigit().lineLimit(1).minimumScaleFactor(0.8)
        }
        .padding(14)
        .frame(width: 152, alignment: .leading)
        .background(NativeStyle.card, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
        .accessibilityElement(children: .combine)
    }
}
