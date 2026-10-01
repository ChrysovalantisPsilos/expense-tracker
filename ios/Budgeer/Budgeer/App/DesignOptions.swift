// The two designs still being chosen between, for Activity and the Groups
// tab: an internal switch, never shown to the user. The snapshots draw both;
// once the owner picks, the other design and this switch go.
import Foundation

enum DesignOption: String, CaseIterable, Sendable {
    case a
    case b
}

@MainActor
enum DesignOptions {
    /// Activity: A (a card per day under the month's header) or B (one list
    /// under glass day headers, with the month's running line).
    static var activity: DesignOption = .a
    /// Groups: A (a grid of square cards) or B (paging cards, then the rest).
    static var groups: DesignOption = .a
}
