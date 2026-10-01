// The app's frame, after the web's AppShell on a phone: the top bar (the
// mark, the bell, the light/dark switch, your picture), the bottom bar (Home,
// Transactions, Groups, Budgets, More: the web's icons and words, the lit one
// in the accent) and the floating Add on the pages that have it; and every
// page's header (PageHeader: the eyebrow, the back arrow, the title, its
// controls) instead of a navigation bar.
import SwiftUI
import UIKit

// MARK: Appearance

/// Light or dark, as the web's ThemeToggle keeps it (per device); nil
/// follows the system until the switch is first used.
@Observable
final class AppAppearance: @unchecked Sendable {
    private static let key = "budgeer.appearance"
    private let defaults: UserDefaults
    var stored: String?

    init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
        stored = defaults.string(forKey: AppAppearance.key)
    }

    var scheme: ColorScheme? {
        switch stored {
        case "light": return .light
        case "dark": return .dark
        default: return nil
        }
    }

    /// The switch: to the other of what is showing now.
    func toggle(from current: ColorScheme) {
        set(current == .dark ? "light" : "dark")
    }

    /// Settings › Appearance: 'light', 'dark', or nil for the system's.
    func set(_ value: String?) {
        stored = value
        defaults.set(value, forKey: AppAppearance.key)
    }
}

// MARK: The mark

/// Budgeer's mark (public/budgeer-mark.svg, markGeometry.js): a lowercase b
/// whose bowl is a budget ring, amber then coral, drawn on a 48-unit grid.
struct BrandMark: View {
    var size: CGFloat = 26

    var body: some View {
        Canvas { context, canvas in
            let unit = canvas.width / 48
            let stem = CGRect(x: 9.25 * unit, y: 3.6 * unit, width: 7.5 * unit, height: 29.4 * unit)
            context.fill(Path(roundedRect: stem, cornerRadius: 3.75 * unit), with: .color(Theme.Palette.brand500))
            let center = CGPoint(x: 24 * unit, y: 29.6 * unit)
            let radius = 11 * unit
            let circumference = 2 * Double.pi * 11
            // The SVG's dashes (19 then 48.2 from 21) as turns from the top, clockwise.
            func arc(_ from: Double, _ length: Double, _ color: Color) {
                var path = Path()
                let start = -Double.pi / 2 + from / circumference * 2 * Double.pi
                let end = start + length / circumference * 2 * Double.pi
                path.addArc(center: center, radius: radius, startAngle: .radians(start), endAngle: .radians(end), clockwise: false)
                context.stroke(path, with: .color(color), style: StrokeStyle(lineWidth: 7.5 * unit))
            }
            arc(0, 19, Theme.Palette.amber400)
            arc(21, 48.2, Theme.Palette.brand500)
        }
        .frame(width: size, height: size)
        .accessibilityLabel("Budgeer")
    }
}

// MARK: Top bar

/// A person's picture in the bar (UserAvatar, sm, highlight): the initials
/// (avatarLook's) on the accent.
struct ShellAvatar: View {
    let initials: String
    var size: CGFloat = 32

    var body: some View {
        Text(initials)
            .font(.system(size: size * 0.4, weight: .medium))
            .foregroundStyle(Color.white)
            .frame(width: size, height: size)
            .background(Theme.Colors.accentSolid)
            .clipShape(Circle())
    }
}

/// The phone's top bar: the mark, then the bell (its unread badge), the
/// light/dark switch and your picture, 16 pt apart, on the surface over a
/// hairline.
struct ShellHeader: View {
    /// The badge's words (bellMath.badgeText), nil with nothing unread.
    let unread: String?
    let unreadCount: Int
    let initials: String
    let onBell: () -> Void
    let onAvatar: () -> Void
    @Environment(AppLanguage.self) private var language
    @Environment(AppAppearance.self) private var appearance
    @Environment(\.colorScheme) private var scheme

