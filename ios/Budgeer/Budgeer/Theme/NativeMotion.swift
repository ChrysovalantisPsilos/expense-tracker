// The app's motion, in one place so every screen moves the same way: a
// spring for what opens and closes in place (an editor under a row, an ⓘ's
// explanation, a card that grows), a quicker one for a picked chip or bar,
// and a figure that rolls its digits to a new value. The ⓘ button and the
// explanation it opens are here too, so every ⓘ in the app opens alike
// (the explanation fades and slides in from under its title). Under Reduce
// Motion, SwiftUI's springs settle without the bounce.
import SwiftUI

enum NativeMotion {
    /// Something opening or closing in place (a row's editor, an ⓘ, a section).
    static let expand = Animation.spring(response: 0.38, dampingFraction: 0.86)
    /// A choice changing what's shown (a month's bar, a segment, a chip).
    static let pick = Animation.spring(response: 0.32, dampingFraction: 0.9)
    /// How an explanation (or any panel opened in place) comes and goes.
    static let reveal = AnyTransition.opacity.combined(with: .move(edge: .top)).combined(with: .scale(scale: 0.98, anchor: .top))
}

/// The ⓘ beside a title: filled while its explanation is open; the toggle
/// springs (NativeMotion.expand).
struct NativeInfoButton: View {
    @Binding var shown: Bool
    var id: String? = nil
    @Environment(AppLanguage.self) private var language

    var body: some View {
        Button {
            withAnimation(NativeMotion.expand) { shown.toggle() }
        } label: {
            Image(systemName: shown ? "info.circle.fill" : "info.circle")
                .contentTransition(.symbolEffect(.replace))
                .frame(minWidth: 28, minHeight: 28)
                .contentShape(Rectangle())
        }
        .buttonStyle(.borderless)
        .foregroundStyle(NativeStyle.tint)
        .accessibilityLabel(Text(language.t("common:info")))
        .accessibilityAddTraits(shown ? .isSelected : [])
        .accessibilityIdentifier(id ?? "info")
    }
}

/// An ⓘ's explanation: on the sand tile, coming in under its title.
struct NativeInfoNote<Content: View>: View {
    @ViewBuilder var content: () -> Content

    var body: some View {
        VStack(alignment: .leading, spacing: 6, content: content)
            .font(.footnote)
            .padding(12)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Theme.Colors.subtle, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
            .transition(NativeMotion.reveal)
    }
}

extension View {
    /// A figure that rolls its digits when `value` changes.
    func nativeFigure(_ value: Double) -> some View {
        contentTransition(.numericText(value: value))
            .animation(NativeMotion.pick, value: value)
    }

    /// A figure given only as text: the digits roll when the text changes.
    func nativeFigure(_ text: String) -> some View {
        contentTransition(.numericText())
            .animation(NativeMotion.pick, value: text)
    }
}

/// Chips or tags that wrap onto the next line instead of squeezing what's
/// beside them (a name is never cut to make room for a tag).
struct NativeFlow: Layout {
    var spacing: CGFloat = 6
    var lineSpacing: CGFloat = 4

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let width = proposal.width ?? .infinity
        var x: CGFloat = 0
        var y: CGFloat = 0
        var line: CGFloat = 0
        var widest: CGFloat = 0
        for view in subviews {
            let size = view.sizeThatFits(ProposedViewSize(width: width, height: nil))
            if x > 0, x + size.width > width {
                y += line + lineSpacing
                x = 0
                line = 0
            }
            x += size.width + spacing
            line = max(line, size.height)
            widest = max(widest, x - spacing)
        }
        return CGSize(width: min(widest, width), height: y + line)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        var x = bounds.minX
        var y = bounds.minY
        var line: CGFloat = 0
        for view in subviews {
            let size = view.sizeThatFits(ProposedViewSize(width: bounds.width, height: nil))
            if x > bounds.minX, x + size.width > bounds.maxX {
                y += line + lineSpacing
                x = bounds.minX
                line = 0
            }
            view.place(at: CGPoint(x: x, y: y), proposal: ProposedViewSize(width: min(size.width, bounds.width), height: size.height))
            x += size.width + spacing
            line = max(line, size.height)
        }
    }
}
