// The app tour (the web's ProductTour over tourSteps.js), stop by stop: a
// phone's stops in the web's order and words (tourSteps.tourStops), each
// one opening the tab and page it is about (AppPaths) before the coach
// mark shows over it. Finishing or skipping both mark it seen on the
// profile (profiles.tour_done, which follows the account to the website)
// and go back to where it started. A stop whose mark never shows (an empty
// Home has no By category) is skipped, as the web's Spotlight skips it.
import Foundation
import Observation
import BudgeerCore

/// One stop (tourSteps.tourStops): the page it needs, what it points at, its words.
struct TourStop: Decodable, Equatable, Identifiable {
    let id: String
    /// The web address the stop is about (nil: stay where the last one was).
    let route: String?
    /// The web's data-tour name of what it points at (nil: a card in the middle).
    let target: String?
    let title: String
    let body: String
}

/// What a stop points at in the app.
enum TourMark: Equatable {
    /// A view marked with tourTarget.
    case view(String)
    /// A tab in the floating bar, or Add beside it.
    case tab(NativeTab)
    /// The bell and your initials, top right.
    case account
    /// A card near the top (Activity's search sits under the title).
    case top
    /// A card in the middle.
    case centre

    /// The page a stop opens and what it points at, by the web's stop id.
    static func of(_ stop: TourStop) -> (route: String?, mark: TourMark) {
        switch stop.id {
        case "add-expense": return (stop.route, .tab(.add))
        case "search": return (stop.route, .top)
        case "groups": return (nil, .tab(.groups))
        case "more": return (nil, .tab(.more))
        // Budgets live on Home in the app.
        case "budgets": return ("/", .view("budgets"))
        case "account": return (nil, .account)
        default: return (stop.route, stop.target.map { .view($0) } ?? .centre)
        }
    }
}

@MainActor
@Observable
final class TourModel {
    private(set) var stops: [TourStop] = []
    /// The stop shown, nil while no tour runs.
    private(set) var index: Int?
    /// Where the tour ends up (where it started, or a group made in the wizard).
    private(set) var returnTo = "/"

    private var tourDone = false
    private let data: DataLayer
    private let core: BudgeerCore

    init(data: DataLayer, core: BudgeerCore = .shared) {
        self.data = data
        self.core = core
    }

    var running: Bool { index != nil }

    var current: TourStop? {
        guard let index, stops.indices.contains(index) else { return nil }
        return stops[index]
    }

    var isLast: Bool { index.map { $0 >= stops.count - 1 } ?? false }

    /// "Step 3 of 12" (common:tour.step).
    var counter: String {
        core.text("common:tour.step", ["n": .int((index ?? 0) + 1), "total": .int(stops.count)])
    }

    /// Start (or restart) the tour; it ends on `returnTo`.
    func start(returnTo: String) async {
        stops = (try? core.call("tourSteps", "tourStops", ["mobile"]) as [TourStop]) ?? []
        tourDone = ((try? await data.profile.profile())?["tour_done"]?.boolValue) == true
        self.returnTo = returnTo
        index = stops.isEmpty ? nil : 0
    }

    /// Next (Done on the last stop); also how a stop whose mark isn't on screen is passed.
    func next() async {
        guard let index else { return }
        if index >= stops.count - 1 { await close() } else { self.index = index + 1 }
    }

    func back() {
        guard let index, index > 0 else { return }
        self.index = index - 1
    }

    /// Skip or Done: the tour ends and is marked seen (once; a failed write
    /// offers it again next time, as on the web).
    func close() async {
        index = nil
        guard !tourDone else { return }
        if (try? await data.profile.updateProfile(["tour_done": true])) != nil { tourDone = true }
    }
}
