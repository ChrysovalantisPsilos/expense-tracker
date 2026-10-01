// Settings › Appearance: light, dark or the phone's (themePref.appearancePrefs),
// kept on this device as the web keeps it per browser. The choice pins every
// window's style; "system" lets the phone decide again.
import SwiftUI
import UIKit

enum AppAppearance {
    /// The UserDefaults key (@AppStorage) of the choice: 'light', 'dark' or 'system'.
    static let key = "appearance"
    static let system = "system"

    /// The windows' style for a choice.
    static func style(_ pref: String) -> UIUserInterfaceStyle {
        switch pref {
        case "light": return .light
        case "dark": return .dark
        default: return .unspecified
        }
    }

    /// Every window of the app in the chosen style.
    @MainActor
    static func apply(_ pref: String) {
        for scene in UIApplication.shared.connectedScenes {
            guard let windows = (scene as? UIWindowScene)?.windows else { continue }
            for window in windows { window.overrideUserInterfaceStyle = style(pref) }
        }
    }
}
