// More, redesigned as an iOS Settings-style list: you at the top (your
// profile and settings), then a home for every page the tabs don't hold:
// Money (Budgets, Recurring, Savings, Plan, Meal vouchers, Your salary),
// Insights and Categories, the tools (Import, Backup), the app's own
// switches (Notifications, Language, Face ID lock, Widgets, Siri &
// Shortcuts, AI helpers, Privacy), Help, and Sign out.
import SwiftUI

struct NativeMoreView: View {
    let sample: NativeSample
    @Environment(AppLanguage.self) private var language
    @State private var faceId = true

    private struct Item: Identifiable {
        let id: String
        let symbol: String
        let color: Color
        let title: String
        var value: String? = nil
    }

    var body: some View {
        NavigationStack {
            List {
                Section {
                    NavigationLink {
                        NativeListPage(title: language.t("settings:title")) { EmptyView() }
                    } label: {
                        HStack(spacing: 14) {
                            NativeAvatar(avatar: sample.me, size: 58)
                            VStack(alignment: .leading, spacing: 2) {
                                Text(sample.name).font(.title3.weight(.semibold))
                                Text(sample.email).font(.subheadline).foregroundStyle(.secondary)
                                Text(language.t("shell:more.settings"))
                                    .font(.footnote)
                                    .foregroundStyle(.secondary)
                                    .lineLimit(2)
                            }
                        }
                        .padding(.vertical, 6)
                    }
                }

                section(language.t("shell:more.money"), [
                    Item(id: "budgets", symbol: "chart.pie.fill", color: NativeStyle.coral, title: language.t("shell:nav.budgets")),
                    Item(id: "recurring", symbol: "arrow.triangle.2.circlepath", color: Color(hex: 0x8558D0),
                         title: language.t("shell:nav.recurring")),
                    Item(id: "savings", symbol: "banknote.fill", color: Color(hex: 0x2E9B62), title: language.t("shell:nav.savings")),
                    Item(id: "plan", symbol: "wand.and.stars", color: Color(hex: 0x3A78D4), title: language.t("shell:nav.plan")),
                    Item(id: "vouchers", symbol: "fork.knife", color: NativeStyle.amber, title: language.t("shell:nav.vouchers")),
                    Item(id: "salary", symbol: "briefcase.fill", color: Color(hex: 0x16939A), title: language.t("salary:title")),
                ])

                section(language.t("insights:title"), [
                    Item(id: "insights", symbol: "chart.xyaxis.line", color: Color(hex: 0xD24D8A), title: language.t("insights:title")),
                    Item(id: "categories", symbol: "square.grid.2x2.fill", color: Color(hex: 0xC98A0B),
                         title: language.t("settings:rows.categories.label")),
                ])

                section(language.t("ios:native.more.tools"), [
                    Item(id: "import", symbol: "square.and.arrow.down.fill", color: Color(hex: 0x3A78D4),
                         title: language.t("import:title")),
                    Item(id: "backup", symbol: "externaldrive.fill", color: Color(hex: 0x6B7280),
                         title: language.t("ios:native.more.backup")),
                ])

                Section {
                    row(Item(id: "notifications", symbol: "bell.badge.fill", color: Color(hex: 0xE4572E),
                             title: language.t("settings:rows.notifications.label")))
                    row(Item(id: "language", symbol: "globe", color: Color(hex: 0x3A78D4),
                             title: language.t("settings:rows.language.label"), value: sample.languageName))
                    Toggle(isOn: $faceId) {
                        HStack(spacing: 14) {
                            NativeIconTile(symbol: "faceid", color: Color(hex: 0x2E9B62))
                            Text(language.t("ios:native.more.faceId"))
                        }
                    }
                    .tint(NativeStyle.positive)
                    row(Item(id: "widgets", symbol: "square.text.square.fill", color: Color(hex: 0x8558D0),
                             title: language.t("ios:native.more.widgets")))
                    row(Item(id: "shortcuts", symbol: "waveform", color: Color(hex: 0x16939A),
                             title: language.t("ios:native.more.shortcuts")))
                    row(Item(id: "ai", symbol: "sparkles", color: NativeStyle.coral, title: language.t("settings:rows.ai.label")))
                    row(Item(id: "privacy", symbol: "hand.raised.fill", color: Color(hex: 0x3A78D4),
                             title: language.t("settings:rows.privacy.label")))
                } header: {
                    Text(language.t("ios:native.more.app"))
                }
                .listRowBackground(NativeStyle.card)

                section(language.t("settings:sections.help"), [
                    Item(id: "help", symbol: "questionmark.circle.fill", color: Color(hex: 0x6B7280),
                         title: language.t("settings:rows.help.label")),
                    Item(id: "whatsnew", symbol: "gift.fill", color: Color(hex: 0xD24D8A),
                         title: language.t("settings:rows.whatsNew.label")),
                ])

                Section {
                    Button(role: .destructive) {} label: {
                        Text(language.t("settings:rows.signOut.label"))
                            .frame(maxWidth: .infinity)
                    }
                }
                .listRowBackground(NativeStyle.card)
            }
            .listStyle(.insetGrouped)
            .listSectionSpacing(20)
            .scrollContentBackground(.hidden)
            .background(NativeStyle.canvas)
            .nativeTabBarRoom()
            .navigationTitle(language.t("shell:nav.more"))
            .toolbar {
                NativeAccountItems(me: sample.me, unread: true, bellLabel: language.t("notifications:bell.title"),
                                   profileLabel: language.t("ios:native.home.profile"))
            }
        }
    }

    private func section(_ title: String, _ items: [Item]) -> some View {
        Section {
            ForEach(items) { row($0) }
        } header: {
            Text(title)
        }
        .listRowBackground(NativeStyle.card)
    }

    private func row(_ item: Item) -> some View {
        NavigationLink {
            NativeListPage(title: item.title) { EmptyView() }
        } label: {
            HStack(spacing: 14) {
                NativeIconTile(symbol: item.symbol, color: item.color)
                Text(item.title).lineLimit(1)
                if let value = item.value {
                    Spacer(minLength: 8)
                    Text(value).foregroundStyle(.secondary)
                }
            }
        }
    }
}
