// The redesign's frame: four tabs (Home, Activity, Groups, More) in a
// floating bar, and Add beside it as its own round glass button that opens
// the Add sheet. On iOS 26 this is the system's Liquid Glass tab bar (it
// shrinks while you scroll down), with Add in the bar's separate trailing
// slot, the place iOS gives a tab bar's one distinct action. On iOS 17–18 a
// bar of the same shape is drawn in the standard material.
import SwiftUI

enum NativeTab: Hashable, CaseIterable {
    case home, activity, groups, more, add

    /// The four tabs, in order (Add is the separate button).
    static let tabs: [NativeTab] = [.home, .activity, .groups, .more]

    var symbol: String {
        switch self {
        case .home: return "house.fill"
        case .activity: return "list.bullet.rectangle.portrait.fill"
        case .groups: return "person.2.fill"
        case .more: return "ellipsis.circle.fill"
        case .add: return "plus"
        }
    }

    var titleKey: String {
        switch self {
        case .home: return "shell:nav.home"
        case .activity: return "ios:native.tabs.activity"
        case .groups: return "shell:nav.groups"
        case .more: return "shell:nav.more"
        case .add: return "ios:native.tabs.add"
        }
    }
}

/// The tabs with their pages; `onAdd` opens the Add sheet.
struct NativeTabs<Page: View>: View {
    @Binding var tab: NativeTab
    let onAdd: () -> Void
    @ViewBuilder var page: (NativeTab) -> Page

    #if compiler(>=6.2)
    var body: some View {
        if #available(iOS 26.0, *) {
            NativeSystemTabs(tab: $tab, onAdd: onAdd, page: page)
        } else {
            NativeDrawnTabs(tab: $tab, onAdd: onAdd, page: page)
        }
    }
    #else
    var body: some View {
        NativeDrawnTabs(tab: $tab, onAdd: onAdd, page: page)
    }
    #endif
}

#if compiler(>=6.2)
/// iOS 26: the system tab bar in Liquid Glass. Add sits in the separate
/// trailing slot (the search role's place); choosing it opens the sheet and
/// leaves the current tab where it was.
@available(iOS 26.0, *)
struct NativeSystemTabs<Page: View>: View {
    @Binding var tab: NativeTab
    let onAdd: () -> Void
    @ViewBuilder var page: (NativeTab) -> Page
    @Environment(AppLanguage.self) private var language

    var body: some View {
        TabView(selection: Binding(get: { tab }, set: { picked in
            if picked == .add { onAdd() } else { tab = picked }
        })) {
            ForEach(NativeTab.tabs, id: \.self) { item in
                Tab(language.t(item.titleKey), systemImage: item.symbol, value: item) {
                    page(item)
                }
            }
            Tab(language.t(NativeTab.add.titleKey), systemImage: NativeTab.add.symbol, value: NativeTab.add, role: .search) {
                Color.clear
            }
        }
        .tabBarMinimizeBehavior(.onScrollDown)
    }
}
#endif

/// iOS 17–18: the same arrangement drawn by hand (a material capsule of four
/// tabs, and the round Add in the accent), floating over the page.
struct NativeDrawnTabs<Page: View>: View {
    @Binding var tab: NativeTab
    let onAdd: () -> Void
    @ViewBuilder var page: (NativeTab) -> Page

    var body: some View {
        page(tab)
            .safeAreaInset(edge: .bottom, spacing: 0) {
                NativeFloatingTabBar(tab: $tab, onAdd: onAdd)
            }
    }
}

/// The floating bar: the four tabs in a capsule (the lit one on a soft lens,
/// in the tint) and Add in its own circle beside it. Every target is at least 52 pt.
struct NativeFloatingTabBar: View {
    @Binding var tab: NativeTab
    let onAdd: () -> Void
    @Environment(AppLanguage.self) private var language

    var body: some View {
        HStack(spacing: 10) {
            HStack(spacing: 0) {
                ForEach(NativeTab.tabs, id: \.self) { item in
                    Button {
                        tab = item
                    } label: {
                        VStack(spacing: 3) {
                            Image(systemName: item.symbol)
                                .font(.system(size: 18, weight: .semibold))
                                .frame(height: 22)
                            Text(language.t(item.titleKey))
                                .font(.system(size: 10, weight: .semibold))
                                .lineLimit(1)
                                .minimumScaleFactor(0.75)
                        }
                        .foregroundStyle(item == tab ? NativeStyle.tint : Color.primary)
                        .frame(maxWidth: .infinity, minHeight: 54)
                        .background {
                            if item == tab {
                                Capsule().fill(Color.primary.opacity(0.07))
                            }
                        }
                        .contentShape(Capsule())
                    }
                    .buttonStyle(.plain)
                    .accessibilityAddTraits(item == tab ? .isSelected : [])
                }
            }
            .padding(4)
            .nativeGlass(Capsule())

            Button(action: onAdd) {
                Image(systemName: "plus")
                    .font(.system(size: 22, weight: .semibold))
                    .foregroundStyle(Color.white)
                    .frame(width: 62, height: 62)
                    .nativeGlass(Circle(), tint: NativeStyle.solid, interactive: true)
            }
            .buttonStyle(.plain)
            .accessibilityLabel(language.t(NativeTab.add.titleKey))
        }
        .padding(.horizontal, 16)
        .padding(.top, 6)
        .padding(.bottom, 4)
        .sensoryFeedback(.selection, trigger: tab)
    }
}
