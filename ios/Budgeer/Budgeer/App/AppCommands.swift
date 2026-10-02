// The keyboard's commands (an iPad's keyboard, a Mac-style keyboard on an
// iPhone): ⌘N adds (what the toolbar's or the tab bar's Add does), ⌘F
// searches Activity, ⌘1…⌘9 open the sidebar's places in its order and ⌘,
// Settings. They show in the overlay that holding ⌘ brings up, and in the
// menu bar on iPadOS 26. Esc closes a sheet (its Cancel or close button's
// .cancelAction shortcut). They act on the router of the window in front
// (AppRouter through FocusedValues); the words are the web's.
import SwiftUI

struct AppCommands: Commands {
    let language: AppLanguage
    @FocusedValue(\.appRouter) private var router

    var body: some Commands {
        CommandGroup(replacing: .newItem) {
            Button(language.t("ios:native.tabs.add")) { router?.pressAdd() }
                .keyboardShortcut("n")
                .disabled(router == nil)
        }
        CommandGroup(after: .textEditing) {
            Button(language.t("transactions:ledger.search")) { router?.pressSearch() }
                .keyboardShortcut("f")
                .disabled(router == nil)
        }
        CommandMenu(language.t("ios:native.wide.go")) {
            let items = router?.sections ?? SidebarSection.items(vouchers: false)
            ForEach(items + [.settings]) { section in
                if let key = SidebarSection.shortcut(section, in: items) {
                    Button(language.t(section.titleKey)) { router?.go(section) }
                        .keyboardShortcut(KeyEquivalent(key))
                        .disabled(router == nil)
                }
            }
        }
    }
}
