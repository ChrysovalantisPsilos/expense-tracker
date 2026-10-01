// More, as an iOS Settings-style list: you at the top (Settings), then the
// pages the tabs don't hold: Money (Budgets, Savings, Recurring, Categories,
// and Meal vouchers once they're set up, as on the web) and Insights. Plan
// and Your salary join here as their pages are built. Settings is its own
// page (Settings/SettingsView).
import SwiftUI

@MainActor
struct MoreView: View {
    let name: String
    let email: String
    let initials: String
    /// Meal vouchers are set up: their page joins Money.
    var vouchers = false
    let chrome: PageChrome
    @Environment(AppLanguage.self) private var language

    var body: some View {
        List {
            Section {
                NavigationLink(value: AppRoute.settings) {
                    HStack(spacing: 14) {
                        Text(initials)
                            .font(.system(size: 22, weight: .semibold))
                            .foregroundStyle(Color.white)
                            .frame(width: 58, height: 58)
                            .background(NativeStyle.solid, in: Circle())
                        VStack(alignment: .leading, spacing: 2) {
                            Text(name.isEmpty ? email : name).font(.title3.weight(.semibold)).lineLimit(1)
                            if !name.isEmpty { Text(email).font(.subheadline).foregroundStyle(.secondary).lineLimit(1) }
                            Text(language.t("shell:more.settings")).font(.footnote).foregroundStyle(.secondary).lineLimit(2)
                        }
                    }
                    .padding(.vertical, 6)
                }
                .accessibilityIdentifier("more.settings")
            }
            .listRowBackground(NativeStyle.card)

            Section {
                row(.budgets, symbol: "chart.pie.fill", color: NativeStyle.coral, title: "shell:nav.budgets", id: "more.budgets")
                row(.savings, symbol: "banknote.fill", color: Color(hex: 0x2E9B62), title: "shell:nav.savings",
                    subtitle: "shell:more.savings", id: "more.savings")
                row(.recurring, symbol: "arrow.triangle.2.circlepath", color: Color(hex: 0x8558D0),
                    title: "shell:nav.recurring", subtitle: "shell:more.recurring", id: "more.recurring")
                row(.categoryList, symbol: "tag.fill", color: Color(hex: 0x16939A), title: "settings:rows.categories.label",
                    subtitle: "settings:rows.categories.desc", id: "more.categories")
                if vouchers {
                    row(.vouchers, symbol: "ticket.fill", color: Color(hex: 0xC98A0B), title: "shell:nav.vouchers",
                        subtitle: "shell:more.vouchers", id: "more.vouchers")
                }
            } header: {
                NativeCapsHeader(title: language.t("shell:more.money"))
            }
            .listRowBackground(NativeStyle.card)

            Section {
                row(.insights, symbol: "chart.xyaxis.line", color: Color(hex: 0xD24D8A), title: "shell:nav.insights",
                    subtitle: "shell:more.insights", id: "more.insights")
            } header: {
                NativeCapsHeader(title: language.t("insights:title"))
            }
            .listRowBackground(NativeStyle.card)
        }
        .listStyle(.insetGrouped)
        .listSectionSpacing(20)
        .scrollContentBackground(.hidden)
        .background(NativeStyle.canvas)
        .nativeTabBarRoom()
        .navigationTitle(language.t("shell:nav.more"))
        .pageChrome(chrome)
    }

    private func row(_ route: AppRoute, symbol: String, color: Color, title: String, subtitle: String? = nil,
                     id: String) -> some View {
        NavigationLink(value: route) {
            HStack(spacing: 14) {
                NativeIconTile(symbol: symbol, color: color)
                VStack(alignment: .leading, spacing: 1) {
                    Text(language.t(title))
                    if let subtitle { Text(language.t(subtitle)).font(.footnote).foregroundStyle(.secondary) }
                }
            }
        }
        .accessibilityIdentifier(id)
    }

    /// "0.1.0 (1)" from Info.plist.
    static var version: String {
        let info = Bundle.main.infoDictionary ?? [:]
        let short = info["CFBundleShortVersionString"] as? String ?? "0"
        let build = info["CFBundleVersion"] as? String ?? "0"
        return "\(short) (\(build))"
    }
}
