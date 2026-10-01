// The redesign put together for sign-off: the four tabs over the sample,
// with Add's sheet when it's open. Not the live app's root yet (RootView
// still shows the current screens); the snapshot tests render it so the
// owner can see each screen in light, dark and Greek before anything is
// wired to data.
import SwiftUI

struct NativeAppMock: View {
    let sample: NativeSample
    var swipe: NativeSwipePreview = .none
    var confirming: String? = nil
    var groupOpen = false
    var groupSettled = false
    @State private var tab: NativeTab
    @State private var adding: Bool
    @State private var detent: PresentationDetent

    init(sample: NativeSample, tab: NativeTab = .home, adding: Bool = false, expanded: Bool = false,
         swipe: NativeSwipePreview = .none, confirming: String? = nil, groupOpen: Bool = false,
         groupSettled: Bool = false) {
        self.sample = sample
        self.swipe = swipe
        self.confirming = confirming
        self.groupOpen = groupOpen
        self.groupSettled = groupSettled
        _tab = State(initialValue: tab)
        _adding = State(initialValue: adding)
        _detent = State(initialValue: expanded ? .large : .nativeAdd)
    }

    var body: some View {
        NativeTabs(tab: $tab, onAdd: { adding = true }) { item in
            page(item)
        }
        .tint(NativeStyle.tint)
        .sheet(isPresented: $adding) {
            NativeAddSheet(sample: sample, detent: $detent)
                .nativeAddPresentation(detent: $detent)
                .tint(NativeStyle.tint)
        }
    }

    @ViewBuilder
    private func page(_ item: NativeTab) -> some View {
        switch item {
        case .home, .add:
            NativeHomeView(sample: sample)
        case .activity:
            NativeActivityView(sample: sample, preview: swipe, confirming: confirming)
        case .groups:
            NativeGroupsView(sample: sample, open: groupOpen, settled: groupSettled)
        case .more:
            NativeMoreView(sample: sample)
        }
    }
}