    var body: some View {
        HStack(spacing: Theme.Space.s3) {
            BrandMark(size: 26)
            Spacer(minLength: 0)
            HStack(spacing: Theme.Space.s4) {
                Button(action: onBell) {
                    LucideIcon(icon: .bell, size: 18)
                        .foregroundStyle(Theme.Colors.textMuted)
                        .frame(width: 32, height: 32)
                        .overlay(alignment: .topTrailing) {
                            if let unread {
                                Text(unread)
                                    .font(.system(size: 9.6, weight: .bold))
                                    .foregroundStyle(Color.white)
                                    .padding(.horizontal, 4)
                                    .frame(minWidth: 16, minHeight: 16)
                                    .background(Theme.Colors.accentSolid)
                                    .clipShape(Capsule())
                                    .offset(x: 2, y: -2)
                            }
                        }
                        .frame(width: 44, height: 44)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityLabel(unread == nil ? language.t("notifications:bell.title")
                                    : language.t("notifications:bell.labelUnread", ["count": .int(unreadCount)]))
                .accessibilityIdentifier("shell.bell")
                Button {
                    appearance.toggle(from: scheme)
                } label: {
                    LucideIcon(icon: scheme == .dark ? .sun : .moon, size: 18)
                        .foregroundStyle(Theme.Colors.textMuted)
                        .frame(width: 32, height: 32)
                        .frame(width: 44, height: 44)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityLabel(language.t("shell:toggleTheme"))
                Button(action: onAvatar) {
                    ShellAvatar(initials: initials).frame(width: 44, height: 44).contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityLabel(language.t("shell:nav.settings"))
            }
            .padding(.vertical, -6)
        }
        .padding(.horizontal, Theme.Space.s4)
        .padding(.vertical, Theme.Space.s3)
        .background(Theme.Colors.surface.ignoresSafeArea(edges: .top))
        .overlay(alignment: .bottom) { Rectangle().fill(Theme.Colors.border).frame(height: 1) }
    }
}

// MARK: Bottom bar

/// The five destinations of the phone's bottom bar (AppShell MOBILE_NAV).
enum AppTab: String, CaseIterable, Hashable {
    case home, transactions, groups, budgets, more

    /// The web's route for the tab (navMatch's pathnames).
    var path: String {
        switch self {
        case .home: return "/"
        case .transactions: return "/transactions"
        case .groups: return "/groups"
        case .budgets: return "/budgets"
        case .more: return "/more"
        }
    }

    var icon: Lucide {
        switch self {
        case .home: return .layoutDashboard
        case .transactions: return .receiptText
        case .groups: return .users
        case .budgets: return .target
        case .more: return .moreHorizontal
        }
    }
}

/// The bottom bar: an icon (22 pt) over a 10 pt word per tab, the lit one in
/// the accent with the heavier stroke; the surface over a hairline.
struct BottomNav: View {
    let selected: AppTab
    let select: (AppTab) -> Void
    @Environment(AppLanguage.self) private var language

    var body: some View {
        HStack(spacing: 0) {
            ForEach(AppTab.allCases, id: \.self) { tab in
                let on = tab == selected
                Button { select(tab) } label: {
                    VStack(spacing: 2) {
                        LucideIcon(icon: tab.icon, size: 22, bold: on)
                        Text(language.t("shell:nav.\(tab.rawValue)"))
                            .font(Theme.Fonts.body(10, weight: on ? .semibold : .regular, lang: language.current))
                            .lineLimit(1)
                            .minimumScaleFactor(0.8)
                    }
                    .foregroundStyle(on ? Theme.Colors.accentFg : Theme.Colors.textMuted)
                    .padding(.horizontal, Theme.Space.s2)
                    .padding(.vertical, Theme.Space.s1)
                    .frame(minWidth: 60)
                    .frame(maxWidth: .infinity)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityAddTraits(on ? .isSelected : [])
                .accessibilityIdentifier("tab.\(tab.rawValue)")
            }
        }
        .padding(.horizontal, Theme.Space.s2)
        .padding(.top, 6)
        .padding(.bottom, 6)
        .background(Theme.Colors.surface.ignoresSafeArea(edges: .bottom))
        .overlay(alignment: .top) { Rectangle().fill(Theme.Colors.border).frame(height: 1) }
    }
}

/// The floating Add expense (AddExpenseFab): a 56 pt coral circle with the
/// heavier plus, 16 pt from the edge and above the bottom bar.
struct AddFab: View {
    let action: () -> Void
    @Environment(AppLanguage.self) private var language

    var body: some View {
        Button(action: action) {
            LucideIcon(icon: .plus, size: 26, bold: true)
                .foregroundStyle(Color.white)
                .frame(width: 56, height: 56)
                .background(Theme.Colors.accentSolid)
                .clipShape(Circle())
                .shadow(color: Color.black.opacity(0.1), radius: 7, y: 10)
                .shadow(color: Color.black.opacity(0.05), radius: 3, y: 4)
        }
        .buttonStyle(.plain)
        .accessibilityLabel(language.t("shell:addExpense"))
        .accessibilityIdentifier("add")
    }
}

// MARK: Page header and page

/// A page's header (PageHeader): the eyebrow over the title (24 pt, -0.02em)
/// with the back arrow before it, and the page's controls at the end.
struct PageHeader<Action: View>: View {
    let title: String
    var eyebrow: String? = nil
    var back: (() -> Void)? = nil
    @ViewBuilder var action: () -> Action
    @Environment(AppLanguage.self) private var language

    var body: some View {
        HStack(alignment: .center, spacing: Theme.Space.s3) {
            if let back {
                Button(action: back) {
                    LucideIcon(icon: .arrowLeft, size: 18)
                        .foregroundStyle(Theme.Colors.textMuted)
                        .frame(width: 32, height: 32)
                        .frame(width: 44, height: 44)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .padding(.leading, -6)
                .padding(.trailing, -6)
                .padding(.top, eyebrow == nil ? 0 : 18)
                .accessibilityLabel(language.t("common:actions.back"))
                .accessibilityIdentifier("page.back")
            }
            VStack(alignment: .leading, spacing: 2) {
                if let eyebrow { Eyebrow(text: eyebrow) }
                Text(title)
                    .kitHeading(24, tracking: -0.02)
                    .fixedSize(horizontal: false, vertical: true)
                    .accessibilityAddTraits(.isHeader)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            HStack(spacing: 14) { action() }
        }
    }
}

extension PageHeader where Action == EmptyView {
    init(title: String, eyebrow: String? = nil, back: (() -> Void)? = nil) {
        self.init(title: title, eyebrow: eyebrow, back: back, action: { EmptyView() })
    }
}

/// A page's controls in its header (PageAction on a phone): the solid
/// 32 pt square with the icon.
struct PageAction: View {
    let icon: Lucide
    let label: String
    let action: () -> Void

    var body: some View {
        KitIconButton(icon: icon, label: label, variant: .solid, size: .sm, iconSize: 16, action: action)
            .padding(.horizontal, -6)
    }
}

/// A page: the canvas, the column 16 pt in from the edges with 20 pt between
/// its cards, room at the end for the bottom bar (and the floating Add),
/// pull to refresh; and no navigation bar (the page draws its header).
struct Page<Content: View>: View {
    var fab = false
    var refresh: (() async -> Void)? = nil
    @ViewBuilder var content: () -> Content

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: Theme.Space.s5) {
                content()
            }
            .padding(.horizontal, Theme.Space.s4)
            .padding(.top, Theme.Space.s4)
            .padding(.bottom, fab ? 88 : Theme.Space.s8)
        }
        .refreshable { await refresh?() }
        .scrollDismissesKeyboard(.interactively)
        .background(Theme.Colors.canvas.ignoresSafeArea())
        .toolbar(.hidden, for: .navigationBar)
    }
}

// The pages hide the navigation bar (they draw the web's header); keep the
// edge swipe that goes back.
extension UINavigationController: UIGestureRecognizerDelegate {
    override open func viewDidLoad() {
        super.viewDidLoad()
        interactivePopGestureRecognizer?.delegate = self
    }

    public func gestureRecognizerShouldBegin(_ gestureRecognizer: UIGestureRecognizer) -> Bool {
        viewControllers.count > 1
    }
}

// MARK: The frame

/// The phone frame around a tab's pages: the top bar, the page, the bottom
/// bar with `tab` lit, and the floating Add when the page has it.
struct ShellChrome<Content: View>: View {
    let tab: AppTab
    var badge: String? = nil
    var unreadCount = 0
    var initials = ""
    var fab = false
    var onBell: () -> Void = {}
    var onAvatar: () -> Void = {}
    var onTab: (AppTab) -> Void = { _ in }
    var onAdd: () -> Void = {}
    @ViewBuilder var content: () -> Content

    var body: some View {
        VStack(spacing: 0) {
            ShellHeader(unread: badge, unreadCount: unreadCount, initials: initials, onBell: onBell, onAvatar: onAvatar)
            ZStack(alignment: .bottomTrailing) {
                content()
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                if fab {
                    AddFab(action: onAdd)
                        .padding(.trailing, Theme.Space.s4)
                        .padding(.bottom, Theme.Space.s4)
                }
            }
            BottomNav(selected: tab, select: onTab)
        }
        .background(Theme.Colors.canvas.ignoresSafeArea())
    }
}
