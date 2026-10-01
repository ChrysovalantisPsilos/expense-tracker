// The notifications (NotificationBell's list) as a page the bell pushes on
// the tab you're on: each with its icon on a tile, its title, its words and
// when it came; the ones that were new when you opened the page in bold
// with a dot. A tap goes where it leads. Every word is the server's or
// ShellModel's (the core's).
import SwiftUI

@MainActor
struct NotificationsView: View {
    let model: ShellModel
    let open: (BellItem) -> Void
    @Environment(AppLanguage.self) private var language

    var body: some View {
        List {
            if let failed = model.failed, model.items.isEmpty {
                NativeFailed(message: failed) { await model.loadFeed() }
                    .listRowBackground(Color.clear)
            } else if model.items.isEmpty {
                ContentUnavailableView(language.t("notifications:bell.empty"), systemImage: "bell.slash")
                    .listRowBackground(Color.clear)
            } else {
                Section {
                    ForEach(model.items) { item in
                        Button { open(item) } label: { NotificationRow(item: item, fresh: isFresh(item)) }
                            .foregroundStyle(Color.primary)
                            .disabled(item.path == nil)
                            .accessibilityIdentifier("notification.\(item.id)")
                    }
                }
                .listRowBackground(NativeStyle.card)
            }
        }
        .listStyle(.insetGrouped)
        .scrollContentBackground(.hidden)
        .background(NativeStyle.canvas)
        .nativeTabBarRoom()
        .navigationTitle(language.t("notifications:bell.title"))
        .navigationBarTitleDisplayMode(.large)
        .refreshable { await model.loadFeed() }
    }

    private func isFresh(_ item: BellItem) -> Bool {
        !item.read || model.fresh.contains(item.id)
    }
}

/// One notification: its tile, its title (bold and dotted while new), its
/// words and when it came.
struct NotificationRow: View {
    let item: BellItem
    let fresh: Bool

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            NativeIconTile(symbol: NotificationRow.symbol(item.type), color: NotificationRow.colour(item.type), size: 40)
            VStack(alignment: .leading, spacing: 3) {
                HStack(alignment: .firstTextBaseline, spacing: 8) {
                    Text(item.title)
                        .font(.body.weight(fresh ? .semibold : .regular))
                        .lineLimit(2)
                    Spacer(minLength: 4)
                    if let when = item.when {
                        Text(when).font(.caption).foregroundStyle(.secondary).fixedSize()
                    }
                }
                if let body = item.body {
                    Text(body).font(.subheadline).foregroundStyle(.secondary).lineLimit(3)
                }
            }
            Circle()
                .fill(fresh ? NativeStyle.tint : Color.clear)
                .frame(width: 9, height: 9)
                .padding(.top, 6)
                .accessibilityHidden(true)
        }
        .padding(.vertical, 6)
        .accessibilityElement(children: .combine)
    }

    /// The web's icon per notification type (NotificationBell ICON), as an SF Symbol.
    static func symbol(_ type: String) -> String {
        switch type {
        case "invite": return "person.badge.plus"
        case "expense": return "doc.text.fill"
        case "settlement": return "banknote.fill"
        case "comment": return "text.bubble.fill"
        case "reminder": return "calendar.badge.clock"
        case "member_joined": return "person.crop.circle.badge.checkmark"
        case "member_left": return "person.crop.circle.badge.minus"
        case "budget": return "chart.pie.fill"
        case "digest": return "chart.bar.fill"
        case "nudge": return "bell.and.waves.left.and.right.fill"
        default: return "bell.fill"
        }
    }

    /// The tile's colour: the group's things in coral, money matters in
    /// amber, the summaries in green.
    static func colour(_ type: String) -> Color {
        switch type {
        case "budget", "reminder", "nudge": return Theme.Palette.amber400
        case "digest", "settlement": return Color(hex: 0x2E9B62)
        default: return NativeStyle.coral
        }
    }
}
