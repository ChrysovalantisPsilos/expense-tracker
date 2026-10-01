// A screen's live refresh (LiveHub): while it is on screen, a change to any
// of `tables` runs `refresh` (after the hub's debounce). The web's owned
// queries are live the same way while their page is mounted.
import SwiftUI

private struct LiveRefresh: ViewModifier {
    let hub: LiveHub
    let tables: Set<String>
    let refresh: @MainActor () async -> Void
    @State private var watching: UUID?

    func body(content: Content) -> some View {
        content
            .onAppear {
                if watching == nil { watching = hub.watch(tables, refresh: refresh) }
            }
            .onDisappear {
                if let watching { hub.unwatch(watching) }
                watching = nil
            }
    }
}

extension View {
    /// Refresh with `refresh` while on screen whenever one of `tables` changes.
    func liveRefresh(_ hub: LiveHub, tables: Set<String>, refresh: @escaping @MainActor () async -> Void) -> some View {
        modifier(LiveRefresh(hub: hub, tables: tables, refresh: refresh))
    }
}
