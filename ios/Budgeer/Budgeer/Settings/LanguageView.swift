// Settings › Language, after the web's LanguageSettings.
import SwiftUI

/// Settings › Language (LanguageSettings): Follow my device (and what it is
/// now), English, Ελληνικά; a choice applies at once and is saved to the profile.
@MainActor
struct LanguageView: View {
    let profiles: ProfileRepository
    @Environment(AppLanguage.self) private var language

    var body: some View {
        List {
            Section {
                ForEach([AppLanguage.system] + AppLanguage.languages, id: \.self) { value in
                    Button {
                        guard value != language.preference else { return }
                        language.preference = value
                        Task { await ProfileLanguage.save(language, profiles: profiles) }
                    } label: {
                        HStack {
                            VStack(alignment: .leading, spacing: 2) {
                                Text(value == AppLanguage.system ? language.t("settings:language.system")
                                     : AppLanguage.nativeNames[value] ?? value)
                                if value == AppLanguage.system {
                                    Text(language.t("settings:language.systemNow",
                                                    ["language": .string(AppLanguage.nativeNames[language.deviceLanguage] ?? "")]))
                                        .font(.footnote)
                                        .foregroundStyle(.secondary)
                                }
                            }
                            Spacer()
                            if value == language.preference {
                                Image(systemName: "checkmark").fontWeight(.semibold).foregroundStyle(NativeStyle.tint)
                            }
                        }
                        .foregroundStyle(Color.primary)
                    }
                    .accessibilityAddTraits(value == language.preference ? .isSelected : [])
                }
            } footer: {
                Text(language.t("settings:language.description"))
            }
            .listRowBackground(NativeStyle.card)
        }
        .listStyle(.insetGrouped)
        .scrollContentBackground(.hidden)
        .background(NativeStyle.canvas)
        .nativeTabBarRoom()
        .navigationTitle(language.t("settings:language.title"))
    }
}
