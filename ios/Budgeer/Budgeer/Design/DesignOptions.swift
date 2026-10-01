// Design round 3: two takes (A and B) on a few screens, side by side in the
// real app until the owner picks one of each; the losing take is deleted
// then. Option A is the default. To try B on a phone, pass it as a launch
// argument in the scheme (Run › Arguments), e.g. `-design.home b`, which
// lands in UserDefaults; the snapshot tests set it through the environment.
import SwiftUI

enum DesignOption: String, Sendable {
    case a
    case b
}

/// Which take each piece shows.
struct DesignOptions: Equatable, Sendable {
    /// Home's order and structure.
    var home: DesignOption = .a
    /// Home's By category: a ranked list (A) or a donut with its legend (B).
    var categories: DesignOption = .a
    /// Home's Meal vouchers card.
    var vouchers: DesignOption = .a
    /// The lock screen.
    var lock: DesignOption = .a
    /// Your salary's If things go on and Against prices.
    var salary: DesignOption = .a
    /// For the pictures: what a take folds behind a tap, shown open.
    var unfolded = false

    /// Every piece on one take.
    static func all(_ option: DesignOption) -> DesignOptions {
        DesignOptions(home: option, categories: option, vouchers: option, lock: option, salary: option)
    }

    /// The launch arguments' picks (`-design.<piece> b`), A for anything unset.
    static func stored(_ defaults: UserDefaults = .standard) -> DesignOptions {
        let pick = { (piece: String) in DesignOption(rawValue: defaults.string(forKey: "design.\(piece)") ?? "") ?? .a }
        return DesignOptions(home: pick("home"), categories: pick("categories"), vouchers: pick("vouchers"),
                             lock: pick("lock"), salary: pick("salary"))
    }
}

private struct DesignOptionsKey: EnvironmentKey {
    static let defaultValue = DesignOptions.stored()
}

extension EnvironmentValues {
    /// The takes this part of the app shows (DesignOptions).
    var design: DesignOptions {
        get { self[DesignOptionsKey.self] }
        set { self[DesignOptionsKey.self] = newValue }
    }
}
