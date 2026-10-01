// What UIKit draws for SwiftUI and takes from appearance settings: the
// navigation bars' large and inline titles in the brand's heading face
// (Poppins; Manrope for Greek), and the coral tint of system alerts and
// confirmation dialogs. Set once at launch and again when the language
// changes; then the bars already on screen take the new face too (`refresh`),
// so a title doesn't keep the old language's face until its page is rebuilt.
import SwiftUI
import UIKit

extension NativeStyle {
    static func installAppearance(lang: String, refresh: Bool = false) {
        let bar = UINavigationBar.appearance()
        let bold = lang == "el" ? "Manrope-Bold" : "Poppins-Bold"
        let semibold = lang == "el" ? "Manrope-SemiBold" : "Poppins-SemiBold"
        let large = UIFont(name: bold, size: 32) ?? .systemFont(ofSize: 34, weight: .bold)
        let inline = UIFont(name: semibold, size: 17) ?? .systemFont(ofSize: 17, weight: .semibold)
        let largeAttributes: [NSAttributedString.Key: Any] = [.font: UIFontMetrics(forTextStyle: .largeTitle).scaledFont(for: large)]
        let inlineAttributes: [NSAttributedString.Key: Any] = [.font: UIFontMetrics(forTextStyle: .headline).scaledFont(for: inline)]
        bar.largeTitleTextAttributes = largeAttributes
        bar.titleTextAttributes = inlineAttributes
        UIView.appearance(whenContainedInInstancesOf: [UIAlertController.self]).tintColor = UIColor(tint)
        guard refresh else { return }
        for scene in UIApplication.shared.connectedScenes {
            guard let windows = (scene as? UIWindowScene)?.windows else { continue }
            for window in windows {
                restyle(window, large: largeAttributes, inline: inlineAttributes)
            }
        }
    }

    /// Every navigation bar under `view` in the new face.
    private static func restyle(_ view: UIView, large: [NSAttributedString.Key: Any],
                                inline: [NSAttributedString.Key: Any]) {
        if let bar = view as? UINavigationBar {
            bar.largeTitleTextAttributes = large
            bar.titleTextAttributes = inline
        }
        for child in view.subviews { restyle(child, large: large, inline: inline) }
    }
}
