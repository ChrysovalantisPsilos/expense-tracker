// The app tour drawn over the real tabs (TourModel): each stop opens its
// tab and page, then dims the screen around what it is about (a soft
// rounded hole) with a card of the stop's words, "Step 3 of 12", Skip,
// Back and Next (Done on the last). Pages mark what a stop points at with
// tourTarget (the web's data-tour names); the tab bar's tabs, Add and the
// bell and initials are found by the frame's own layout. A marked stop
// whose mark doesn't show within a moment is passed, as on the web.
import SwiftUI

/// Where each marked view sits on screen (window coordinates), by its tour name.
@MainActor
@Observable
final class TourTargets {
    private(set) var frames: [String: CGRect] = [:]

    func set(_ names: [String], _ frame: CGRect) {
        for name in names where frames[name] != frame { frames[name] = frame }
    }

    func clear(_ names: [String]) {
        for name in names { frames[name] = nil }
    }
}

@MainActor
private struct TourTargetModifier: ViewModifier {
    let names: [String]
    @Environment(TourTargets.self) private var targets: TourTargets?

    func body(content: Content) -> some View {
        content.background {
            GeometryReader { proxy in
                Color.clear
                    .onAppear { targets?.set(names, proxy.frame(in: .global)) }
                    .onChange(of: proxy.frame(in: .global)) { _, frame in targets?.set(names, frame) }
                    .onDisappear { targets?.clear(names) }
            }
        }
    }
}

extension View {
    /// Marks this view as what the tour's stops called `names` point at.
    func tourTarget(_ names: String...) -> some View {
        modifier(TourTargetModifier(names: names))
    }
}

@MainActor
struct TourOverlay: View {
    let tour: TourModel
    let targets: TourTargets
    let router: AppRouter
    @Environment(AppLanguage.self) private var language
    /// The stop whose mark was found (or needs none), so the card shows.
    @State private var shown: String?

    var body: some View {
        GeometryReader { proxy in
            let origin = proxy.frame(in: .global).origin
            let insets = proxy.safeAreaInsets
            let size = proxy.size
            if let stop = tour.current {
                let mark = TourMark.of(stop).mark
                let hole = shown == stop.id ? self.hole(mark, size: size, insets: insets, origin: origin) : nil
                ZStack {
                    Path { path in
                        path.addRect(CGRect(origin: .zero, size: size))
                        if let hole { path.addRoundedRect(in: hole, cornerSize: CGSize(width: 16, height: 16)) }
                    }
                    .fill(Color.black.opacity(0.42), style: FillStyle(eoFill: true))
                    .contentShape(Rectangle())
                    .onTapGesture {}
                    .animation(.snappy, value: hole)
                    if shown == stop.id {
                        place(card(stop), mark: mark, hole: hole, size: size, insets: insets)
                            .transition(.opacity)
                    }
                }
            }
        }
        .ignoresSafeArea()
        .task(id: tour.index) { await arrive() }
        .accessibilityAddTraits(.isModal)
    }

    /// Open the stop's page, then wait for its mark (about a second), else pass it.
    private func arrive() async {
        shown = nil
        guard let stop = tour.current else { return }
        let (route, mark) = TourMark.of(stop)
        if let route { router.open(path: route) }
        guard case .view(let name) = mark else {
            try? await Task.sleep(nanoseconds: 350_000_000)
            shown = stop.id
            return
        }
        for _ in 0..<12 {
            try? await Task.sleep(nanoseconds: 100_000_000)
            if Task.isCancelled { return }
            if targets.frames[name] != nil {
                shown = stop.id
                return
            }
        }
        await tour.next()
    }

