// The frame of a regular-width window (an iPad, a wide Split View or Stage
// Manager window): a sidebar like the website's desktop one (AppShell.jsx),
// the brand at its top, then Home, Activity and Groups (with how many you're
// in), Budgets, Recurring and Plan, Insights, Savings and Meal vouchers
// (once set up), and Settings with your profile at its foot; the section's
// page beside it. Activity and Groups put their list between the two
// (NavigationSplitView's three columns), the entry or group picked in it on
// the right. In portrait the sidebar tucks away behind its button, as iPad
// apps do. The words are the web's (src/locales).
import SwiftUI

/// Who's signed in, at the sidebar's foot.
struct SidebarProfile {
    let name: String
    let email: String
    let initials: String
    var avatar: Avatar? = nil
}

@MainActor
struct SidebarFrame<ListColumn: View, Detail: View>: View {
    @Binding var section: SidebarSection
    let items: [SidebarSection]
    /// How many groups you're in (the Groups row's count), nil before they're read.
    let groups: Int?
    let profile: SidebarProfile
    @ViewBuilder var list: () -> ListColumn
    @ViewBuilder var detail: () -> Detail
    @State private var columns: NavigationSplitViewVisibility

    init(section: Binding<SidebarSection>, items: [SidebarSection], groups: Int?, profile: SidebarProfile,
         columns: NavigationSplitViewVisibility = .automatic, @ViewBuilder list: @escaping () -> ListColumn,
         @ViewBuilder detail: @escaping () -> Detail) {
        _section = section
        self.items = items
        self.groups = groups
        self.profile = profile
        self.list = list
        self.detail = detail
        _columns = State(initialValue: columns)
    }

    var body: some View {
        Group {
            if section.hasList {
                NavigationSplitView(columnVisibility: $columns) {
                    sidebar
                } content: {
                    list()
                        .navigationSplitViewColumnWidth(min: 320, ideal: 380, max: 440)
                } detail: {
                    detail()
                }
            } else {
                NavigationSplitView(columnVisibility: $columns) {
                    sidebar
                } detail: {
                    detail()
                }
            }
        }
        .navigationSplitViewStyle(.balanced)
    }

    private var sidebar: some View {
        SidebarList(section: $section, items: items, groups: groups, profile: profile)
            .navigationSplitViewColumnWidth(min: 240, ideal: 280, max: 320)
    }
}

/// The sidebar itself: the brand, the sections in their blocks, Settings and you.
@MainActor
struct SidebarList: View {
    @Binding var section: SidebarSection
    let items: [SidebarSection]
    let groups: Int?
    let profile: SidebarProfile
    @Environment(AppLanguage.self) private var language

    var body: some View {
        List(selection: Binding<SidebarSection?>(get: { section }, set: { picked in
            if let picked { section = picked }
        })) {
            // The brand heads the list (a bar item would be clipped to its glass).
            brand
                .listRowBackground(Color.clear)
                .listRowSeparator(.hidden)
                .selectionDisabled()
            ForEach(Array(SidebarSection.blocks(items).enumerated()), id: \.offset) { _, block in
                Section {
                    ForEach(block) { item in row(item) }
                }
            }
        }
        .listStyle(.sidebar)
        .safeAreaInset(edge: .bottom, spacing: 0) { foot }
        .navigationBarTitleDisplayMode(.inline)
    }

    private func row(_ item: SidebarSection) -> some View {
        Label(language.t(item.titleKey), systemImage: item.symbol)
            .badge(item == .groups ? groups ?? 0 : 0)
            .tag(item)
            .accessibilityIdentifier("sidebar.\(item.rawValue)")
    }

    /// The mark and the wordmark, as the website's sidebar starts.
    private var brand: some View {
        HStack(spacing: 8) {
            BrandMark(size: 26)
            Text(verbatim: BrandIntro.intro.wordmark)
                .font(.custom("Poppins-Bold", size: 22, relativeTo: .title2))
                .tracking(-0.44)
                .foregroundStyle(Color.primary)
                .fixedSize()
        }
        .padding(.vertical, 4)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(Text(verbatim: "Budgeer"))
        .accessibilityAddTraits(.isHeader)
    }

    /// Settings, then you (your picture, name and email), both opening Settings.
    private var foot: some View {
        VStack(alignment: .leading, spacing: 2) {
            Button { section = .settings } label: {
                Label(language.t(SidebarSection.settings.titleKey), systemImage: SidebarSection.settings.symbol)
                    .font(.body)
                    .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
                    .padding(.horizontal, 12)
                    .foregroundStyle(section == .settings ? NativeStyle.tint : Color.primary)
                    .background(section == .settings ? Theme.Colors.accentSubtle : Color.clear,
                                in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityAddTraits(section == .settings ? .isSelected : [])
            .accessibilityIdentifier("sidebar.settings")
            Button { section = .settings } label: {
                HStack(spacing: 10) {
                    NativeProfileCircle(initials: profile.initials, avatar: profile.avatar, size: 36)
                    VStack(alignment: .leading, spacing: 1) {
                        Text(profile.name).font(.subheadline.weight(.semibold)).lineLimit(1)
                        Text(profile.email).font(.caption).foregroundStyle(.secondary).lineLimit(1)
                    }
                    Spacer(minLength: 0)
                }
                .padding(.horizontal, 12)
                .padding(.vertical, 8)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel(language.t("ios:native.profile"))
            .accessibilityIdentifier("sidebar.profile")
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 10)
    }
}

extension View {
    /// Beside the sidebar, a page that would stretch across a wide window
    /// keeps a readable width, centred on the canvas.
    func wideColumn(_ width: CGFloat = 860) -> some View {
        frame(maxWidth: width)
            .frame(maxWidth: .infinity)
            .background(NativeStyle.canvas.ignoresSafeArea())
    }
}
