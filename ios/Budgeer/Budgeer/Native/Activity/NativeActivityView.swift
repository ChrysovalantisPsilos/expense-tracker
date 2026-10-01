// Activity (the web's Transactions), redesigned: every entry by day under
// sticky day headers, with a search field in the bar and a floating glass
// pill to switch the month and the kind. Swipe left to delete (asks first);
// swipe right for Duplicate and Split with a group. Tapping a row opens it
// for editing. No ⋮ buttons and no long-press menu.
import SwiftUI

/// Which row a picture shows half-swiped (the mockups only: a swipe can't be
/// held still for a snapshot, so its open state is drawn).
enum NativeSwipePreview: Equatable {
    case none
    case open(delete: String, actions: String)
}

struct NativeActivityView: View {
    let sample: NativeSample
    var preview: NativeSwipePreview = .none
    var confirming: String? = nil
    @Environment(AppLanguage.self) private var language
    @State private var query = ""
    @State private var kind = "all"
    @State private var pendingDelete: NativeSample.Entry?
    @State private var deleted = 0

    var body: some View {
        NavigationStack {
            List {
                ForEach(sample.days) { day in
                    Section {
                        ForEach(day.entries) { entry in
                            row(entry)
                        }
                    } header: {
                        HStack {
                            Text(day.title)
                                .font(.subheadline.weight(.semibold))
                                .foregroundStyle(Color.primary)
                            Spacer()
                            Text(day.total)
                                .font(.footnote)
                                .foregroundStyle(.secondary)
                                .monospacedDigit()
                        }
                        .textCase(nil)
                    }
                }
            }
            .listStyle(.plain)
            .scrollContentBackground(.hidden)
            .background(NativeStyle.card)
            .navigationTitle(language.t("ios:native.tabs.activity"))
            .searchable(text: $query, placement: .navigationBarDrawer(displayMode: .always),
                        prompt: language.t("ios:native.activity.search"))
            .toolbar {
                NativeAccountItems(me: sample.me, unread: true, bellLabel: language.t("notifications:bell.title"),
                                   profileLabel: language.t("ios:native.home.profile"))
            }
            .safeAreaInset(edge: .bottom, spacing: 0) {
                NativeActivityFilter(month: sample.current.title, kind: $kind)
                    .padding(.bottom, 8)
            }
            .confirmationDialog(language.t("ios:native.activity.deleteTitle"),
                                isPresented: Binding(get: { pendingDelete != nil }, set: { if !$0 { pendingDelete = nil } }),
                                titleVisibility: .visible, presenting: pendingDelete) { _ in
                Button(language.t("common:actions.delete"), role: .destructive) {
                    pendingDelete = nil
                    deleted += 1
                }
                Button(language.t("common:actions.cancel"), role: .cancel) { pendingDelete = nil }
            } message: { entry in
                Text(language.t("ios:native.activity.deleteBody", ["name": .string(entry.name)]))
            }
            .sensoryFeedback(.success, trigger: deleted)
            .onAppear {
                if let confirming { pendingDelete = sample.days.flatMap(\.entries).first { $0.id == confirming } }
            }
        }
    }

    @ViewBuilder
    private func row(_ entry: NativeSample.Entry) -> some View {
        switch preview {
        case .open(let delete, _) where delete == entry.id:
            NativeSwipeOpenRow(entry: entry, edge: .trailing)
        case .open(_, let actions) where actions == entry.id:
            NativeSwipeOpenRow(entry: entry, edge: .leading)
        default:
            NavigationLink {
                NativeListPage(title: entry.name) { NativeEntryRow(entry: entry) }
            } label: {
                NativeEntryRow(entry: entry)
            }
            .swipeActions(edge: .trailing, allowsFullSwipe: false) {
                Button(role: .destructive) {
                    pendingDelete = entry
                } label: {
                    Label(language.t("common:actions.delete"), systemImage: "trash")
                }
            }
            .swipeActions(edge: .leading, allowsFullSwipe: true) {
                Button {} label: {
                    Label(language.t("ios:native.activity.duplicate"), systemImage: "plus.square.on.square")
                }
                .tint(Color.gray)
                Button {} label: {
                    Label(language.t("ios:native.activity.split"), systemImage: "person.2.fill")
                }
                .tint(NativeStyle.solid)
            }
        }
    }
}

