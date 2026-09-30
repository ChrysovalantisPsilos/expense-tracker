// Pictures of Sign-in and Home (light, dark, Greek) with the fixture's fake
// data, at an iPhone 15's size. Each PNG is attached to the test and, when
// SNAPSHOT_DIR is set (CI passes it as TEST_RUNNER_SNAPSHOT_DIR), written
// there for the workflow's artifact. Nothing is compared: these are for
// looking at.
import SwiftUI
import XCTest
import BudgeerCore
@testable import Budgeer

@MainActor
final class SnapshotTests: XCTestCase {
    private static let size = CGSize(width: 393, height: 852)

    override func tearDown() {
        try? BudgeerCore.shared.setLanguage("en")
        super.tearDown()
    }

    func testSignInSnapshots() throws {
        for (lang, dark) in [("en", false), ("en", true), ("el", false)] {
            let language = language(lang)
            let session = SessionStore(auth: FakeAuthService())
            let view = SignInView(model: SignInViewModel(), session: session).environment(language)
            try snapshot(view, name: "signin-\(lang)\(dark ? "-dark" : "")", dark: dark)
        }
    }

    func testHomeSnapshots() async throws {
        let fixture = try HomeFixture.load()
        for (lang, dark) in [("en", false), ("en", true), ("el", false)] {
            let language = language(lang)
            let now = fixture.now
            let model = HomeViewModel(data: FakeStore(home: fixture).data, core: .shared, now: { now })
            await model.load()
            XCTAssertEqual(model.state, .loaded(try XCTUnwrap(fixture.expected[lang])))
            let view = HomeView(model: model).environment(language)
            try snapshot(view, name: "home-\(lang)\(dark ? "-dark" : "")", dark: dark)
        }
    }

    private func language(_ lang: String) -> AppLanguage {
        let defaults = UserDefaults(suiteName: "SnapshotTests")!
        return AppLanguage(preference: lang, defaults: defaults, deviceLanguages: ["en"])
    }

    private func snapshot<V: View>(_ view: V, name: String, dark: Bool) throws {
        let host = UIHostingController(rootView: view)
        host.overrideUserInterfaceStyle = dark ? .dark : .light
        // A window in the host app's scene, so it is really on screen and
        // drawHierarchy has something to draw.
        let scene = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }.first
        let window = scene.map { UIWindow(windowScene: $0) } ?? UIWindow(frame: .zero)
        window.frame = CGRect(origin: .zero, size: SnapshotTests.size)
        window.overrideUserInterfaceStyle = dark ? .dark : .light
        window.rootViewController = host
        window.makeKeyAndVisible()
        host.view.layoutIfNeeded()
        // Let SwiftUI settle its first layout and the tab bar's rendering.
        RunLoop.main.run(until: Date(timeIntervalSinceNow: 0.6))
        let image = UIGraphicsImageRenderer(bounds: window.bounds).image { context in
            if !window.drawHierarchy(in: window.bounds, afterScreenUpdates: true) {
                window.layer.render(in: context.cgContext)
            }
        }
        let data = try XCTUnwrap(image.pngData())
        let attachment = XCTAttachment(image: image)
        attachment.name = name
        attachment.lifetime = .keepAlways
        add(attachment)
        if let dir = ProcessInfo.processInfo.environment["SNAPSHOT_DIR"], !dir.isEmpty {
            let folder = URL(fileURLWithPath: dir, isDirectory: true)
            try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
            try data.write(to: folder.appendingPathComponent("\(name).png"))
        }
        window.isHidden = true
    }
}