    /// The hole around the mark, in the overlay's space.
    private func hole(_ mark: TourMark, size: CGSize, insets: EdgeInsets, origin: CGPoint) -> CGRect? {
        switch mark {
        case .view(let name):
            return targets.frames[name]?.offsetBy(dx: -origin.x, dy: -origin.y).insetBy(dx: -6, dy: -6)
        case .tab(let tab):
            // The floating bar: four tabs in a capsule, then Add (NativeFloatingTabBar's layout).
            let bottom = size.height - insets.bottom - 4
            let addWidth: CGFloat = 62
            let barWidth = size.width - 32 - addWidth - 10
            if tab == .add {
                return CGRect(x: size.width - 16 - addWidth, y: bottom - addWidth, width: addWidth, height: addWidth)
                    .insetBy(dx: -4, dy: -4)
            }
            let slot = NativeTab.tabs.firstIndex(of: tab) ?? 0
            let width = barWidth / CGFloat(NativeTab.tabs.count)
            return CGRect(x: 16 + CGFloat(slot) * width, y: bottom - 62, width: width, height: 62)
        case .account:
            return CGRect(x: size.width - 104, y: insets.top, width: 96, height: 44)
        case .top, .centre:
            return nil
        }
    }

    /// The card under its hole (or over it when there's no room below), above the bar, or as the mark asks.
    @ViewBuilder
    private func place<Card: View>(_ card: Card, mark: TourMark, hole: CGRect?, size: CGSize,
                                   insets: EdgeInsets) -> some View {
        switch mark {
        case .tab:
            VStack(spacing: 0) {
                Spacer(minLength: 0)
                card
                Spacer().frame(height: insets.bottom + 84)
            }
        case .account, .top:
            VStack(spacing: 0) {
                Spacer().frame(height: insets.top + (mark == .top ? 120 : 56))
                card
                Spacer(minLength: 0)
            }
        case .view:
            if let hole, hole.maxY + 240 < size.height - insets.bottom {
                VStack(spacing: 0) {
                    Spacer().frame(height: max(insets.top, hole.maxY + 12))
                    card
                    Spacer(minLength: 0)
                }
            } else {
                VStack(spacing: 0) {
                    Spacer(minLength: 0)
                    card
                    Spacer().frame(height: max(insets.bottom + 84, size.height - (hole?.minY ?? size.height) + 12))
                }
            }
        case .centre:
            VStack(spacing: 0) {
                Spacer(minLength: 0)
                card
                Spacer(minLength: 0)
            }
        }
    }

    private func card(_ stop: TourStop) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(tour.counter.capsLabel)
                .font(.caption.weight(.semibold))
                .foregroundStyle(NativeStyle.tint)
            Text(stop.title).font(.headline)
            Text(stop.body).font(.subheadline).foregroundStyle(.secondary).fixedSize(horizontal: false, vertical: true)
            HStack(spacing: 10) {
                if !tour.isLast {
                    Button(language.t("common:actions.skip")) { Task { await finish() } }
                        .foregroundStyle(.secondary)
                        .accessibilityIdentifier("tour.skip")
                }
                Spacer(minLength: 0)
                if (tour.index ?? 0) > 0 {
                    Button(language.t("common:actions.back")) { tour.back() }
                        .accessibilityIdentifier("tour.back")
                }
                Button(language.t(tour.isLast ? "common:actions.done" : "common:actions.next")) {
                    Task {
                        if tour.isLast { await finish() } else { await tour.next() }
                    }
                }
                .fontWeight(.semibold)
                .buttonStyle(.borderedProminent)
                .tint(NativeStyle.solid)
                .accessibilityIdentifier("tour.next")
            }
            .padding(.top, 4)
        }
        .padding(18)
        .frame(maxWidth: 460, alignment: .leading)
        .background(NativeStyle.card, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
        .shadow(color: Color.black.opacity(0.18), radius: 24, x: 0, y: 8)
        .padding(.horizontal, 16)
        .accessibilityElement(children: .contain)
        .accessibilityLabel(language.t("common:tour.announce", ["n": .int((tour.index ?? 0) + 1),
                                                                "total": .int(tour.stops.count),
                                                                "title": .string(stop.title)]))
    }

    /// Skip or Done: marked seen, back where the tour started.
    private func finish() async {
        await tour.close()
        router.open(path: tour.returnTo)
    }
}