/// An entry: its badge, its name and category (and the group it was split
/// with, or the repeat mark), and the signed amount, income in green.
struct NativeEntryRow: View {
    let entry: NativeSample.Entry

    var body: some View {
        HStack(spacing: 12) {
            CategoryBadge(look: entry.look, size: 38)
            VStack(alignment: .leading, spacing: 2) {
                Text(entry.name)
                    .font(.body.weight(.medium))
                    .lineLimit(1)
                HStack(spacing: 4) {
                    if entry.repeats {
                        Image(systemName: "repeat")
                            .font(.caption2.weight(.bold))
                    }
                    if let group = entry.group {
                        Image(systemName: "person.2.fill")
                            .font(.caption2)
                        Text(group).lineLimit(1)
                    } else {
                        Text(entry.detail).lineLimit(1)
                    }
                }
                .font(.footnote)
                .foregroundStyle(.secondary)
            }
            Spacer(minLength: 8)
            Text(entry.amount)
                .font(.body.weight(.semibold))
                .foregroundStyle(entry.income ? NativeStyle.positive : Color.primary)
                .monospacedDigit()
        }
        .padding(.vertical, 2)
    }
}

/// A row held open by a swipe, drawn as iOS shows it: slid aside, its
/// actions in full-height coloured buttons.
struct NativeSwipeOpenRow: View {
    let entry: NativeSample.Entry
    let edge: HorizontalEdge
    @Environment(AppLanguage.self) private var language

    var body: some View {
        GeometryReader { proxy in
            HStack(spacing: 0) {
                if edge == .leading {
                    action(language.t("ios:native.activity.duplicate"), "plus.square.on.square", Color.gray)
                    action(language.t("ios:native.activity.split"), "person.2.fill", NativeStyle.solid)
                }
                NativeEntryRow(entry: entry)
                    .padding(.horizontal, 16)
                    .frame(width: proxy.size.width, height: proxy.size.height)
                    .background(NativeStyle.card)
                if edge == .trailing {
                    action(language.t("common:actions.delete"), "trash", Color.red)
                }
            }
            .frame(width: proxy.size.width, height: proxy.size.height, alignment: edge == .leading ? .leading : .trailing)
        }
        .frame(height: 62)
        .clipped()
        .listRowInsets(EdgeInsets())
    }

    private func action(_ title: String, _ symbol: String, _ color: Color) -> some View {
        VStack(spacing: 4) {
            Image(systemName: symbol).font(.system(size: 17, weight: .semibold))
            Text(title)
                .font(.caption.weight(.semibold))
                .lineLimit(1)
                .minimumScaleFactor(0.7)
        }
        .foregroundStyle(Color.white)
        .frame(width: 84)
        .frame(maxHeight: .infinity)
        .background(color)
    }
}

/// The floating pill over the list: the month, and the kind (all, expenses, income).
struct NativeActivityFilter: View {
    let month: String
    @Binding var kind: String
    @Environment(AppLanguage.self) private var language

    var body: some View {
        HStack(spacing: 4) {
            Button {} label: {
                Image(systemName: "chevron.left").frame(width: 40, height: 44)
            }
            .accessibilityLabel(language.t("ios:native.home.prevMonth"))
            Menu {
                Picker("", selection: $kind) {
                    Text(language.t("transactions:ledger.types.all")).tag("all")
                    Text(language.t("transactions:ledger.types.expense")).tag("expense")
                    Text(language.t("transactions:ledger.types.income")).tag("income")
                }
            } label: {
                HStack(spacing: 6) {
                    Text(month)
                        .font(.subheadline.weight(.semibold))
                        .lineLimit(1)
                    Image(systemName: "line.3.horizontal.decrease.circle")
                        .font(.subheadline)
                }
                .foregroundStyle(Color.primary)
                .frame(minHeight: 44)
            }
            Button {} label: {
                Image(systemName: "chevron.right").frame(width: 40, height: 44)
            }
            .accessibilityLabel(language.t("ios:native.home.nextMonth"))
        }
        .font(.subheadline.weight(.semibold))
        .foregroundStyle(NativeStyle.tint)
        .padding(.horizontal, 6)
        .nativeGlass(Capsule(), interactive: true)
    }
}
