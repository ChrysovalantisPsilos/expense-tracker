// More, as an iOS Settings-style list: you at the top (your picture, name
// and email over "Account & settings": the one way in to Settings), then
// the pages the tabs don't hold: Money (Budgets, Savings, Recurring, Plan,
// and Meal vouchers once they're set up, as on the web) and Insights (Your
// salary opens from its card there, as on the web). Categories live in
// Settings only (configuration has one home); Settings is its own page
// (Settings/SettingsView).
import SwiftUI

@MainActor
struct MoreView: View {
    /// Meal vouchers are set up: their page joins Money.
    var vouchers = false
    let chrome: PageChrome
    @Environment(AppLanguage.self) private var language

    var body: some View {
        List {
            Section {
                row(.budgets, symbol: "chart.pie.fill", title: "shell:nav.budgets", id: "more.budgets")
                row(.savings, symbol: "banknote.fill", tone: NativeTone.green, title: "shell:nav.savings",
                    subtitle: "shell:more.savings", id: "more.savings")
                row(.recurring, symbol: "arrow.triangle.2.circlepath", title: "shell:nav.recurring",
                    subtitle: "shell:more.recurring", id: "more.recurring")
                row(.plan, symbol: "slider.horizontal.3", title: "shell:nav.plan", subtitle: "shell:more.plan", id: "more.plan")
                if vouchers {
                    row(.vouchers, symbol: "ticket.fill", tone: NativeTone.amber, title: "shell:nav.vouchers",
                        subtitle: "shell:more.vouchers", id: "more.vouchers")
                }
            } header: {
                NativeCapsHeader(title: language.t("shell:more.money"))
            }
            .listRowBackground(NativeStyle.card)

            Section {
                row(.insights, symbol: "chart.xyaxis.line", title: "shell:nav.insights", subtitle: "shell:more.insights",
                    id: "more.insights")
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

    private func row(_ route: AppRoute, symbol: String, tone: Color = NativeTone.coral, title: String,
                     subtitle: String? = nil, id: String) -> some View {
        NavigationLink(value: route) {
            HStack(spacing: 14) {
                NativeIconTile(symbol: symbol, color: tone)
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
