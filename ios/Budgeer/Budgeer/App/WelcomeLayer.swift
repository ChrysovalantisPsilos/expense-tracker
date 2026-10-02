// What greets a signed-in account over the frame (WelcomeModel, TourModel):
// the setup wizard or the What's new story full screen, the ask to add a
// passkey (a sheet, once the story is closed), and the tour's coach marks
// over the tabs. The pages mark what the tour points at (tourTarget)
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
    /// The passkey ask on screen (it waits for the story's cover to go).
    @State private var askingPasskey = false

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
            .sheet(isPresented: $askingPasskey, onDismiss: {
                if welcome.passkeyAsk { Task { await welcome.closePasskeyAsk() } }
            }) {
                PasskeyAskView(welcome: welcome)
                    .environment(language)
            }
            .task(id: welcome.passkeyAsk && welcome.story == nil && !welcome.wizard) {
                guard welcome.passkeyAsk, welcome.story == nil, !welcome.wizard else {
                    askingPasskey = false
                    return
                }
                // After the story's cover has gone, never over it.
                try? await Task.sleep(nanoseconds: 600_000_000)
                if !Task.isCancelled { askingPasskey = true }
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

/// The web's PasskeyPrompt: log in faster with a passkey, "Don't remind me
/// again", then Not now or Create passkey.
@MainActor
private struct PasskeyAskView: View {
    @Bindable var welcome: WelcomeModel
    @Environment(AppLanguage.self) private var language
    /// The sheet is as tall as what it says, not half the screen.
    @State private var height: CGFloat = 300

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            HStack(spacing: 12) {
                NativeIconTile(symbol: "person.badge.key.fill", color: NativeTone.coral)
                Text(language.t("settings:passkeyPrompt.title"))
                    .font(NativeStyle.title(20, lang: language.current))
            }
            Text(language.t("settings:passkeyPrompt.body")).foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)
            Toggle(language.t("settings:passkeyPrompt.never"), isOn: $welcome.passkeyNever)
                .tint(NativeStyle.tint)
                .accessibilityIdentifier("passkeyAsk.never")
            if welcome.passkeyNever {
                Text(language.t("settings:passkeyPrompt.later")).font(.footnote).foregroundStyle(.secondary)
            }
            if let problem = welcome.passkeyAskProblem {
                Text(problem).font(.footnote.weight(.semibold)).foregroundStyle(NativeStyle.negative)
            }
            HStack(spacing: 10) {
                Button {
                    Task { await welcome.closePasskeyAsk() }
                } label: {
                    Text(language.t("settings:passkeyPrompt.notNow")).frame(maxWidth: .infinity)
                }
                .nativeGlassButton()
                .accessibilityIdentifier("passkeyAsk.notNow")
                Button {
                    Task { await welcome.createAskedPasskey() }
                } label: {
                    Group {
                        if welcome.busy {
                            ProgressView().tint(Color.white)
                        } else {
                            Label(language.t("settings:passkeyPrompt.create"), systemImage: "person.badge.key")
                        }
                    }
                    .frame(maxWidth: .infinity)
                }
                .nativeGlassButton(prominent: true)
                .disabled(welcome.busy)
                .accessibilityIdentifier("passkeyAsk.create")
            }
        }
        .padding(24)
        .padding(.top, 8)
        .fixedSize(horizontal: false, vertical: true)
        .onGeometryChange(for: CGFloat.self) { $0.size.height } action: { height = $0 }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
        .background(NativeStyle.canvas.ignoresSafeArea())
        .presentationDetents([.height(height)])
        .presentationDragIndicator(.visible)
    }
}

extension View {
    /// The wizard, What's new and the tour over the signed-in frame.
    @MainActor
    func welcomeLayer(welcome: WelcomeModel, tour: TourModel, router: AppRouter) -> some View {
        modifier(WelcomeLayer(welcome: welcome, tour: tour, router: router))
    }
}
