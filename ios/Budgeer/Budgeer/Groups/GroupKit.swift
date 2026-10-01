// The pieces the group pages are drawn with, after the web's kit and the
// groups' own components: a person's avatar circle (UserAvatar), the
// overlapping avatar stack (AvatarStack), a group's picture (GroupMark),
// the pale highlight line (HighlightPill), a
// settle-up payment on its sand tile (TransferRow), a list row (ItemRow),
// and rich text from the core's parseRich. Every word and colour they show
// was worked out by the core; these only draw.
import SwiftUI

/// The kit's tone names (kitMath) as colours.
func toneColor(_ tone: String?) -> Color {
    switch tone {
    case "positive": return Theme.Colors.positive
    case "negative": return Theme.Colors.negative
    case "muted": return Theme.Colors.textMuted
    case "warning": return Theme.Colors.warning
    case "accent", nil: return Theme.Colors.accentFg
    default: return Theme.Colors.textPrimary
    }
}

/// A person's circle: their photo, or the initials on their colour (the
/// viewer always in the accent, as the web's `highlight`).
struct AvatarCircle: View {
    let avatar: Avatar
    var size: CGFloat = 24
    /// The colour of the surface it sits on (the stack's cut-out ring).
    var ring: Color? = nil

    var body: some View {
        ZStack {
            Circle().fill(fill)
            Text(avatar.initials)
                .font(.system(size: size / 2.5, weight: .semibold))
                .foregroundStyle(avatar.fg == "dark" ? Color(hex: 0x1A202C) : Color.white)
            if let src = avatar.src, let url = URL(string: src) {
                AsyncImage(url: url) { image in
                    image.resizable().scaledToFill()
                } placeholder: {
                    Color.clear
                }
                .clipShape(Circle())
            }
        }
        .frame(width: size, height: size)
        .overlay(Circle().stroke(ring ?? .clear, lineWidth: ring == nil ? 0 : 2))
        .accessibilityHidden(true)
    }

    private var fill: Color {
        if avatar.highlight { return Theme.Colors.accentSolid }
        return avatar.bg.flatMap { Color(hexString: $0) } ?? Theme.Colors.subtle
    }
}

/// Overlapping avatars (you and the owner first) and a "+N" chip past four.
struct AvatarStackView: View {
    let stack: AvatarStackParts
    var ring: Color = Theme.Colors.surface

    var body: some View {
        HStack(spacing: -8) {
            ForEach(Array(stack.shown.enumerated()), id: \.offset) { index, avatar in
                AvatarCircle(avatar: avatar, size: 24, ring: ring)
                    .zIndex(Double(stack.shown.count - index))
            }
            if stack.overflow > 0 {
                Text("+\(stack.overflow)")
                    .font(.system(size: 10, weight: .bold))
                    .foregroundStyle(Theme.Colors.textMuted)
                    .frame(width: 24, height: 24)
                    .background(Theme.Colors.subtle)
                    .clipShape(Circle())
                    .overlay(Circle().stroke(ring, lineWidth: 2))
            }
        }
        .accessibilityHidden(true)
    }
}

/// A group's picture: the owner's photo, or the solid brand tile with people on it.
struct GroupMark: View {
    var imageUrl: String? = nil
    var size: CGFloat = 40

    var body: some View {
        let radius = size >= 40 ? Theme.Radius.xl : Theme.Radius.lg
        ZStack {
            RoundedRectangle(cornerRadius: radius, style: .continuous).fill(Theme.Palette.brand500)
            LucideIcon(icon: .users, size: size * 0.45)
                .foregroundStyle(Color.white)
            if let imageUrl, let url = URL(string: imageUrl) {
                AsyncImage(url: url) { image in
                    image.resizable().scaledToFill()
                } placeholder: {
                    Color.clear
                }
                .clipShape(RoundedRectangle(cornerRadius: radius, style: .continuous))
            }
        }
        .frame(width: size, height: size)
        .accessibilityHidden(true)
    }
}

/// The pale brand line for what matters most, its amount in the tone's colour.
struct HighlightPill: View {
    let text: String
    var amount: String? = nil
    var tone: String? = nil
    @Environment(AppLanguage.self) private var language
    @Environment(\.colorScheme) private var scheme

    var body: some View {
        var line = Text(text).font(Theme.Fonts.body(14, weight: .semibold, lang: language.current))
            .foregroundColor(Theme.Colors.textPrimary)
        if let amount {
            line = line + Text(" ") + Text(amount).font(Theme.Fonts.body(14, weight: .bold, lang: language.current))
                .foregroundColor(toneColor(tone))
        }
        return line
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.horizontal, Theme.Space.s3)
            .padding(.vertical, Theme.Space.s2)
            .background(scheme == .dark ? Color.white.opacity(0.06) : Theme.Palette.brand50)
            .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.lg, style: .continuous))
    }
}

/// A settle-up payment on a sand tile: avatar and name → avatar and name, the amount.
struct TransferRowView: View {
    let row: PlanRow
    @Environment(AppLanguage.self) private var language

