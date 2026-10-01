// A tap of haptics for what ends with the sheet closing (a save, a
// settlement), where a view's own sensoryFeedback would go with it, and
// the buzz of a wrong PIN.
import UIKit

enum NativeHaptics {
    @MainActor
    static func success() {
        UINotificationFeedbackGenerator().notificationOccurred(.success)
    }

    @MainActor
    static func warning() {
        UINotificationFeedbackGenerator().notificationOccurred(.warning)
    }
}
