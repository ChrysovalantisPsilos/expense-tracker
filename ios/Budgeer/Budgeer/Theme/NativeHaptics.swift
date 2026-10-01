// A tap of haptics for what ends with the sheet closing (a save, a
// settlement), where a view's own sensoryFeedback would go with it.
import UIKit

enum NativeHaptics {
    @MainActor
    static func success() {
        UINotificationFeedbackGenerator().notificationOccurred(.success)
    }
}
