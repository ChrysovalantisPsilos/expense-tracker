// Home's cards: a title on the canvas with "See all ›" beside it, then the
// card, rounded, on the surface colour, its rows spaced apart with no
// hairlines between them; a bare card leaves its content to draw its own
// background (the strip of charges). And a charge as one of that strip's
// tiles.
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
    var bare = false
    @ViewBuilder let content: Content

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            header.padding(.horizontal, 4)
            VStack(alignment: .leading, spacing: 16) {
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

/// A charge as a tile in Coming up's strip: its badge, its name over when
/// and how often, the amount.
/// A charge as a list row (Coming up beside the sidebar, as the website's
/// desktop card lists them): its badge, name and when, the amount.
struct ChargeRowView: View {
    let row: ChargeRow

    var body: some View {
        HStack(spacing: 12) {
            CategoryBadge(look: row.look, size: 36)
            VStack(alignment: .leading, spacing: 2) {
                Text(row.title).font(.subheadline.weight(.semibold)).lineLimit(1)
                Text(row.meta).font(.caption).foregroundStyle(.secondary).lineLimit(1)
            }
            Spacer(minLength: 8)
            Text(row.amount).font(.subheadline.weight(.semibold)).monospacedDigit().lineLimit(1)
        }
        .padding(.vertical, 4)
        .accessibilityElement(children: .combine)
    }
}

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
