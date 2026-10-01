// What greets a signed-in account over the frame (WelcomeModel, TourModel):
// the setup wizard or the What's new story full screen, and the tour's coach
// marks over the tabs. The pages mark what the tour points at (tourTarget)
// through the environment's TourTargets. Where the wizard, the story's
// actions and the tour lead is the router's (AppPaths).
import SwiftUI

/// The full-screen greeting up, if any.
private enum Greeting: Identifiable {
    case wizard
    case story(WhatsNewStory)

    var id: String {
        switch self {
        case .wizard: return "wizard"
        case .story(let story): return "story-\(story.id)"
        }
    }
}

@MainActor
private struct WelcomeLayer: ViewModifier {
    let welcome: WelcomeModel
    let tour: TourModel
    let router: AppRouter
    @Environment(AppLanguage.self) private var language
    @State private var targets = TourTargets()

    func body(content: Content) -> some View {
        content
            .environment(targets)
            .overlay {
                if tour.running {
                    TourOverlay(tour: tour, targets: targets, router: router)
                        .environment(language)
                        .transition(.opacity)
                }
            }
            .animation(.easeInOut(duration: 0.2), value: tour.running)
            .fullScreenCover(item: greeting) { greeting in
                switch greeting {
                case .wizard:
                    OnboardingView(model: welcome).environment(language)
                case .story(let story):
                    WhatsNewStoryView(story: story) { path in
                        welcome.story = nil
                        if let path { router.open(path: path) }
                    }
                    .environment(language)
                }
            }
            .task { await welcome.greet() }
            .onChange(of: welcome.tourRequest) { _, request in
                guard let request else { return }
                welcome.tourRequest = nil
                Task { await tour.start(returnTo: request) }
            }
            .onChange(of: welcome.openAfter) { _, path in
                guard let path else { return }
                welcome.openAfter = nil
                router.open(path: path)
            }
    }

    private var greeting: Binding<Greeting?> {
        Binding(get: {
            if welcome.wizard { return .wizard }
            return welcome.story.map { .story($0) }
        }, set: { value in
            // Swiped away: a story is closed (the wizard can't be).
            if value == nil { welcome.story = nil }
        })
    }
}

extension View {
    /// The wizard, What's new and the tour over the signed-in frame.
    func welcomeLayer(welcome: WelcomeModel, tour: TourModel, router: AppRouter) -> some View {
        modifier(WelcomeLayer(welcome: welcome, tour: tour, router: router))
    }
}
