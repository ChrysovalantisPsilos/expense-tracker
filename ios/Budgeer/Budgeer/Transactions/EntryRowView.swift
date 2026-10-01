// A transaction row as the web's TransactionList draws it (ItemRow): the
// category badge, the title over the muted line (date · category · savings
// note · notes in italics, the group's tag, the repeat, a yearly payment's
// monthly share, a late salary's month), and the amount with its sign and
// tone, a foreign amount's base value under it. Every word is rowParts'.
import SwiftUI

struct EntryRowView: View {
    let row: EntryRow
    @Environment(AppLanguage.self) private var language

    var body: some View {
        HStack(alignment: .top, spacing: Theme.Space.s3) {
            CategoryBadge(look: row.look)
            VStack(alignment: .leading, spacing: 3) {
                Text(row.title)
                    .font(Theme.Fonts.body(15, weight: .semibold, lang: language.current))
                    .foregroundStyle(Theme.Colors.textPrimary)
                    .lineLimit(2)
                metaLine
                if let group = row.group {
                    Text(group)
                        .font(Theme.Fonts.body(12, weight: .semibold, lang: language.current))
                        .foregroundStyle(Theme.Colors.accentFg)
                        .padding(.horizontal, 6)
                        .padding(.vertical, 2)
                        .background(Theme.Colors.accentSubtle)
                        .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.md))
                }
            }
            Spacer(minLength: Theme.Space.s2)
            VStack(alignment: .trailing, spacing: 2) {
                Text(row.amount)
                    .font(Theme.Fonts.body(15, weight: .bold, lang: language.current))
                    .foregroundStyle(row.tone == "positive" ? Theme.Colors.positive : Theme.Colors.textPrimary)
                    .lineLimit(1)
                if let approx = row.approx {
                    Text([approx, row.estimated].compactMap { $0 }.joined(separator: " · "))
                        .font(Theme.Fonts.body(12, lang: language.current))
                        .foregroundStyle(Theme.Colors.textMuted)
                        .lineLimit(1)
                }
            }
        }
        .padding(.vertical, Theme.Space.s2)
        .contentShape(Rectangle())
        .accessibilityElement(children: .combine)
    }

    /// The muted parts joined by " · " (the web's MetaLine), the notes in italics.
    private var metaLine: some View {
        let before = row.meta.joined(separator: " · ")
        let after = [row.repeats.map { "↻ " + $0 }, row.spread, row.countsFor].compactMap { $0 }.joined(separator: " · ")
        var line = Text(before)
        if let notes = row.notes {
            line = line + Text(before.isEmpty ? "" : " · ") + Text(notes).italic()
        }
        if !after.isEmpty {
            line = line + Text(" · " + after)
        }
        return line
            .font(Theme.Fonts.body(13, lang: language.current))
            .foregroundStyle(Theme.Colors.textMuted)
            .fixedSize(horizontal: false, vertical: true)
    }
}
