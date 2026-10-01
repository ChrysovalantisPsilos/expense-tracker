// The floating Add is the only add button: a page whose own thing is added
// some other way (a budget on Budgets, a category on Categories, an expense
// in this group on a group's page, a recurring entry on Recurring) lends
// Add that action while it is on top of its tab, instead of carrying a + of
// its own in the bar. Every other page leaves Add as it is: a new entry.
import SwiftUI

/// What Add does on the page on top of a tab.
enum AddAction {
    /// Run the page's own add (open its sheet or editor).
    case run(() -> Void)
    /// Push a page onto the tab (a new category's page), worked out when Add is tapped.
    case push(() -> AppRoute)
}

/// One tab's lent action: the page that lent it, and what it does.
@MainActor
@Observable
final class AddSlot {
    private(set) var action: AddAction?
    private var owner: UUID?

    func lend(_ action: AddAction, owner: UUID) {
        self.action = action
        self.owner = owner
    }

    /// The page left the top: its action goes with it (a page that took over since keeps its own).
    func takeBack(owner: UUID) {
        guard self.owner == owner else { return }
        action = nil
        self.owner = nil
    }
}

private struct AddSlotKey: EnvironmentKey {
    static let defaultValue: AddSlot? = nil
}

extension EnvironmentValues {
    /// The tab's Add slot (AppFrame gives each tab its own).
    var addSlot: AddSlot? {
        get { self[AddSlotKey.self] }
        set { self[AddSlotKey.self] = newValue }
    }
}

private struct LendsAdd: ViewModifier {
    let action: AddAction
    @Environment(\.addSlot) private var slot
    @State private var owner = UUID()

    func body(content: Content) -> some View {
        content
            .onAppear { slot?.lend(action, owner: owner) }
            .onDisappear { slot?.takeBack(owner: owner) }
    }
}

extension View {
    /// While this page is on top of its tab, the floating Add does `action`.
    func lendsAdd(_ action: AddAction) -> some View {
        modifier(LendsAdd(action: action))
    }
}