    var body: some View {
        HStack(spacing: Theme.Space.s2) {
            ViewThatFits(in: .horizontal) {
                HStack(spacing: Theme.Space.s2) { person(row.from); arrow; person(row.to) }
                VStack(alignment: .leading, spacing: Theme.Space.s1) {
                    HStack(spacing: Theme.Space.s2) { person(row.from); arrow }
                    person(row.to)
                }
            }
            Spacer(minLength: Theme.Space.s2)
            Text(row.amount)
                .font(Theme.Fonts.body(14, weight: .bold, lang: language.current))
                .foregroundStyle(toneColor(row.tone))
                .lineLimit(1)
        }
        .padding(.horizontal, Theme.Space.s3)
        .padding(.vertical, 10)
        .background(Theme.Colors.subtle)
        .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.lg, style: .continuous))
        .accessibilityElement(children: .combine)
    }

    private var arrow: some View {
        LucideIcon(icon: .arrowRight, size: 14).foregroundStyle(Theme.Colors.textMuted)
    }

    private func person(_ avatar: Avatar) -> some View {
        HStack(spacing: Theme.Space.s2) {
            AvatarCircle(avatar: avatar)
            Text(avatar.name)
                .font(Theme.Fonts.body(14, weight: .semibold, lang: language.current))
                .foregroundStyle(Theme.Colors.textPrimary)
                .lineLimit(1)
        }
    }
}

/// A list row (ItemRow): the icon tile, the title over its muted line, the
/// amount (and a line under it), and a trailing control.
struct GroupItemRow<Trailing: View>: View {
    let icon: Lucide
    let title: String
    let meta: String
    let amount: String?
    var amountMeta: String? = nil
    @ViewBuilder var trailing: () -> Trailing
    @Environment(AppLanguage.self) private var language

    var body: some View {
        HStack(spacing: Theme.Space.s3) {
            IconTile(icon: icon)
            VStack(alignment: .leading, spacing: 2) {
                Text(title)
                    .font(Theme.Fonts.body(14, weight: .semibold, lang: language.current))
                    .foregroundStyle(Theme.Colors.textPrimary)
                    .lineLimit(2)
                if !meta.isEmpty {
                    Text(meta)
                        .font(Theme.Fonts.body(12, lang: language.current))
                        .foregroundStyle(Theme.Colors.textMuted)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
            Spacer(minLength: Theme.Space.s2)
            if let amount {
                VStack(alignment: .trailing, spacing: 1) {
                    Text(amount)
                        .font(Theme.Fonts.body(14, weight: .bold, lang: language.current))
                        .foregroundStyle(Theme.Colors.textPrimary)
                        .lineLimit(1)
                    if let amountMeta {
                        Text(amountMeta)
                            .font(Theme.Fonts.body(12, lang: language.current))
                            .foregroundStyle(Theme.Colors.textMuted)
                            .lineLimit(1)
                    }
                }
            }
            trailing()
        }
        .padding(.vertical, Theme.Space.s2)
        .contentShape(Rectangle())
    }
}

/// A row's comment button with its count, in a fixed slot so amounts line up.
struct CommentCount: View {
    let count: Int
    let label: String
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 2) {
                LucideIcon(icon: .messageSquare, size: 15)
                if count > 0 { Text("\(count)").font(.system(size: 12)) }
            }
            .foregroundStyle(Theme.Colors.textMuted)
            .frame(width: 40, height: 36, alignment: .leading)
            .padding(.leading, 6)
        }
        .buttonStyle(.plain)
        .accessibilityLabel(label)
    }
}

/// Rich text from translate.parseRich: strings, and { tag: 'b', children } in bold.
struct RichText: View {
    let nodes: JSONValue
    var size: CGFloat = 14
    @Environment(AppLanguage.self) private var language

    var body: some View {
        RichText.text(nodes)
            .font(Theme.Fonts.body(size, lang: language.current))
            .foregroundStyle(Theme.Colors.textPrimary)
    }

    /// The nodes as one Text, <b> in bold (an alert's message takes a Text).
    static func text(_ nodes: JSONValue, bold: Bool = false) -> Text {
        (nodes.arrayValue ?? []).reduce(Text("")) { line, node in
            if let plain = node.stringValue {
                return line + Text(plain).fontWeight(bold ? .bold : .regular)
            }
            return line + text(node["children"] ?? [], bold: bold || node["tag"]?.stringValue == "b")
        }
    }
}

/// Keeps a page's model for as long as the page is shown: made once, on
/// appearing (a destination's view is rebuilt with its parent; its model
/// must not be). `make` answering nil shows `missing`.
struct ModelHost<Model: AnyObject, Content: View, Missing: View>: View {
    let make: () -> Model?
    @ViewBuilder var content: (Model) -> Content
    @ViewBuilder var missing: () -> Missing
    @State private var model: Model?
    @State private var made = false

    var body: some View {
        Group {
            if let model {
                content(model)
            } else if made {
                missing()
            } else {
                LoadingView()
            }
        }
        .onAppear {
            if !made {
                model = make()
                made = true
            }
        }
    }
}

/// The two-state choice the forms use (the web's solid/outline button pair).
struct ChoiceButton: View {
    let label: String
    let on: Bool
    let action: () -> Void
    @Environment(AppLanguage.self) private var language

    var body: some View {
        Button(action: action) {
            Text(label)
                .font(Theme.Fonts.body(14, weight: .semibold, lang: language.current))
                .foregroundStyle(on ? Theme.Colors.onAccent : Theme.Colors.textPrimary)
                .frame(maxWidth: .infinity, minHeight: 40)
                .padding(.horizontal, Theme.Space.s2)
                .background(on ? Theme.Colors.accentSolid : Theme.Colors.surface)
                .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.lg, style: .continuous))
                .overlay(RoundedRectangle(cornerRadius: Theme.Radius.lg, style: .continuous)
                    .stroke(on ? Color.clear : Theme.Colors.border, lineWidth: 1))
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(on ? .isSelected : [])
    }
}
